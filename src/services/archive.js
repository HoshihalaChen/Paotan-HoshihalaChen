/**
 * 存档服务 — 完整的存档/读档/回退引擎
 *
 * 存档结构：模组 → 角色 → 槽位（1 推荐 + 5 手动）
 * 自动存档：每角色固定 1 个槽位，新自动存档替换旧自动存档
 * 手动存档：每角色最多 5 个槽位，受保护不被自动存档覆盖
 * 内容：全量对话 + 角色属性快照 + 骰子记录
 */
import { db } from '../db/index.js'

const MAX_MANUAL_SAVES = 5

/**
 * 创建一个完整存档
 * @param {number} sessionId
 * @param {number} characterId
 * @param {object} options
 * @param {string} options.moduleName
 * @param {string} options.characterName
 * @param {number} options.dayCount
 * @param {boolean} [options.force] - 强制写入（覆盖上限检查）
 * @param {'auto'|'manual'} [options.saveType] - 存档类型，默认 'auto'
 */
export async function createArchive(sessionId, characterId, options = {}) {
  const {
    moduleName = '',
    characterName = '',
    dayCount = 0,
    force = false,
    saveType = 'auto'
  } = options

  // 收集存档数据
  const [messages, diceLogs, character] = await Promise.all([
    db.messages.where('sessionId').equals(sessionId).sortBy('timestamp'),
    db.diceLogs.where('sessionId').equals(sessionId)
      .filter(l => !characterId || l.characterId === characterId)
      .sortBy('timestamp'),
    characterId ? db.characters.get(characterId) : null
  ])

  const allCharacters = await db.characters.where('sessionId').equals(sessionId).toArray()

  // 确保角色名不丢失：优先 DB 查询 → 参数传入 → 会话中任意角色名
  const resolvedCharName = character?.name || characterName
    || allCharacters.find(c => c.id === characterId)?.name
    || allCharacters[0]?.name
    || '未知角色'

  const snapshot = {
    moduleName,
    characterName: resolvedCharName,
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
    lastAssistantMessage: [...messages].reverse().find(m => m.role === 'assistant')?.content || ''
  }

  // 自动存档：删除该角色已有的自动存档，始终只保留 1 个
  if (saveType === 'auto') {
    const existingAuto = await db.archives
      .where({ sessionId, characterId, saveType: 'auto' })
      .toArray()
    for (const a of existingAuto) {
      await db.archives.delete(a.id)
    }
  }

  // 手动存档：限制最多 5 个
  if (saveType === 'manual') {
    const manualCount = await db.archives
      .where({ sessionId, characterId, saveType: 'manual' })
      .count()
    if (manualCount >= MAX_MANUAL_SAVES && !force) {
      throw new Error(`手动存档已满 (${MAX_MANUAL_SAVES}个)，请先删除旧存档再保存`)
    }
  }

  const id = await db.archives.add({
    sessionId,
    characterId: characterId || 0,
    moduleName: snapshot.moduleName,
    characterName: resolvedCharName,
    dayCount: snapshot.dayCount,
    createdAt: snapshot.createdAt,
    saveType,
    content: JSON.stringify(snapshot)
  })

  console.log(`[Archive] ${saveType === 'auto' ? '自动' : '手动'}存档: ${snapshot.characterName} D${snapshot.dayCount}`)
  return { id, snapshot }
}

/**
 * 获取角色的推荐存档 — 自动存档和最新手动存档中较新的那个
 */
export async function getRecommendedArchive(sessionId, characterId) {
  const archives = await db.archives
    .where({ sessionId, characterId })
    .toArray()
  if (!archives.length) return null
  return archives.sort((a, b) => b.createdAt - a.createdAt)[0]
}

/**
 * 获取角色的手动存档列表（最多 5 个，按时间倒序）
 */
export async function getManualArchives(sessionId, characterId) {
  return db.archives
    .where({ sessionId, characterId, saveType: 'manual' })
    .reverse()
    .sortBy('createdAt')
}

/**
 * 获取角色的自动存档
 */
export async function getAutoArchive(sessionId, characterId) {
  const archives = await db.archives
    .where({ sessionId, characterId, saveType: 'auto' })
    .toArray()
  return archives[0] || null
}

/**
 * 读取存档元数据列表
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
    id: a.id, sessionId: a.sessionId, characterId: a.characterId,
    moduleName: a.moduleName, characterName: a.characterName,
    dayCount: a.dayCount, createdAt: a.createdAt, saveType: a.saveType,
    createdAtBJ: a.createdAtBJ || new Date(a.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  }))
}

/**
 * 获取存档的完整内容
 */
export async function getArchiveContent(archiveId) {
  const archive = await db.archives.get(archiveId)
  if (!archive) return null
  return { ...archive, snapshot: JSON.parse(archive.content || '{}') }
}

/**
 * 恢复到指定存档
 */
export async function restoreArchive(archiveId) {
  const archive = await db.archives.get(archiveId)
  if (!archive) throw new Error('存档不存在')

  const snapshot = JSON.parse(archive.content || '{}')
  const { sessionId, characterId } = archive

  // 清空当前会话的消息和骰子记录
  await db.messages.where('sessionId').equals(sessionId).delete()
  await db.diceLogs.where('sessionId').equals(sessionId).delete()

  // 恢复消息
  if (snapshot.messages?.length) {
    await db.messages.bulkAdd(
      snapshot.messages.map(m => ({ ...m, sessionId, id: undefined }))
    )
  }

  // 恢复骰子记录
  if (snapshot.diceLogs?.length) {
    await db.diceLogs.bulkAdd(
      snapshot.diceLogs.map(d => ({ ...d, sessionId, characterId, id: undefined }))
    )
  }

  // 恢复角色快照
  if (snapshot.characterSnapshot?.id) {
    await db.characters.update(snapshot.characterSnapshot.id, snapshot.characterSnapshot)
  }
  if (snapshot.allCharacters?.length) {
    for (const c of snapshot.allCharacters) {
      if (c.id) await db.characters.update(c.id, c).catch(() => {})
    }
  }

  await db.sessions.update(sessionId, { updatedAt: Date.now() })
  console.log('[Archive] 已恢复:', archiveId, 'D' + snapshot.dayCount)
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
 * 全局存档分组 — 按模组 → 角色分组，用于存档页面
 */
export async function getGlobalArchivesGrouped() {
  const all = await db.archives.orderBy('createdAt').reverse().toArray()
  const grouped = {}
  for (const a of all) {
    const modKey = a.moduleName || '未知模组'
    const charKey = a.characterName || '未知角色'
    if (!grouped[modKey]) grouped[modKey] = {}
    if (!grouped[modKey][charKey]) grouped[modKey][charKey] = []
    grouped[modKey][charKey].push(a)
  }
  return grouped
}

/**
 * @deprecated 保留以兼容旧代码，请使用 getGlobalArchivesGrouped
 */
export async function getArchivesGrouped() {
  return getGlobalArchivesGrouped()
}

/**
 * 检查模组角色数量上限
 */
export async function checkCharLimit(sessionId) {
  const chars = await db.characters.where('sessionId').equals(sessionId).count()
  return { count: chars, max: 9, canCreate: chars < 9 }
}

/**
 * 批量导出选中的存档
 */
export async function exportSelectedArchives(archiveIds) {
  const archives = await db.archives.bulkGet(archiveIds)
  const valid = archives.filter(Boolean)
  const data = valid.map(a => ({
    id: a.id, moduleName: a.moduleName, characterName: a.characterName,
    dayCount: a.dayCount, createdAt: a.createdAt, saveType: a.saveType,
    content: JSON.parse(a.content || '{}')
  }))
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `paotuan_archives_${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  return valid.length
}
