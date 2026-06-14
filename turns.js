/**
 * 回合制引擎 — 管理房间内的轮流行动状态
 */

/** 房间游戏状态: Map<roomId, GameState> */
const games = new Map()

function initGame(roomId, playerIds) {
  games.set(roomId, {
    roomId,
    round: 1,
    currentPlayerIdx: 0,
    phase: 'action',       // 'action' | 'ai_response' | 'ended'
    playerOrder: playerIds, // clientId 按顺序排列
    actions: [],           // [{ clientId, type, content, timestamp }]
    lastAIResponse: ''
  })
}

function getGame(roomId) {
  return games.get(roomId) || null
}

/** 获取当前轮到哪个玩家 */
function getCurrentPlayer(roomId) {
  const g = games.get(roomId)
  if (!g) return null
  return g.playerOrder[g.currentPlayerIdx] || null
}

/** 玩家提交行动 → 前进回合 */
function submitAction(roomId, clientId, action) {
  const g = games.get(roomId)
  if (!g) return { error: '游戏未开始' }
  if (g.phase !== 'action') return { error: '当前不是行动阶段' }
  if (g.playerOrder[g.currentPlayerIdx] !== clientId) return { error: '还没轮到你' }

  // 记录行动
  g.actions.push({ clientId, ...action, timestamp: Date.now() })

  // 前进到下一个玩家
  g.currentPlayerIdx++
  if (g.currentPlayerIdx >= g.playerOrder.length) {
    // 所有人行动完毕 → AI 阶段
    g.phase = 'ai_response'
    g.currentPlayerIdx = 0
    return { phase: 'ai_response', roundComplete: true, actions: [...g.actions] }
  }

  // 下一人
  return { phase: 'action', nextPlayer: g.playerOrder[g.currentPlayerIdx], round: g.round }
}

/** AI 回复后开始新回合 */
function newRound(roomId) {
  const g = games.get(roomId)
  if (!g) return
  g.round++
  g.phase = 'action'
  g.actions = []
  g.currentPlayerIdx = 0
}

/** 跳过当前玩家（超时/离线） */
function skipPlayer(roomId, clientId) {
  const g = games.get(roomId)
  if (!g) return
  g.actions.push({ clientId, type: 'skip', text: '(超时跳过)', timestamp: Date.now() })
  g.currentPlayerIdx++
  if (g.currentPlayerIdx >= g.playerOrder.length) {
    g.phase = 'ai_response'
    g.currentPlayerIdx = 0
    return { phase: 'ai_response', roundComplete: true, actions: [...g.actions] }
  }
  return { phase: 'action', nextPlayer: g.playerOrder[g.currentPlayerIdx], round: g.round }
}

function endGame(roomId) {
  games.delete(roomId)
}

module.exports = { initGame, getGame, getCurrentPlayer, submitAction, newRound, skipPlayer, endGame }
