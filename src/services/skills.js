/**
 * 技能系统 — 职业技能体系 + 等级成长
 *
 * 技能熟练度:
 * - untrained: 0 (不熟练)
 * - proficient: +2 (熟练)
 * - expert: +4 (专精)
 * - master: +6 (大师)
 *
 * 等级成长:
 * - 每次升级获得 2 技能点
 * - 技能点可提升属性(+1)或技能熟练度(+1档)
 */

import { attrMod, proficiencyBonus, xpForNextLevel, checkLevelUp } from './combat.js'

/** 默认技能列表 (D&D 5E SRD) */
const DEFAULT_SKILLS = {
  // 力量技能
  athletics: { name: '运动', attr: 'str', desc: '攀爬、跳跃、游泳' },
  // 敏捷技能
  acrobatics: { name: '杂技', attr: 'dex', desc: '平衡、翻滚、闪避' },
  sleightOfHand: { name: '巧手', attr: 'dex', desc: '偷窃、魔术手法' },
  stealth: { name: '隐匿', attr: 'dex', desc: '躲藏、潜行' },
  // 智力技能
  arcana: { name: '奥秘', attr: 'int', desc: '魔法知识、符文' },
  history: { name: '历史', attr: 'int', desc: '历史事件、古代文明' },
  investigation: { name: '调查', attr: 'int', desc: '搜查、推理' },
  nature: { name: '自然', attr: 'int', desc: '动植物、地理' },
  religion: { name: '宗教', attr: 'int', desc: '神祇、教义' },
  // 感知技能
  animalHandling: { name: '驯兽', attr: 'wis', desc: '安抚动物' },
  insight: { name: '洞察', attr: 'wis', desc: '察言观色' },
  medicine: { name: '医药', attr: 'wis', desc: '治疗、诊断' },
  perception: { name: '察觉', attr: 'wis', desc: '观察、聆听' },
  survival: { name: '生存', attr: 'wis', desc: '追踪、觅食' },
  // 魅力技能
  deception: { name: '欺瞒', attr: 'cha', desc: '说谎、伪装' },
  intimidation: { name: '威吓', attr: 'cha', desc: '恐吓、胁迫' },
  performance: { name: '表演', attr: 'cha', desc: '演奏、演讲' },
  persuasion: { name: '游说', attr: 'cha', desc: '说服、交涉' }
}

/** 熟练度等级 */
const PROFICIENCY_LEVELS = {
  untrained: { name: '未受训', bonus: 0 },
  proficient: { name: '熟练', bonus: 2 },
  expert: { name: '专精', bonus: 4 },
  master: { name: '大师', bonus: 6 }
}

const PROFICIENCY_COSTS = { untrained: 1, proficient: 1, expert: 2, master: 3 }

/** 创建角色技能面板 */
export function createSkillSheet() {
  const skills = {}
  for (const [key, info] of Object.entries(DEFAULT_SKILLS)) {
    skills[key] = { ...info, level: 'untrained' }
  }
  return skills
}

/** 创建角色成长面板 */
export function createGrowthSheet() {
  return {
    xp: 0,
    level: 1,
    skillPoints: 0,
    attributePoints: 0
  }
}

/** 获取技能检定加成 */
export function getSkillBonus(skillLevel, charLevel) {
  const profBonus = proficiencyBonus(charLevel)
  const levelBonus = PROFICIENCY_LEVELS[skillLevel]?.bonus || 0
  return profBonus + levelBonus
}

/** 技能检定 */
export function skillCheck(skills, skillKey, attrValue, charLevel) {
  const skill = skills[skillKey]
  if (!skill) return { bonus: 0, detail: '未知技能' }
  const attrModVal = attrMod(attrValue)
  const skillBonus = getSkillBonus(skill.level, charLevel)
  const total = attrModVal + skillBonus
  return {
    skill: skill.name,
    attrMod: attrModVal,
    skillBonus,
    total,
    level: skill.level,
    detail: `${skill.name}检定: 属性(${attrModVal >= 0 ? '+' + attrModVal : attrModVal}) + 熟练(${skillBonus}) = ${total >= 0 ? '+' + total : total}`
  }
}

/** 升级技能（消耗技能点） */
export function upgradeSkill(skills, skillKey, growth) {
  const skill = skills[skillKey]
  if (!skill || growth.skillPoints <= 0) return { success: false, msg: '技能点不足' }

  const levels = ['untrained', 'proficient', 'expert', 'master']
  const currentIdx = levels.indexOf(skill.level)
  if (currentIdx >= levels.length - 1) return { success: false, msg: '已达大师级' }

  const nextLevel = levels[currentIdx + 1]
  const cost = PROFICIENCY_COSTS[nextLevel] || 1
  if (growth.skillPoints < cost) return { success: false, msg: `需要 ${cost} 技能点` }

  skill.level = nextLevel
  growth.skillPoints -= cost
  return { success: true, msg: `${skill.name} 提升至 ${PROFICIENCY_LEVELS[nextLevel].name}` }
}

/** 升级属性（消耗技能点，2点=+1属性） */
export function upgradeAttribute(char, attrKey, growth) {
  const cost = 2
  if (growth.skillPoints < cost) return { success: false, msg: `需要 ${cost} 技能点` }
  if ((char[attrKey] || 10) >= 20) return { success: false, msg: '属性已达上限(20)' }

  char[attrKey] = (char[attrKey] || 10) + 1
  growth.skillPoints -= cost
  return { success: true, msg: `${attrKey.toUpperCase()} 提升至 ${char[attrKey]}` }
}

/** 增加经验值并检查升级 */
export function addXP(growth, amount) {
  growth.xp += amount
  const result = checkLevelUp(growth.xp, growth.level)
  if (result.leveledUp) {
    growth.level = result.newLevel
    growth.skillPoints += result.skillPoints
    return {
      leveledUp: true,
      newLevel: result.newLevel,
      gainedPoints: result.skillPoints,
      xpNeeded: result.xpNeeded,
      msg: `🎉 升级！达到 ${result.newLevel} 级，获得 ${result.skillPoints} 技能点`
    }
  }
  return { leveledUp: false, xpNeeded: result.xpNeeded }
}

/** 获取升级进度百分比 */
export function levelProgress(growth) {
  const current = growth.xp
  const needed = xpForNextLevel(growth.level)
  return Math.min(100, Math.round((current / needed) * 100))
}

export { DEFAULT_SKILLS, PROFICIENCY_LEVELS, PROFICIENCY_COSTS }
