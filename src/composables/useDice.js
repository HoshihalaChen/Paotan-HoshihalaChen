import { ref } from 'vue'
import { executeDice } from '../services/dice.js'

/** 骰子功能 composable */
export function useDice() {
  const lastResult = ref(null)
  const isRolling = ref(false)
  const diceHistory = ref([])

  /** 执行骰子指令 */
  async function roll(expression, sessionId, characterId) {
    isRolling.value = true
    // 模拟骰子旋转动画时间
    await new Promise(r => setTimeout(r, 400))

    const result = await executeDice(expression, sessionId, characterId)
    if (result) {
      lastResult.value = result
      diceHistory.value.unshift(result)
      if (diceHistory.value.length > 50) diceHistory.value.pop()
    }
    isRolling.value = false
    return result
  }

  /** 快速属性检定: d20 + 属性调整值 */
  async function abilityCheck(statName, statValue, sessionId, characterId) {
    const mod = Math.floor((statValue - 10) / 2)
    const label = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }[statName]
    const result = await roll(`d20${mod >= 0 ? '+' + mod : mod}`, sessionId, characterId)
    if (result) {
      result.label = `${label}检定`
      result.statMod = mod
    }
    return result
  }

  return { lastResult, isRolling, diceHistory, roll, abilityCheck }
}
