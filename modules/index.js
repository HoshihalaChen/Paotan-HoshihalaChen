/**
 * 模组数据加载器
 * 聚合所有本地模组数据，提供统一的加载接口
 */

// 直接导入所有模组 JSON 数据
import lostMine from './dnd5e/lost-mine-of-phandelver.json'
// TODO: 暂时隐藏以下模组，取消注释即可恢复
// import curseOfStrahd from './dnd5e/curse-of-strahd.json'
// import dragonlance from './dnd5e/dragonlance.json'
// import tombOfAnnihilation from './dnd5e/tomb-of-annihilation.json'
// import icewindDale from './dnd5e/icewind-dale.json'
// import waterdeepDragonHeist from './dnd5e/waterdeep-dragon-heist.json'
import lordOfMysteries from './lotm/lord-of-mysteries.json'
// import callOfCthulhu from './coc/call-of-cthulhu.json'

/** 所有可用模组列表 */
const allModules = [
  lostMine,
  // TODO: 暂时隐藏以下模组，取消注释即可恢复
  // curseOfStrahd,
  // dragonlance,
  // tombOfAnnihilation,
  // icewindDale,
  // waterdeepDragonHeist,
  lordOfMysteries,
  // callOfCthulhu,
]

/** 按系统分类 */
const modulesBySystem = {
  'D&D 5E': allModules.filter(m => m.system === 'D&D 5E'),
  '自定义 · 诡秘体系': allModules.filter(m => m.system === '自定义 · 诡秘体系'),
  'COC 7th': allModules.filter(m => m.system === 'COC 7th'),
}

/** 获取所有模组 */
export function getAllModules() {
  return allModules
}

/** 按系统获取模组 */
export function getModulesBySystem(system) {
  return modulesBySystem[system] || []
}

/** 按 ID 获取单个模组 */
export function getModuleById(id) {
  return allModules.find(m => m.id === id) || null
}

/** 获取可用的模组系统列表（仅返回有模组的系统） */
export function getAvailableSystems() {
  return Object.keys(modulesBySystem).filter(k => modulesBySystem[k].length > 0)
}

/** 将模组数据转化为创建会话所需的参数 */
export function moduleToSessionParams(module) {
  return {
    name: module.name,
    system: module.system,
    description: module.description,
  }
}

/** 将模组预置角色转化为角色创建数据 */
export function moduleToCharacterParams(module, characterIndex = 0) {
  const chars = module.premadeCharacters || []
  if (characterIndex >= chars.length) return null
  return chars[characterIndex]
}

/** 获取模组的世界观条目 */
export function getModuleWorldLore(module) {
  return module.worldLore || []
}

/** 获取模组的 NPC 列表 */
export function getModuleNPCs(module) {
  return module.npcs || []
}

/** 获取模组的任务列表 */
export function getModuleQuests(module) {
  return module.quests || []
}

/** 获取模组的物品列表 */
export function getModuleItems(module) {
  return module.items || []
}

/** 获取模组的地点列表 */
export function getModuleLocations(module) {
  return module.locations || []
}

/** 获取模组的特殊姓氏映射表 */
export function getModuleSpecialSurnames(module) {
  return module?.charCreation?.specialSurnames || {}
}

/** 规则文件注册表 — 系统名 → 规则文件路径 */
const RULE_FILES = {
  'D&D 5E': () => import('./rules/dnd5e.json'),
  'COC 7th': () => import('./rules/coc7.json'),
  '自定义 · 诡秘体系': () => import('./rules/lotm.json')
}

/** 规则内容缓存 */
const _ruleCache = {}

/**
 * 根据系统名获取规则书。未匹配时返回 null（AI自由裁量）
 * 支持用户导入模组：只要 system 字段匹配注册表中的键即可自动加载
 */
export async function getRulebook(system) {
  if (!system) return null
  if (_ruleCache[system]) return _ruleCache[system]

  const loader = RULE_FILES[system]
  if (!loader) {
    console.warn(`[Rulebook] 未找到系统"${system}"的规则文件，AI将自由裁量`)
    return null
  }
  try {
    const mod = await loader()
    _ruleCache[system] = mod.default || mod
    return _ruleCache[system]
  } catch (e) {
    console.warn(`[Rulebook] 加载规则文件失败: ${system}`, e.message)
    return null
  }
}

/**
 * 将规则书格式化为 AI system prompt 片段
 * 仅提取关键判定规则，保持简洁避免token浪费
 */
export function formatRulebookForPrompt(rules) {
  if (!rules) return ''

  let text = `\n# 游戏规则参考（${rules.name}）\n`
  if (rules.source) text += `规则来源：${rules.source}\n`

  // 属性说明
  if (rules.attributes) {
    text += `\n## 属性体系\n`
    for (const [key, attr] of Object.entries(rules.attributes)) {
      text += `- ${attr.name}(${key})：${attr.desc}`
      if (attr.modifier) text += ` 调整值=${attr.modifier}`
      text += `\n`
    }
  }
  // 衍生属性
  if (rules.derived) {
    text += `\n## 衍生属性\n`
    for (const [key, val] of Object.entries(rules.derived)) {
      text += `- ${val.name}：${val.formula} (${val.desc})\n`
    }
  }

  // 核心检定规则
  if (rules.skillCheckRules?.length) {
    text += `\n## 技能检定规则\n`
    for (const r of rules.skillCheckRules) text += `- ${r}\n`
  }

  // 难度对照
  if (rules.difficulty) {
    text += `\n## 难度等级(DC)\n`
    for (const [name, val] of Object.entries(rules.difficulty)) {
      text += `- ${name}：DC ${val}\n`
    }
  }

  // 战斗规则
  if (rules.combatRules?.length) {
    text += `\n## 战斗规则\n`
    for (const r of rules.combatRules) text += `- ${r}\n`
  }

  // 特殊机制（诡秘体系等）
  if (rules.pathwayMechanics) {
    text += `\n## 序列晋升机制\n`
    for (const [k, v] of Object.entries(rules.pathwayMechanics)) {
      text += `- ${v}\n`
    }
  }
  if (rules.sanityRules?.length) {
    text += `\n## 理智/疯狂规则\n`
    for (const r of rules.sanityRules) text += `- ${r}\n`
  }
  if (rules.pushRules?.length) {
    text += `\n## 孤注一掷规则\n`
    for (const r of rules.pushRules) text += `- ${r}\n`
  }

  // 特殊判例
  if (rules.fallDamage) text += `\n坠落伤害：${rules.fallDamage}\n`
  if (rules.restRules) text += `休息规则：${rules.restRules}\n`

  return text
}
