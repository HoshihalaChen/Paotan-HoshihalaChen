/**
 * 跑团助手 — 多人模式后端
 * Express + WebSocket (ws) — 轻量级房间与消息服务
 *
 * 启动: node index.js
 * 端口: 3000 (可设 PORT 环境变量)
 */

const express = require('express')
const http = require('http')
const { WebSocketServer } = require('ws')
const cors = require('cors')
const { initDB, saveDB, createRoom, findRoomByCode, getRoom, getRoomPlayers, joinRoom, leaveRoom, updatePlayerChar, getRoomApiKey, saveMessage, getRoomMessages, saveGame, listSaves, loadSave } = require('./db')
const { initGame, getGame, getCurrentPlayer, submitAction, newRound } = require('./turns')

const PORT = process.env.PORT || 3000

// ======================== HTTP 服务 ========================
const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static(__dirname))  // 提供静态文件（test.html 等）

// 健康检查
app.get('/health', (req, res) => res.json({ status: 'ok', time: Date.now() }))

const server = http.createServer(app)

// ======================== WebSocket 服务 ========================
const wss = new WebSocketServer({ server })

/** 所有连接的客户端: Map<ws, { id, roomId, playerName }> */
const clients = new Map()

wss.on('connection', (ws, req) => {
  const clientId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  clients.set(ws, { id: clientId, roomId: null, playerName: '' })

  console.log(`[WS] 连接: ${clientId} (当前 ${clients.size} 人)`)
  ws.send(JSON.stringify({ type: 'WELCOME', clientId }))

  // 接收消息
  ws.on('message', async (raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch { return }

    const client = clients.get(ws)
    if (!client) return

    switch (msg.type) {
      case 'PING':
        ws.send(JSON.stringify({ type: 'PONG', time: Date.now() }))
        break

      case 'CHAT':
        // 保存消息到数据库
        if (client.roomId) saveMessage(client.roomId, clientId, 'user', msg.text, 'chat')
        // 群发聊天给所有客户端
        broadcast({ type: 'CHAT', from: clientId, playerName: client.playerName || clientId, text: msg.text, time: Date.now() })
        break

      case 'SET_NAME':
        client.playerName = msg.name || ''
        ws.send(JSON.stringify({ type: 'NAME_SET', name: client.playerName }))
        break

      case 'ROOM_CREATE': {
        const room = createRoom(msg.moduleId || '', msg.moduleName || '', clientId, msg.apiKey || '')
        client.roomId = room.id
        joinRoom(room.id, clientId, client.playerName)
        ws.send(JSON.stringify({ type: 'ROOM_CREATED', ...room, players: getRoomPlayers(room.id) }))
        break
      }

      case 'ROOM_JOIN': {
        const found = findRoomByCode(msg.code)
        if (!found) { ws.send(JSON.stringify({ type: 'ERROR', text: '房间不存在' })); break }
        client.roomId = found.id
        joinRoom(found.id, clientId, client.playerName)
        const players = getRoomPlayers(found.id)
        // 先告诉加入者房间信息
        ws.send(JSON.stringify({ type: 'ROOM_JOINED', roomId: found.id, code: found.code, players }))
        // 广播给房间内其他人
        broadcastToRoom(found.id, { type: 'PLAYER_JOINED', roomId: found.id, playerName: client.playerName, clientId, players })
        break
      }

      case 'ROOM_LEAVE':
        if (client.roomId) {
          leaveRoom(client.roomId, clientId)
          broadcastToRoom(client.roomId, { type: 'PLAYER_LEFT', clientId, playerName: client.playerName })
        }
        client.roomId = null
        break

      case 'RECONNECT': {
        // 断线重连：恢复玩家到原有房间
        const oldRoomId = msg.roomId
        const oldClientId = msg.clientId
        if (!oldRoomId) { ws.send(JSON.stringify({ type: 'ERROR', text: '无保存的房间信息' })); break }
        const r = getRoom(oldRoomId)
        if (!r) { ws.send(JSON.stringify({ type: 'ERROR', text: '房间已不存在' })); break }
        // 更新 clientId 映射
        client.id = oldClientId
        client.roomId = oldRoomId
        client.playerName = msg.playerName || ''
        joinRoom(oldRoomId, oldClientId, client.playerName)
        // 发送全量状态
        const pl = getRoomPlayers(oldRoomId)
        const m = getRoomMessages(oldRoomId, 50)
        const g = getGame(oldRoomId)
        ws.send(JSON.stringify({ type: 'RECONNECTED', room: r, players: pl, messages: m, round: g?.round || 1, currentTurn: g?.playerOrder?.[g?.currentPlayerIdx] || '' }))
        broadcastToRoom(oldRoomId, { type: 'PLAYER_JOINED', roomId: oldRoomId, playerName: client.playerName, clientId: oldClientId, players: pl })
        break
      }

      case 'ROOM_STATE':
        if (client.roomId) {
          const r = getRoom(client.roomId)
          const pl = getRoomPlayers(client.roomId)
          const msgs = getRoomMessages(client.roomId, 30)
          ws.send(JSON.stringify({ type: 'ROOM_STATE', room: r, players: pl, messages: msgs }))
        }
        break

      case 'SET_CHARACTER': {
        // 设置角色数据
        if (client.roomId && msg.charData) {
          const s = require('./db')
          s.updatePlayerChar(client.roomId, clientId, msg.charData)
          const pl = getRoomPlayers(client.roomId)
          broadcastToRoom(client.roomId, { type: 'CHAR_UPDATED', clientId, players: pl })
        }
        break
      }

      case 'GAME_START': {
        if (!client.roomId) break
        const room = getRoom(client.roomId)
        if (!room) break
        // 获取玩家并按加入顺序排列
        const players = getRoomPlayers(client.roomId)
        const playerIds = players.map(p => p.client_id)
        initGame(client.roomId, playerIds)
        // 更新房间状态
        const s2 = require('./db')
        // 广播开始
        broadcastToRoom(client.roomId, { type: 'GAME_STARTING', roomId: client.roomId, players, round: 1 })
        // 通知第一个玩家
        const firstId = getCurrentPlayer(client.roomId)
        broadcastToRoom(client.roomId, { type: 'TURN_START', clientId: firstId, playerName: players.find(p => p.client_id === firstId)?.name })
        break
      }

      case 'STATE_UPDATE': {
        // 玩家状态变更（HP/属性/物品等）→ 更新DB并广播
        if (client.roomId && msg.charData) {
          updatePlayerChar(client.roomId, clientId, msg.charData)
          const pl = getRoomPlayers(client.roomId)
          broadcastToRoom(client.roomId, { type: 'STATE_SYNC', clientId, charData: msg.charData, players: pl })
        }
        break
      }

      case 'ACTION_SUBMIT': {
        if (!client.roomId) break
        const result = submitAction(client.roomId, clientId, { type: msg.actionType || 'chat', text: msg.text || '', content: msg.content || msg.text || '' })
        if (result.error) { ws.send(JSON.stringify({ type: 'ERROR', text: result.error })); break }

        // 保存消息
        saveMessage(client.roomId, clientId, 'user', msg.text || '', 'chat')

        if (result.roundComplete) {
          // 所有人行动完毕 → AI 阶段
          broadcastToRoom(client.roomId, {
            type: 'ROUND_COMPLETE',
            round: result.round || 1,
            actions: result.actions,
            summary: result.actions.map(a => `${a.clientId}: ${a.text || '(未发言)'}`).join('\n')
          })
          // 流式调用 AI，逐 token 广播给全房间
          await aiSummarizeStream(client.roomId, result.actions.map(a => ({ ...a, round: result.round })))
          // 新回合
          newRound(client.roomId)
          const nextId = getCurrentPlayer(client.roomId)
          const players2 = getRoomPlayers(client.roomId)
          broadcastToRoom(client.roomId, { type: 'TURN_START', clientId: nextId, playerName: players2.find(p => p.client_id === nextId)?.name })
        } else {
          // 下一个玩家
          const playersNow = getRoomPlayers(client.roomId)
          broadcastToRoom(client.roomId, { type: 'TURN_START', clientId: result.nextPlayer, playerName: playersNow.find(p => p.client_id === result.nextPlayer)?.name })
        }
        break
      }

      case 'SAVE_GAME': {
        if (!client.roomId) break
        const players = getRoomPlayers(client.roomId)
        const msgs = getRoomMessages(client.roomId, 200)
        const game = getGame(client.roomId)
        const saves = saveGame(client.roomId, msg.label || `第${game?.round || 1}回合`, {
          players: players.map(p => ({ ...p, char_data: p.char_data })),
          messages: msgs,
          round: game?.round || 1,
          currentPlayerIdx: game?.currentPlayerIdx || 0
        })
        ws.send(JSON.stringify({ type: 'SAVE_LIST', saves }))
        break
      }

      case 'LOAD_GAME': {
        if (!client.roomId) break
        const save = loadSave(msg.saveId)
        if (!save) { ws.send(JSON.stringify({ type: 'ERROR', text: '存档不存在' })); break }
        // 恢复消息
        const msgs = save.data.messages || []
        for (const m of msgs.slice(-50)) {
          broadcastToRoom(client.roomId, { type: 'CHAT', from: m.player_id || '', playerName: m.player_id || '系统', text: m.content, time: Date.now() })
        }
        // 恢复回合
        if (save.data.round) {
          const g = getGame(client.roomId)
          if (g) { g.round = save.data.round; g.currentPlayerIdx = save.data.currentPlayerIdx || 0 }
        }
        ws.send(JSON.stringify({ type: 'GAME_LOADED', save }))
        break
      }

      case 'SAVE_LIST': {
        if (!client.roomId) break
        ws.send(JSON.stringify({ type: 'SAVE_LIST', saves: listSaves(client.roomId) }))
        break
      }

      default:
        // 回显未知消息类型
        ws.send(JSON.stringify({ type: 'ECHO', original: msg }))
    }
  })

  // 断开
  ws.on('close', () => {
    const client = clients.get(ws)
    if (client?.roomId) {
      leaveRoom(client.roomId, client.id)
      broadcastToRoom(client.roomId, { type: 'PLAYER_LEFT', clientId: client.id, playerName: client.playerName })
    }
    console.log(`[WS] 断开: ${client?.id || '?'} (剩余 ${clients.size - 1} 人)`)
    clients.delete(ws)
  })

  ws.on('error', (err) => {
    console.error(`[WS] 错误:`, err.message)
    clients.delete(ws)
  })
})

/** 广播消息给所有连接的客户端 */
function broadcast(data) {
  const json = JSON.stringify(data)
  for (const ws of clients.keys()) {
    if (ws.readyState === 1) ws.send(json)
  }
}

/** 广播给指定房间内所有在线玩家 */
function broadcastToRoom(roomId, data) {
  const json = JSON.stringify(data)
  for (const [ws, client] of clients) {
    if (client.roomId === roomId && ws.readyState === 1) ws.send(json)
  }
}

/** 流式调用 DeepSeek API 汇总玩家行动，逐 token 广播给全房间 */
async function aiSummarizeStream(roomId, actions) {
  const actionText = actions.map((a, i) => `${i + 1}. ${a.clientId}: ${a.text || '(未发言)'}`).join('\n')
  const apiKey = getRoomApiKey(roomId)
  if (!apiKey) { broadcastToRoom(roomId, { type: 'AI_ERROR', text: '房主未配置 API Key' }); return }

  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        stream: true,
        messages: [
          { role: 'system', content: `你是跑团 DM。根据所有玩家的行动，生成一段剧情推进叙述(200-400字)，以第二人称叙述，结尾给出新的引导问句。` },
          { role: 'user', content: `本回合玩家行动:\n${actionText}\n\n请生成剧情推进:` }
        ],
        temperature: 0.85,
        max_tokens: 800
      })
    })

    if (!res.ok) {
      broadcastToRoom(roomId, { type: 'AI_ERROR', text: `AI 调用失败: ${res.status}` })
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') break

        try {
          const json = JSON.parse(data)
          const token = json.choices?.[0]?.delta?.content
          if (token) {
            fullContent += token
            broadcastToRoom(roomId, { type: 'AI_TOKEN', token, round: actions[0]?.round || 1 })
          }
        } catch {}
      }
    }

    broadcastToRoom(roomId, { type: 'AI_DONE', content: fullContent, round: actions[0]?.round || 1 })
  } catch (e) {
    console.error('[AI] 流式调用失败:', e.message)
    broadcastToRoom(roomId, { type: 'AI_ERROR', text: e.message })
  }
}

// ======================== 启动 ========================
async function start() {
  await initDB()
  server.listen(PORT, () => {
    console.log(`\n  🎲 跑团多人服务已启动`)
    console.log(`  HTTP:     http://localhost:${PORT}`)
    console.log(`  WebSocket: ws://localhost:${PORT}\n`)
  })
}
start()
