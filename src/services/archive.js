/**
 * 存档服务 — 完整的存档/读档/回退引擎
 *
 * 存档结构：模组 → 角色 → 天数（三级分类）
 * 内容：全量对话 + 角色属性快照 + 骰子记录 + 属性变化历史
 * 限制：每角色最多10个存档(超过覆盖最旧) / 每模组最多9个角色
 * 自动存档：游戏天数+1触发
 */
import { db } from '../db/index.js'

const MAX_ARCHIVES_PER_CHAR = 10
const MAX_CHARS_PER_MODULE = 9

/**
 * 创建一个完整存档
 */
export async function createArchive(sessionId, characterId, options = {}) {
  const {
    moduleName = '',
    characterName = '',
    dayCount = 0,
    force = false
  } = options

  // 收集存档数据
  const [messages, diceLogs, character] = await Promise.all([
    db.messages.where('sessionId').equals(sessionId).sortBy('timestamp'),
    db.diceLogs.where('sessionId').equals(sessionId).filter(l => !characterId || l.characterId === characterId).sortBy('timestamp'),
    characterId ? db.characters.get(characterId) : null
  ])

  const allCharacters = await db.characters.where('sessionId').equals(sessionId).toArray()

  const snapshot = {
    moduleName,
    characterName: character?.name || characterName,
    dayCount,
    createdAt: Date.now(),
    createdAtBJ: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    messages: messages.map(m => ({
      role: m.role, content: m.content, type: m.type,
      characterId: m.characterId, timestamp: m.timestamp
    })),
    diceLogs: diceLogs.map(d => ({
      expression: d.expression, results: d.results,
      total: d.total, timestamp: d.timestamp
    })),
    characterSnapshot: character ? { ...character } : null,
    allCharacters: allCharacters.map(c => ({ ...c })),
    // 保存最后一条 AI 消息(含未选项)以便恢复
    lastAssistantMessage: [...messages].reverse().find(m => m.role === 'assistant')?.content || ''
  }

  // 检查存档数量上限
  const existingArchives = await db.archives
    .where('[sessionId+characterId]')
    .equals([sessionId, characterId || 0])
    .count()

  if (existingArchives >= MAX_ARCHIVES_PER_CHAR && !force) {
    // 删除最旧存档
    const oldest = await db.archives
      .where('[sessionId+characterId]')
      .equals([sessionId, characterId || 0])
      .sortBy('createdAt')
    if (oldest.length > 0) {
      await db.archives.delete(oldest[0].id)
    }
  }

  const id = await db.archives.add({
    sessionId,
    characterId: characterId || 0,
    moduleName: snapshot.moduleName,
    characterName: snapshot.characterName,
    dayCount: snapshot.dayCount,
    createdAt: snapshot.createdAt,
    content: JSON.stringify(snapshot)
  })

  console.log('[Archive] 已保存:', snapshot.characterName, 'D' + snapshot.dayCount, 'ID:', id)
  return { id, snapshot }
}

/**
 * 读取存档（不解压，返回元数据列表）
 */
export async function listArchives(sessionId = null, characterId = null) {
  let query = db.archives
  if (sessionId != null && characterId != null) {
    query = query.where('[sessionId+characterId]').equals([sessionId, characterId])
  } else if (sessionId != null) {
    query = query.where('sessionId').equals(sessionId)
  }
  const archives = await query.reverse().sortBy('createdAt')
  return archives.map(a => ({
    id: a.id,
    sessionId: a.sessionId,
    characterId: a.characterId,
    moduleName: a.moduleName,
    characterName: a.characterName,
    dayCount: a.dayCount,
    createdAt: a.createdAt,
    createdAtBJ: a.createdAtBJ || new Date(a.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  }))
}

/**
 * 获取存档的完整内容
 */
export async function getArchiveContent(archiveId) {
  const archive = await db.archives.get(archiveId)
  if (!archive) return null
  return {
    ...archive,
    snapshot: JSON.parse(archive.content || '{}')
  }
}

/**
 * 恢复到指定存档
 * @returns {Object} 恢复后的状态
 */
export async function restoreArchive(archiveId) {
  const archive = await db.archives.get(archiveId)
  if (!archive) throw new Error('存档不存在')

  const snapshot = JSON.parse(archive.content || '{}')
  const { sessionId, characterId } = archive

  // 1. 清空当前会话的消息和骰子记录
  await db.messages.where('sessionId').equals(sessionId).delete()
  await db.diceLogs.where('sessionId').equals(sessionId).delete()

  // 2. 恢复消息
  if (snapshot.messages?.length) {
    await db.messages.bulkAdd(
      snapshot.messages.map(m => ({ ...m, sessionId, id: undefined }))
    )
  }

  // 3. 恢复骰子记录
  if (snapshot.diceLogs?.length) {
    await db.diceLogs.bulkAdd(
      snapshot.diceLogs.map(d => ({ ...d, sessionId, characterId, id: undefined }))
    )
  }

  // 4. 恢复角色快照
  if (snapshot.characterSnapshot?.id) {
    await db.characters.update(snapshot.characterSnapshot.id, snapshot.characterSnapshot)
  }
  if (snapshot.allCharacters?.length) {
    for (const c of snapshot.allCharacters) {
      if (c.id) await db.characters.update(c.id, c).catch(() => {})
    }
  }

  // 5. 更新会话
  await db.sessions.update(sessionId, { updatedAt: Date.now() })

  console.log('[Archive] 已恢复: 存档ID', archiveId, 'D' + snapshot.dayCount)
  return { sessionId, characterId, snapshot }
}

/**
 * 删除指定存档
 */
export async function deleteArchive(archiveId) {
  await db.archives.delete(archiveId)
  console.log('[Archive] 已删除:', archiveId)
}

/**
 * 删除指定会话的全部存档
 */
export async function clearSessionArchives(sessionId) {
  await db.archives.where('sessionId').equals(sessionId).delete()
}

/**
 * 获取按模组-角色分组的存档列表
 */
export async function getArchivesGrouped() {
  const all = await db.archives.orderBy('createdAt').reverse().toArray()
  const grouped = {}

  for (const a of all) {
    const modKey = a.moduleName || '未知模组'
    const charKey = a.characterName || '未知角色'
    if (!grouped[modKey]) grouped[modKey] = {}
    if (!grouped[modKey][charKey]) grouped[modKey][charKey] = []
    grouped[modKey][charKey].push({
      id: a.id,
      sessionId: a.sessionId,
      characterId: a.characterId,
      dayCount: a.dayCount,
      createdAt: a.createdAt,
      createdAtBJ: a.createdAtBJ || new Date(a.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    })
  }

  return grouped
}

/**
 * 检查模组角色数量上限
 */
export async function checkCharLimit(sessionId) {
  const chars = await db.characters.where('sessionId').equals(sessionId).count()
  return { count: chars, max: MAX_CHARS_PER_MODULE, canCreate: chars < MAX_CHARS_PER_MODULE }
}

/**
 * 批量备份选中的存档（导出为 JSON 下载）
 */
export async function exportSelectedArchives(archiveIds) {
  const archives = await db.archives.bulkGet(archiveIds)
  const valid = archives.filter(Boolean)
  const data = valid.map(a => ({
    id: a.id,
    moduleName: a.moduleName,
    characterName: a.characterName,
    dayCount: a.dayCount,
    createdAt: a.createdAt,
    content: JSON.parse(a.content || '{}')
  }))
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `archives_backup_${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  return valid.length
}
