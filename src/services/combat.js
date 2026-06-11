/**
 * 战斗系统 — 回合制骰子战斗引擎
 * 参考: D&D 5E SRD 战斗规则 (dndtrackr 架构启发)
 *
 * 核心机制:
 * - 先攻: d20 + DEX 调整值，降序行动
 * - 攻击: d20 + 熟练加值 + STR/DEX 调整值 vs AC
 * - 伤害: 武器骰子 + STR/DEX 调整值
 * - HP/死亡豁免: 0HP 昏迷，3成功稳定/3失败死亡
 */
import { db } from '../db/index.js'

// ==================== 战斗状态管理 ====================

/** 创建战斗实例 */
export function createCombat(sessionId) {
  return {
    sessionId,
    isActive: false,
    round: 0,
    turnIndex: 0,
    participants: [],  // { id, name, type:'player'|'enemy', initiative, hp, maxHp, ac, ... }
    log: []
  }
}

/** 添加战斗参与者 */
export function addCombatant(combat, char, type = 'player') {
  const dex = char.dex || 10
  const dexMod = Math.floor((dex - 10) / 2)
  const initiative = rollD20() + dexMod

  combat.participants.push({
    id: char.id || `enemy_${Date.now()}`,
    name: char.name || '未知生物',
    type,
    initiative,
    hp: char.hp || char.maxHp || 10,
    maxHp: char.maxHp || char.hp || 10,
    ac: char.ac || 10,
    str: char.str || 10,
    dex: char.dex || 10,
    con: char.con || 10,
    level: char.level || 1,
    status: [],
    deathSaves: { successes: 0, failures: 0 },
    isUnconscious: false
  })
  combat.participants.sort((a, b) => b.initiative - a.initiative)
  return combat
}

/** 投掷 d20（纯骰面） */
export function rollD20() {
  return Math.floor(Math.random() * 20) + 1
}

/** 属性调整值 */
export function attrMod(score) {
  return Math.floor((score - 10) / 2)
}

/** 熟练加值 */
export function proficiencyBonus(level) {
  return Math.floor((level + 3) / 4)
}

// ==================== 战斗行动 ====================

/** 开始战斗（先攻排序） */
export function startCombat(combat) {
  combat.isActive = true
  combat.round = 1
  combat.turnIndex = 0
  combat.participants.sort((a, b) => b.initiative - a.initiative)
  combat.log.push(`⚔️ 战斗开始！第 ${combat.round} 轮，${combat.participants[0]?.name} 先攻`)
  return combat
}

/** 攻击检定 */
export function attackRoll(attacker, defender) {
  const prof = proficiencyBonus(attacker.level || 1)
  const strMod = attrMod(attacker.str || 10)
  const dexMod = attrMod(attacker.dex || 10)
  const attackMod = Math.max(strMod, dexMod) // 用较高者
  const d20 = rollD20()
  const total = d20 + attackMod + prof
  const isCrit = d20 === 20
  const isFumble = d20 === 1

  const result = {
    d20, attackMod, prof, total,
    targetAC: defender.ac,
    isHit: total >= defender.ac || isCrit,
    isCrit,
    isFumble,
    detail: `攻击检定: d20(${d20}) + ${attackMod}(属性) + ${prof}(熟练) = ${total} vs AC${defender.ac}`
  }
  return result
}

/** 伤害计算 */
export function damageRoll(attacker, weaponDice = '1d6') {
  const strMod = attrMod(attacker.str || 10)
  const diceResult = rollDice(weaponDice)
  const total = diceResult + strMod
  return {
    dice: weaponDice,
    diceResult,
    strMod,
    total: Math.max(1, total),
    detail: `伤害: ${weaponDice}(${diceResult}) + ${strMod}(力量) = ${Math.max(1, total)}`
  }
}

/** 对目标造成伤害 */
export function applyDamage(combat, targetId, damage) {
  const target = combat.participants.find(p => p.id === targetId)
  if (!target) return combat

  target.hp = Math.max(0, target.hp - damage)
  combat.log.push(`💥 ${target.name} 受到 ${damage} 点伤害 (HP: ${target.hp}/${target.maxHp})`)

  if (target.hp <= 0) {
    target.isUnconscious = true
    target.deathSaves = { successes: 0, failures: 0 }
    combat.log.push(`💀 ${target.name} 昏迷！需进行死亡豁免检定`)
  }
  return combat
}

/** 死亡豁免检定 */
export function deathSavingThrow(target) {
  const d20 = rollD20()
  if (d20 === 20) {
    target.hp = 1
    target.isUnconscious = false
    target.deathSaves = { successes: 0, failures: 0 }
    return { detail: `d20=${d20} 自然20！${target.name} 恢复意识 (HP:1)`, revived: true }
  }
  if (d20 === 1) {
    target.deathSaves.failures += 2
    return { detail: `d20=${d20} 自然1！两次失败 (${target.deathSaves.failures}/3)`, revived: false }
  }
  if (d20 >= 10) {
    target.deathSaves.successes++
    if (target.deathSaves.successes >= 3) {
      target.isUnconscious = false
      target.hp = 1
      return { detail: `d20=${d20} 成功！3次成功，${target.name} 稳定 (HP:1)`, revived: true }
    }
    return { detail: `d20=${d20} 成功 (${target.deathSaves.successes}/3)`, revived: false }
  } else {
    target.deathSaves.failures++
    if (target.deathSaves.failures >= 3) {
      target.hp = 0
      return { detail: `d20=${d20} 失败... ${target.name} 已死亡 (${target.deathSaves.failures}/3)`, dead: true }
    }
    return { detail: `d20=${d20} 失败 (${target.deathSaves.failures}/3)`, revived: false }
  }
}

/** 治疗 */
export function healTarget(combat, targetId, amount) {
  const target = combat.participants.find(p => p.id === targetId)
  if (!target) return combat
  target.hp = Math.min(target.maxHp, target.hp + amount)
  if (target.hp > 0) target.isUnconscious = false
  combat.log.push(`💚 ${target.name} 恢复 ${amount} 点生命 (HP: ${target.hp}/${target.maxHp})`)
  return combat
}

/** 添加状态效果 */
export function addStatus(combat, targetId, status) {
  const target = combat.participants.find(p => p.id === targetId)
  if (target) target.status.push(status)
  combat.log.push(`⚠️ ${target?.name} 获得状态: ${status}`)
  return combat
}

/** 移除状态 */
export function removeStatus(combat, targetId, status) {
  const target = combat.participants.find(p => p.id === targetId)
  if (target) target.status = target.status.filter(s => s !== status)
  return combat
}

/** 下一回合 */
export function nextTurn(combat) {
  combat.turnIndex++
  if (combat.turnIndex >= combat.participants.length) {
    combat.turnIndex = 0
    combat.round++
    combat.log.push(`🔄 第 ${combat.round} 轮开始`)
  }
  // 跳过昏迷者
  let skipped = 0
  while (combat.participants[combat.turnIndex]?.isUnconscious && skipped < combat.participants.length) {
    combat.turnIndex++
    if (combat.turnIndex >= combat.participants.length) {
      combat.turnIndex = 0
      combat.round++
    }
    skipped++
  }
  return combat
}

/** 结束战斗 */
export function endCombat(combat) {
  combat.isActive = false
  combat.log.push('🏁 战斗结束')
  return combat
}

/** 检查战斗是否结束（一方全灭） */
export function checkCombatEnd(combat) {
  const players = combat.participants.filter(p => p.type === 'player' && !p.isUnconscious)
  const enemies = combat.participants.filter(p => p.type === 'enemy' && !p.isUnconscious)
  if (players.length === 0) return 'enemies_win'
  if (enemies.length === 0) return 'players_win'
  return null
}

// ==================== XP / 等级成长 ====================

/** 经验值需求表 */
const XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]

/** 获取升到下一级所需经验 */
export function xpForNextLevel(currentLevel) {
  return XP_TABLE[Math.min(currentLevel, XP_TABLE.length - 1)] || XP_TABLE[XP_TABLE.length - 1]
}

/** 敌人击败奖励经验 */
export function enemyXP(cr) {
  const table = { 0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900 }
  return table[cr] || cr * 200
}

/** 检查升级 */
export function checkLevelUp(xp, currentLevel) {
  const needed = xpForNextLevel(currentLevel)
  if (xp >= needed) {
    const newLevel = currentLevel + 1
    const skillPoints = 2 // 每次升级获得2点技能点
    return { leveledUp: true, newLevel, skillPoints, xpNeeded: xpForNextLevel(newLevel) }
  }
  return { leveledUp: false }
}

// ==================== 辅助 ====================

/** 骰子解析 */
function rollDice(expression) {
  const match = expression.match(/^(\d+)?d(\d+)([+-]\d+)?$/)
  if (!match) return 0
  const count = parseInt(match[1]) || 1
  const sides = parseInt(match[2])
  let total = 0
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1
  }
  if (match[3]) total += parseInt(match[3])
  return total
}

/** 持久化战斗状态（可选） */
export async function saveCombatState(sessionId, combat) {
  try {
    await db.mapData.put({ id: 'combat_' + sessionId, sessionId, state: JSON.stringify(combat) })
  } catch (e) { /* 静默 */ }
}

export async function loadCombatState(sessionId) {
  try {
    const data = await db.mapData.get('combat_' + sessionId)
    return data ? JSON.parse(data.state) : null
  } catch { return null }
}
