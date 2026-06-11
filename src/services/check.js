/**
 * 统一检定系统
 *
 * 流程：
 * 1. AI 询问是否检定 → 玩家 .yes / .no
 * 2. .yes → 代码自动计算属性+装备+职业+难度加权 → 投d20 → 判定
 * 3. .no  → 固定获得低于平均的结果（无加成裸d20=7~9）
 *
 * 加成来源（代码自动计算，玩家不可手动调整）：
 * - 属性调整值：floor((stat - 10) / 2)
 * - 熟练加值：floor((level + 3) / 4)
 * - 装备加成：根据装备与检定类型的匹配度
 * - 职业特长：直接相关 +2，部分相关 +1，不相关 0
 * - 难度系数：影响 DC 和最终成败判定
 */

import { db } from '../db/index.js'

// ========== 难度预设 ==========
export const DIFFICULTY = {
  trivial:         { dc: 5,  label: '极简单', desc: '几乎不可能失败' },
  easy:            { dc: 10, label: '简单',   desc: '稍有训练即可完成' },
  medium:          { dc: 13, label: '中等',   desc: '需要一定能力' },
  hard:            { dc: 16, label: '困难',   desc: '需要扎实的训练' },
  veryHard:        { dc: 19, label: '极难',   desc: '只有专家才能稳定完成' },
  nearlyImpossible:{ dc: 22, label: '近乎不可能', desc: '凡人极限' },
  legendary:       { dc: 25, label: '传奇',   desc: '只有英雄才能触及' }
}

// ========== 检定类型 → 属性映射 ==========
const CHECK_STAT_MAP = {
  // 力量类
  athletics: 'str', climb: 'str', swim: 'str', grapple: 'str', break: 'str', lift: 'str',
  // 敏捷类
  acrobatics: 'dex', stealth: 'dex', sleight: 'dex', dodge: 'dex', sneak: 'dex', evade: 'dex',
  // 体质类
  endurance: 'con', resist: 'con', fortitude: 'con', survive: 'con', toughness: 'con',
  // 智力类
  arcana: 'int', history: 'int', investigation: 'int', lore: 'int', knowledge: 'int', analyze: 'int',
  // 感知类
  perception: 'wis', insight: 'wis', medicine: 'wis', survival: 'wis', tracking: 'wis', sense: 'wis',
  // 魅力类
  persuasion: 'cha', deception: 'cha', intimidation: 'cha', performance: 'cha', diplomacy: 'cha', charm: 'cha'
}

// ========== 职业 → 特长检定类型 ==========
const CLASS_SPECIALTIES = {
  '战士':   ['athletics', 'intimidation', 'endurance'],
  '法师':   ['arcana', 'investigation', 'knowledge'],
  '牧师':   ['medicine', 'insight', 'persuasion'],
  '游荡者': ['stealth', 'sleight', 'acrobatics', 'deception'],
  '游侠':   ['survival', 'tracking', 'perception', 'stealth'],
  '德鲁伊': ['survival', 'medicine', 'perception'],
  '术士':   ['arcana', 'deception', 'persuasion'],
  '野蛮人': ['athletics', 'intimidation', 'endurance'],
  '吟游诗人': ['performance', 'persuasion', 'deception', 'charm'],
  '圣武士': ['athletics', 'persuasion', 'intimidation'],
  '邪术师': ['arcana', 'deception', 'intimidation'],
  '武僧':   ['acrobatics', 'stealth', 'perception'],
  // 诡秘途径
  '占卜家': ['perception', 'investigation', 'sense'],
  '学徒':   ['arcana', 'acrobatics', 'stealth'],
  '偷盗者': ['stealth', 'sleight', 'deception'],
  '观众':   ['insight', 'perception', 'persuasion'],
  '阅读者': ['knowledge', 'history', 'investigation'],
  '水手':   ['athletics', 'swim', 'endurance'],
  '不眠者': ['perception', 'stealth', 'endurance'],
  '猎人':   ['survival', 'tracking', 'perception'],
  '刺客':   ['stealth', 'deception', 'sleight'],
  '通识者': ['knowledge', 'investigation', 'arcana'],
  '秘祈人': ['arcana', 'deception', 'insight'],
  '收尸人': ['medicine', 'survival', 'resist'],
  '怪物':   ['survival', 'perception', 'endurance'],
  '罪犯':   ['stealth', 'intimidation', 'deception'],
  '歌颂者': ['performance', 'persuasion', 'medicine'],
  '药师':   ['medicine', 'survival', 'knowledge'],
  '仲裁人': ['insight', 'investigation', 'persuasion'],
  '律师':   ['persuasion', 'deception', 'knowledge'],
  '耕种者': ['survival', 'medicine', 'endurance'],
  '窥秘人': ['knowledge', 'arcana', 'investigation'],
  '采集者': ['survival', 'perception', 'endurance'],
  // COC
  '教授':   ['knowledge', 'history', 'investigation'],
  '记者':   ['investigation', 'persuasion', 'perception'],
  '私家侦探': ['investigation', 'stealth', 'perception'],
  '医生':   ['medicine', 'investigation', 'perception']
}

// ========== 装备 → 检定加成映射 ==========
function getEquipmentBonus(equipment, checkType) {
  if (!equipment || equipment.length === 0) return 0
  let bonus = 0
  const eqLower = equipment.map(e => e.toLowerCase())

  const toolMap = {
    athletics:  ['绳索', '攀爬工具', '钩爪'],
    stealth:    ['皮甲', '斗篷', '软底靴'],
    arcana:     ['法术书', '法器', '水晶球'],
    investigation: ['放大镜', '笔记本', '侦探工具'],
    medicine:   ['医疗包', '药草', '手术工具'],
    perception: ['望远镜', '眼镜'],
    survival:   ['指南针', '火石', '帐篷', '绳索'],
    persuasion: ['华丽服饰', '徽章', '印章'],
    deception:  ['伪装工具', '假证件'],
    performance:['乐器', '华丽服饰'],
    acrobatics: ['软底靴', '皮甲'],
    intimidation:['重型武器', '战斧', '巨剑'],
    sleight:    ['手套', '小刀']
  }

  const relevantTools = toolMap[checkType] || []
  for (const eq of eqLower) {
    if (relevantTools.some(t => eq.includes(t.toLowerCase()))) {
      bonus += 1 // 每件相关装备+1，最多+2
    }
  }
  return Math.min(bonus, 2)
}

// ========== 核心：执行统一检定 ==========
/**
 * @param {Object} character - 角色数据
 * @param {string} checkType - 检定类型 (athletics/stealth/arcana/...)
 * @param {string} difficulty - 难度等级 (easy/medium/hard/...)
 * @param {Object} options - { advantage?: boolean, disadvantage?: boolean }
 */
export function performUnifiedCheck(character, checkType, difficulty, options = {}) {
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.medium
  const statKey = CHECK_STAT_MAP[checkType] || 'str'
  const statValue = character[statKey] || 10

  // 1. 属性调整值
  const statMod = Math.floor((statValue - 10) / 2)

  // 2. 熟练加值 (level 1-20 → +2 to +6)
  const level = character.level || 1
  const proficiencyBonus = Math.floor((level + 3) / 4) + 1

  // 3. 职业特长加成
  const specialties = CLASS_SPECIALTIES[character.class] || []
  let classBonus = 0
  if (specialties.includes(checkType)) {
    classBonus = 2 // 直接相关 +2
  } else if (specialties.some(s => s.startsWith(checkType.substring(0, 3)))) {
    classBonus = 1 // 部分相关 +1
  }

  // 4. 装备加成
  const equipBonus = getEquipmentBonus(character.equipment, checkType)

  // 5. 总调整值
  const totalMod = statMod + proficiencyBonus + classBonus + equipBonus

  // 6. 投掷 d20
  let roll
  if (options.advantage) {
    const r1 = Math.floor(Math.random() * 20) + 1
    const r2 = Math.floor(Math.random() * 20) + 1
    roll = Math.max(r1, r2)
  } else if (options.disadvantage) {
    const r1 = Math.floor(Math.random() * 20) + 1
    const r2 = Math.floor(Math.random() * 20) + 1
    roll = Math.min(r1, r2)
  } else {
    roll = Math.floor(Math.random() * 20) + 1
  }

  const total = roll + totalMod
  const success = total >= diff.dc
  const degree = success ? Math.floor((total - diff.dc) / 2) : Math.floor((diff.dc - total) / 2)

  return {
    roll, totalMod, statMod, proficiencyBonus, classBonus, equipBonus,
    total, dc: diff.dc, difficulty: diff.label, checkType, statKey, statValue,
    success, degree, advantage: !!options.advantage, disadvantage: !!options.disadvantage
  }
}

/** 玩家拒绝检定：固定获得低于平均的结果 */
export function performDeclinedCheck() {
  const roll = 7 + Math.floor(Math.random() * 3) // 7, 8, or 9
  return {
    roll, totalMod: 0, statMod: 0, proficiencyBonus: 0, classBonus: 0, equipBonus: 0,
    total: roll, dc: 0, difficulty: '放弃检定', checkType: 'none', statKey: 'none', statValue: 0,
    success: false, degree: -1, advantage: false, disadvantage: false,
    declined: true
  }
}

/** 格式化检定结果为可读文本 */
export function formatCheckResult(result) {
  if (result.declined) {
    return `🚫 **放弃检定**：未进行属性检定，自动获得一个平庸的结果。\n裸d20: [${result.roll}] = ${result.total}\n> 错过了可能的额外加成，结果低于平均水平。`
  }

  let text = `⚡ **统一检定** — ${result.difficulty} (DC ${result.dc})\n\n`
  text += `🎲 d20: [${result.roll}]`

  if (result.advantage || result.disadvantage) {
    text += ` (${result.advantage ? '优势' : '劣势'})`
  }

  text += `\n📊 加成明细：`
  text += `\n   属性调整(${result.statKey}): ${result.statMod >= 0 ? '+' : ''}${result.statMod}`
  text += `\n   熟练加值: +${result.proficiencyBonus}`
  if (result.classBonus > 0) text += `\n   职业特长: +${result.classBonus}`
  if (result.equipBonus > 0) text += `\n   装备加成: +${result.equipBonus}`
  text += `\n   总调整值: ${result.totalMod >= 0 ? '+' : ''}${result.totalMod}`

  text += `\n\n📐 最终结果: ${result.roll} + ${result.totalMod} = **${result.total}** vs DC ${result.dc}`

  if (result.success) {
    const degreeLabels = ['', '勉强成功', '稳定成功', '出色成功', '完美成功']
    const label = degreeLabels[Math.min(result.degree, 4)] || '传奇成功'
    text += `\n✅ **${label}**！成功超出 DC ${result.degree * 2} 点`
  } else {
    const degreeLabels = ['', '轻微失败', '明显失败', '严重失败', '灾难性失败']
    const label = degreeLabels[Math.min(result.degree, 4)] || '彻底失败'
    text += `\n❌ **${label}**！低于 DC ${result.degree * 2} 点`
  }

  return text
}

/** 记录检定到数据库 */
export async function logCheckResult(sessionId, characterId, result) {
  await db.diceLogs.add({
    sessionId,
    characterId: characterId || null,
    expression: `检定:${result.checkType} DC${result.dc}`,
    results: [result.roll],
    total: result.total,
    timestamp: Date.now()
  })
}
