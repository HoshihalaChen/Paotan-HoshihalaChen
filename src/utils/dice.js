/**
 * 骰子表达式解析器
 * 支持格式: d20, 2d6, 3d8+5, d100, 4d6k3 (keep highest 3), 2d20kh1 (advantage)
 */

/** 解析骰子表达式，返回 { results, total, detail } */
export function parseDice(expression) {
  const cleaned = expression.toLowerCase().replace(/\s/g, '')
  if (!cleaned) return null

  // 匹配模式: [数量]d[面数][kh|kl[数量]][+-修正]
  const regex = /^(\d+)?d(\d+)(?:k([hl])(\d+))?(?:([+-]\d+))?$/
  const match = cleaned.match(regex)

  if (!match) {
    // 尝试纯数字
    if (/^-?\d+$/.test(cleaned)) {
      const val = parseInt(cleaned)
      return { expression, results: [val], total: val, detail: cleaned }
    }
    return null
  }

  const count = parseInt(match[1] || '1')
  const sides = parseInt(match[2])
  const keepMode = match[3] || null
  const keepCount = match[4] ? parseInt(match[4]) : count
  const modifier = match[5] ? parseInt(match[5]) : 0

  // 投掷
  const allResults = []
  for (let i = 0; i < count; i++) {
    allResults.push(Math.floor(Math.random() * sides) + 1)
  }

  // 排序用于 keep 处理
  const sorted = [...allResults].sort((a, b) => b - a)

  let results
  if (keepMode === 'h') {
    results = sorted.slice(0, keepCount)
  } else if (keepMode === 'l') {
    results = sorted.slice(-keepCount)
  } else {
    results = allResults
  }

  const sum = results.reduce((a, b) => a + b, 0)
  const total = sum + modifier

  return {
    expression,
    allResults,
    results,
    sum,
    modifier,
    total,
    detail: formatDiceDetail(expression, allResults, results, modifier, total)
  }
}

/** 格式化骰子投掷描述 */
function formatDiceDetail(expr, all, kept, mod, total) {
  let s = `${expr}: [${all.join(', ')}]`
  if (all.length !== kept.length || all.join(',') !== kept.join(',')) {
    s += ` → 保留 [${kept.join(', ')}]`
  }
  if (mod !== 0) {
    s += mod > 0 ? ` + ${mod}` : ` - ${Math.abs(mod)}`
  }
  s += ` = ${total}`
  return s
}

/** 优势投掷 (advantage): 2d20 取最高 */
export function rollAdvantage(mod = 0) {
  const r1 = Math.floor(Math.random() * 20) + 1
  const r2 = Math.floor(Math.random() * 20) + 1
  const best = Math.max(r1, r2)
  return {
    expression: 'd20 (优势)',
    results: [r1, r2],
    total: best + mod,
    detail: `优势: [${r1}, ${r2}] → ${best}${mod ? ` + ${mod}` : ''} = ${best + mod}`
  }
}

/** 劣势投掷 (disadvantage): 2d20 取最低 */
export function rollDisadvantage(mod = 0) {
  const r1 = Math.floor(Math.random() * 20) + 1
  const r2 = Math.floor(Math.random() * 20) + 1
  const worst = Math.min(r1, r2)
  return {
    expression: 'd20 (劣势)',
    results: [r1, r2],
    total: worst + mod,
    detail: `劣势: [${r1}, ${r2}] → ${worst}${mod ? ` + ${mod}` : ''} = ${worst + mod}`
  }
}

/** 快速 d20 检定 */
export function rollD20(mod = 0) {
  const r = Math.floor(Math.random() * 20) + 1
  return {
    expression: 'd20',
    results: [r],
    total: r + mod,
    detail: `d20: [${r}]${mod >= 0 ? '+' + mod : mod} = ${r + mod}`
  }
}
