/**
 * 背包物品系统 — 简化的文字RPG物品管理
 * 核心设计参考: zzxzzk115/text-rpg-simple-inventory
 *
 * 功能:
 * - 添加/移除物品（按名称+数量）
 * - 物品分类（武器/防具/药水/卷轴/任务/杂物）
 * - IndexedDB 持久化
 * - AI对话中物品获取/消耗自动记录
 */

import { db } from '../db/index.js'

/** 物品分类 */
const CATEGORIES = {
  weapon:    { name: '武器', icon: '⚔️', color: '#8B6A6A' },
  armor:     { name: '防具', icon: '🛡️', color: '#6A7A8B' },
  potion:    { name: '药水', icon: '🧪', color: '#7A8B6A' },
  scroll:    { name: '卷轴', icon: '📜', color: '#8B8B6A' },
  quest:     { name: '任务', icon: '🔑', color: '#8B7A6A' },
  misc:      { name: '杂物', icon: '📦', color: '#8B8580' },
}

export { CATEGORIES }

/** 根据物品名猜测分类 */
function guessCategory(name) {
  const n = name.toLowerCase()
  if (/剑|刀|斧|锤|弓|矛|匕首|棍棒|箭/.test(n)) return 'weapon'
  if (/盾|甲|盔|袍|斗篷|护腕|靴/.test(n)) return 'armor'
  if (/药|水|瓶|剂|毒/.test(n)) return 'potion'
  if (/卷轴|书|笔记|日记|手册|信/.test(n)) return 'scroll'
  if (/钥匙|地图|宝石|金币|徽章|印章|契约/.test(n)) return 'quest'
  return 'misc'
}

/**
 * 加载角色背包
 * @returns {Array<{id, sessionId, characterId, name, category, qty, icon, desc, updatedAt}>}
 */
export async function loadInventory(sessionId, characterId) {
  const items = await db.inventory
    .where({ sessionId, characterId })
    .toArray()
  return items || []
}

/** 添加物品（存在则叠加数量） */
export async function addItem(sessionId, characterId, name, qty = 1, desc = '') {
  const existing = await db.inventory
    .where({ sessionId, characterId, name })
    .first()

  if (existing) {
    await db.inventory.update(existing.id, {
      qty: existing.qty + qty,
      desc: desc || existing.desc,
      updatedAt: Date.now()
    })
    return { ...existing, qty: existing.qty + qty }
  }

  const category = guessCategory(name)
  const item = {
    sessionId,
    characterId,
    name,
    category,
    qty,
    icon: CATEGORIES[category]?.icon || '📦',
    desc,
    updatedAt: Date.now()
  }
  const id = await db.inventory.add(item)
  return { ...item, id }
}

/** 移除物品（减数量，归零则删除） */
export async function removeItem(sessionId, characterId, name, qty = 1) {
  const existing = await db.inventory
    .where({ sessionId, characterId, name })
    .first()

  if (!existing) return null

  const newQty = existing.qty - qty
  if (newQty <= 0) {
    await db.inventory.delete(existing.id)
    return null
  }

  await db.inventory.update(existing.id, { qty: newQty, updatedAt: Date.now() })
  return { ...existing, qty: newQty }
}

/** 清空背包 */
export async function clearInventory(sessionId, characterId) {
  await db.inventory.where({ sessionId, characterId }).delete()
}

/** 获取物品总数（按分类） */
export async function getInventorySummary(sessionId, characterId) {
  const items = await loadInventory(sessionId, characterId)
  const byCategory = {}
  let total = 0
  for (const item of items) {
    if (!byCategory[item.category]) byCategory[item.category] = 0
    byCategory[item.category] += item.qty
    total += item.qty
  }
  return { items, byCategory, total }
}

/**
 * 从 AI 回复中解析物品变动（仅识别玩家角色的物品变动）
 *
 * 规则:
 * 1. 优先匹配结构化标记: [玩家获得:xxx] 或 [你获得:xxx]
 * 2. 匹配 "你" 为主语的描述句，排除 NPC 名称
 * 3. 忽略 NPC 之间的物品转移
 */
export function parseItemChanges(text, playerNames = []) {
  const changes = []

  // 模式1 (最优先): 结构化标记 [物品变动:获得xxx,消耗yyy]
  const structured = text.match(/\[物品变动[：:]\s*(.+?)\]/)
  if (structured) {
    const content = structured[1]
    // 解析逗号分隔的条目
    const parts = content.split(/[,，]/)
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const addMatch = trimmed.match(/^(获得|得到)\s*(.+)/)
      const removeMatch = trimmed.match(/^(消耗|失去|使用|丢弃)\s*(.+)/)
      if (addMatch) {
        changes.push({ action: 'add', name: addMatch[2].trim() })
      } else if (removeMatch) {
        changes.push({ action: 'remove', name: removeMatch[2].trim() })
      }
    }
    return changes  // 信任结构化标记，不再做自然语言解析
  }

  // 模式2 (兜底): 结构化标记 [玩家获得:xxx] [你失去:xxx]
  const bracketPattern = /\[(?:玩家|你)\s*(获得|得到|失去|消耗|使用|丢弃)[：:]\s*(.+?)\]/g
  let match
  while ((match = bracketPattern.exec(text)) !== null) {
    changes.push({
      action: ['获得', '得到'].includes(match[1]) ? 'add' : 'remove',
      name: match[2].trim()
    })
  }

  return changes
}

/** 同步处理 AI 消息中的物品变动（仅玩家角色） */
export async function syncItemsFromMessage(sessionId, characterId, message, playerNames = []) {
  const changes = parseItemChanges(message, playerNames)
  for (const change of changes) {
    if (change.action === 'add') {
      await addItem(sessionId, characterId, change.name)
    } else {
      await removeItem(sessionId, characterId, change.name)
    }
  }
  return changes
}
