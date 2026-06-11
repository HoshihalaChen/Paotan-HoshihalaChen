import { parseDice, rollD20, rollAdvantage, rollDisadvantage } from '../utils/dice.js'
import { db } from '../db/index.js'

/**
 * 骰子服务 - 解析骰子指令、投掷、记录日志
 */

/** 执行骰子指令并记录 */
export async function executeDice(expression, sessionId, characterId) {
  let result

  // 检测特殊指令
  const cleaned = expression.toLowerCase().trim()
  if (cleaned === 'adv' || cleaned === '优势') {
    result = rollAdvantage()
  } else if (cleaned === 'dis' || cleaned === '劣势') {
    result = rollDisadvantage()
  } else if (cleaned === 'd20' || cleaned === '1d20') {
    result = rollD20()
  } else {
    result = parseDice(expression)
  }

  if (!result) return null

  // 记录到数据库
  await db.diceLogs.add({
    sessionId,
    characterId: characterId || null,
    expression: result.expression,
    results: result.results,
    total: result.total,
    timestamp: Date.now()
  })

  return result
}

/** 获取投骰统计 */
export async function getDiceStats(sessionId) {
  const logs = await db.diceLogs.where('sessionId').equals(sessionId).toArray()
  const total = logs.length
  if (total === 0) return { total: 0, avgTotal: 0, d20Count: 0, nat20: 0, nat1: 0, distribution: {} }

  let sumTotal = 0
  let d20Count = 0
  let nat20 = 0
  let nat1 = 0
  const distribution = {}

  for (const log of logs) {
    sumTotal += log.total
    if (log.expression.includes('d20')) {
      d20Count++
      if (log.results.includes(20)) nat20++
      if (log.results.includes(1)) nat1++
    }
    distribution[log.total] = (distribution[log.total] || 0) + 1
  }

  return {
    total,
    avgTotal: (sumTotal / total).toFixed(1),
    d20Count,
    nat20,
    nat1,
    distribution
  }
}
