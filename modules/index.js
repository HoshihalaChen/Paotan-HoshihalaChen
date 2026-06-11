/**
 * 模组数据加载器
 * 聚合所有本地模组数据，提供统一的加载接口
 */

// 直接导入所有模组 JSON 数据
import lostMine from './dnd5e/lost-mine-of-phandelver.json'
import curseOfStrahd from './dnd5e/curse-of-strahd.json'
import dragonlance from './dnd5e/dragonlance.json'
import tombOfAnnihilation from './dnd5e/tomb-of-annihilation.json'
import icewindDale from './dnd5e/icewind-dale.json'
import waterdeepDragonHeist from './dnd5e/waterdeep-dragon-heist.json'
import lordOfMysteries from './lotm/lord-of-mysteries.json'
import callOfCthulhu from './coc/call-of-cthulhu.json'

/** 所有可用模组列表 */
const allModules = [
  lostMine,
  curseOfStrahd,
  dragonlance,
  tombOfAnnihilation,
  icewindDale,
  waterdeepDragonHeist,
  lordOfMysteries,
  callOfCthulhu,
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

/** 获取可用的模组系统列表 */
export function getAvailableSystems() {
  return Object.keys(modulesBySystem)
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
