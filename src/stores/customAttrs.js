import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 自定义属性覆盖 Store
 * 用户可在设置页自定义每个模组每个职业/种族的初始属性加减值
 * 存储在 localStorage，持久化且不受重置影响
 */
const STORAGE_KEY = 'paotuan_custom_attrs'

export const useCustomAttrsStore = defineStore('customAttrs', () => {
  // 结构: { [moduleId]: { classMods: {...}, raceMods: {...} } }
  const overrides = ref(loadFromStorage())

  function loadFromStorage() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    } catch { return {} }
  }

  function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides.value))
  }

  /** 获取模块的职业覆盖（合并默认值） */
  function getClassMods(moduleId, defaultMods = {}) {
    const modOverride = overrides.value[moduleId]?.classMods || {}
    const merged = {}
    for (const [cls, mods] of Object.entries(defaultMods)) {
      merged[cls] = { ...mods, ...(modOverride[cls] || {}) }
    }
    // 添加覆盖中存在但默认中不存在的
    for (const [cls, mods] of Object.entries(modOverride)) {
      if (!merged[cls]) merged[cls] = { ...mods }
    }
    return merged
  }

  /** 获取模块的种族覆盖 */
  function getRaceMods(moduleId, defaultMods = {}) {
    const modOverride = overrides.value[moduleId]?.raceMods || {}
    const merged = {}
    for (const [race, mods] of Object.entries(defaultMods)) {
      merged[race] = { ...mods, ...(modOverride[race] || {}) }
    }
    for (const [race, mods] of Object.entries(modOverride)) {
      if (!merged[race]) merged[race] = { ...mods }
    }
    return merged
  }

  /** 更新单个职业的单个属性调整值 */
  function setClassAttr(moduleId, className, attrKey, value) {
    if (!overrides.value[moduleId]) overrides.value[moduleId] = { classMods: {}, raceMods: {} }
    if (!overrides.value[moduleId].classMods[className]) overrides.value[moduleId].classMods[className] = {}
    overrides.value[moduleId].classMods[className][attrKey] = value
    saveToStorage()
  }

  /** 更新单个种族的单个属性调整值 */
  function setRaceAttr(moduleId, raceName, attrKey, value) {
    if (!overrides.value[moduleId]) overrides.value[moduleId] = { classMods: {}, raceMods: {} }
    if (!overrides.value[moduleId].raceMods[raceName]) overrides.value[moduleId].raceMods[raceName] = {}
    overrides.value[moduleId].raceMods[raceName][attrKey] = value
    saveToStorage()
  }

  /** 重置模块所有覆盖 */
  function resetModule(moduleId) {
    delete overrides.value[moduleId]
    saveToStorage()
  }

  return { overrides, getClassMods, getRaceMods, setClassAttr, setRaceAttr, resetModule }
})
