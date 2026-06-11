import { ref } from 'vue'
import { db } from '../db/index.js'

/**
 * 自动备份系统
 *
 * 特性：
 * - 游戏进程中定期自动保存备份到 IndexedDB
 * - 备份文件命名：模组名-角色名-D{天数}.txt
 * - 备份内容：对话、选项、骰子结果、属性变化
 * - 不受普通重置功能影响（独立表）
 * - 仅可在设置页面手动删除
 */
export function useBackup() {
  const lastBackupTime = ref(0)
  const backupInterval = 5 * 60 * 1000 // 每 5 分钟自动备份
  const minEventsBetweenBackups = 2     // 至少经过 2 个事件才备份

  let eventCounter = 0

  /** 标记一个事件已发生 */
  function markEvent() {
    eventCounter++
  }

  /**
   * 生成备份文件名
   */
  function generateFilename(sessionName, characterNames, dayCount) {
    const modName = sessionName?.replace(/[\\/:*?"<>|]/g, '-') || '冒险'
    const charName = (characterNames || ['未知角色'])[0]?.replace(/[\\/:*?"<>|]/g, '-') || '角色'
    return `${modName}-${charName}-D${String(dayCount).padStart(3, '0')}.txt`
  }

  /**
   * 生成备份文本内容
   */
  async function generateBackupContent(sessionId, dayCycleSnapshot) {
    const [messages, diceLogs, characters] = await Promise.all([
      db.messages.where('sessionId').equals(sessionId).sortBy('timestamp'),
      db.diceLogs.where('sessionId').equals(sessionId).sortBy('timestamp'),
      db.characters.where('sessionId').equals(sessionId).toArray()
    ])

    const now = new Date().toLocaleString('zh-CN')
    let content = `═══════════════════════════════════════
跑团存档备份
═══════════════════════════════════════
备份时间：${now}
游戏日期：${dayCycleSnapshot?.dateString || '未知'}
游戏天数：第 ${dayCycleSnapshot?.dayCount ?? '?'} 天
今日事件：${dayCycleSnapshot?.eventsToday ?? '?'}/${dayCycleSnapshot?.maxEventsPerDay ?? '4'}
═══════════════════════════════════════

`

    // 角色状态
    if (characters.length > 0) {
      content += `=== 角色状态 ===\n`
      for (const char of characters) {
        content += `【${char.name}】${char.race} ${char.class} Lv.${char.level}\n`
        content += `HP: ${char.hp}/${char.maxHp} | MP: ${char.mp || 0}/${char.maxMp || 0}\n`
        content += `属性: 力${char.str} 敏${char.dex} 体${char.con} 智${char.int} 感${char.wis} 魅${char.cha}\n`
        content += `装备: ${(char.equipment || []).join('、') || '无'}\n`
        content += `状态: ${char.status || '正常'}\n\n`
      }
    }

    // 骰子记录
    if (diceLogs.length > 0) {
      content += `=== 骰子记录 (${diceLogs.length}条) ===\n`
      for (const log of diceLogs.slice(-50)) {
        const time = new Date(log.timestamp).toLocaleTimeString('zh-CN')
        content += `[${time}] ${log.expression}: ${log.results?.join(',') || '?'} = ${log.total}\n`
      }
      content += `\n`
    }

    // 对话记录
    if (messages.length > 0) {
      content += `=== 对话记录 (${messages.length}条) ===\n`
      const roleLabels = { user: '玩家', assistant: 'DM', system: '系统', dice: '骰子' }
      for (const msg of messages) {
        const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN')
        const role = roleLabels[msg.role] || msg.role
        content += `\n--- ${role} [${time}] ---\n${msg.content}\n`
      }
    }

    content += `\n═══════════════════════════════════════
备份结束
═══════════════════════════════════════\n`

    return content
  }

  /**
   * 执行备份 — 存储到 IndexedDB backups 表
   */
  async function performBackup(sessionId, sessionName, characterNames, dayCycleSnapshot) {
    try {
      const filename = generateFilename(sessionName, characterNames, dayCycleSnapshot?.dayCount || 0)
      const content = await generateBackupContent(sessionId, dayCycleSnapshot)

      // 检查是否已有同名备份（同一天），有则更新
      const existing = await db.backups
        .where('sessionId').equals(sessionId)
        .filter(b => b.filename === filename)
        .first()

      if (existing) {
        await db.backups.update(existing.id, {
          content,
          createdAt: Date.now()
        })
      } else {
        await db.backups.add({
          sessionId,
          filename,
          content,
          createdAt: Date.now()
        })
      }

      lastBackupTime.value = Date.now()
      eventCounter = 0
      console.log('[Backup] 已保存:', filename)
      return filename
    } catch (e) {
      console.error('[Backup] 保存失败:', e)
      return null
    }
  }

  /**
   * 检查是否应该自动备份
   */
  function shouldAutoBackup() {
    const timeSince = Date.now() - lastBackupTime.value
    return timeSince >= backupInterval && eventCounter >= minEventsBetweenBackups
  }

  /**
   * 尝试自动备份（条件满足时执行）
   */
  async function tryAutoBackup(sessionId, sessionName, characterNames, dayCycleSnapshot) {
    if (shouldAutoBackup()) {
      return await performBackup(sessionId, sessionName, characterNames, dayCycleSnapshot)
    }
    return null
  }

  /**
   * 获取指定会话的所有备份列表
   */
  async function getBackups(sessionId) {
    return await db.backups.where('sessionId').equals(sessionId).reverse().sortBy('createdAt')
  }

  /**
   * 获取所有备份列表
   */
  async function getAllBackups() {
    return await db.backups.orderBy('createdAt').reverse().toArray()
  }

  /**
   * 删除指定备份
   */
  async function deleteBackup(backupId) {
    await db.backups.delete(backupId)
  }

  /**
   * 清空所有备份
   */
  async function clearAllBackups() {
    await db.backups.clear()
  }

  /**
   * 导出备份为可下载的文本文件
   */
  function downloadBackup(backup) {
    const blob = new Blob([backup.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = backup.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return {
    lastBackupTime,
    markEvent, performBackup, tryAutoBackup, shouldAutoBackup,
    getBackups, getAllBackups, deleteBackup, clearAllBackups,
    downloadBackup, generateBackupContent
  }
}
