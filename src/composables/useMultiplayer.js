/**
 * 多人模式 WebSocket 客户端
 * 连接后端 ws://localhost:3300，管理房间状态
 */
import { ref, shallowRef, computed } from 'vue'

// 生产环境用 Render 部署地址，开发环境用 localhost
const WS_URL = window.location.hostname === 'localhost'
  ? 'ws://localhost:3506'
  : 'wss://paotuan-server.onrender.com'  // 部署后替换为实际 Render URL

export function useMultiplayer() {
  const isConnected = ref(false)
  const clientId = ref('')
  const room = ref(null)           // { id, code, moduleName, ... }
  const players = ref([])           // [{ id, name, ... }]
  const messages = ref([])          // [{ role, content, playerId, ... }]
  const error = ref('')
  const saves = ref([])
  const ws = shallowRef(null)

  function connect(name = '') {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(WS_URL)
      socket.onopen = () => {
        isConnected.value = true
        ws.value = socket
        if (name) socket.send(JSON.stringify({ type: 'SET_NAME', name }))

        // 断线重连：发送保存的房间信息
        const savedRoom = getSavedRoom()
        if (savedRoom) {
          socket.send(JSON.stringify({ type: 'RECONNECT', roomId: savedRoom.roomId, clientId: savedRoom.clientId, playerName: name }))
        }
        resolve()
      }
      socket.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          handleMessage(msg)
        } catch { }
      }
      socket.onclose = () => { isConnected.value = false; ws.value = null }
      socket.onerror = () => { error.value = '连接失败'; reject(new Error('connect failed')) }
    })
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'WELCOME':
        clientId.value = msg.clientId
        break
      case 'ROOM_CREATED':
      case 'ROOM_JOINED':
        room.value = msg
        players.value = msg.players || []
        saveRoomState()
        break
      case 'RECONNECTED':
        // 断线重连：全量恢复
        room.value = msg.room
        players.value = msg.players || []
        messages.value = msg.messages || []
        saveRoomState()
        break
      case 'PLAYER_JOINED':
        players.value = msg.players || []
        break
      case 'CHAR_UPDATED':
        players.value = msg.players || []
        break
      case 'GAME_STARTING':
        room.value = { ...room.value, status: 'playing' }
        players.value = msg.players || []
        // 所有玩家自动进入游戏页
        import('../stores/ui.js').then(m => m.useUIStore().setPage('game'))
        break
      case 'TURN_START':
        room.value = { ...room.value, currentTurn: msg.clientId, currentPlayerName: msg.playerName }
        break
      case 'ROUND_COMPLETE':
        messages.value.push({ role: 'system', content: '[回合汇总]\n' + msg.summary, type: 'system' })
        break
      case 'AI_TOKEN':
        // 流式：追加 token 到最后一条 AI 消息
        if (msg.token) {
          const lastMsg = messages.value[messages.value.length - 1]
          if (lastMsg?.role === 'assistant' && lastMsg._streaming) {
            lastMsg.content += msg.token
          } else {
            messages.value.push({ role: 'assistant', content: msg.token, type: 'chat', _streaming: true })
          }
        }
        break
      case 'AI_DONE':
        // 流式结束：标记完成
        const lastDone = messages.value[messages.value.length - 1]
        if (lastDone?._streaming) lastDone._streaming = false
        room.value = { ...room.value, phase: 'action' }
        break
      case 'STATE_SYNC':
        if (msg.players) players.value = msg.players
        break
      case 'SAVE_LIST':
        saves.value = msg.saves || []
        break
      case 'GAME_LOADED':
        messages.value = msg.save?.data?.messages || []
        room.value = { ...room.value, round: msg.save?.data?.round || 1 }
        break
      case 'AI_ERROR':
        messages.value.push({ role: 'system', content: '[AI 错误] ' + msg.text, type: 'system' })
        break
      case 'AI_RESPONSE':
        messages.value.push({ role: 'assistant', content: msg.content, type: 'chat' })
        room.value = { ...room.value, phase: 'action' }
        break
      case 'PLAYER_LEFT':
        players.value = players.value.filter(p => p.clientId !== msg.clientId)
        break
      case 'ROOM_STATE':
        room.value = msg.room
        players.value = msg.players || []
        messages.value = msg.messages || []
        break
      case 'CHAT':
        messages.value.push({ role: 'user', content: msg.text, playerId: msg.from, playerName: msg.playerName })
        break
      case 'ERROR':
        error.value = msg.text
        break
    }
  }

  function send(data) {
    if (ws.value && ws.value.readyState === 1) ws.value.send(JSON.stringify(data))
  }

  function createRoom(moduleId = '', moduleName = '', apiKey = '') {
    send({ type: 'ROOM_CREATE', moduleId, moduleName, apiKey: apiKey || getDeepSeekKey() })
  }

  function saveRoomState() {
    if (room.value && clientId.value) {
      try { localStorage.setItem('paotuan_reconnect', JSON.stringify({ roomId: room.value.id, clientId: clientId.value })) } catch {}
    }
  }

  function getSavedRoom() {
    try { return JSON.parse(localStorage.getItem('paotuan_reconnect') || 'null') } catch { return null }
  }

  function getDeepSeekKey() {
    try {
      if (typeof window !== 'undefined') {
        return localStorage.getItem('paotuan_deepseek_api_key') || ''
      }
    } catch {}
    return ''
  }

  function joinRoom(code) {
    send({ type: 'ROOM_JOIN', code: code.toUpperCase() })
  }

  function leaveRoom() {
    send({ type: 'ROOM_LEAVE' })
    room.value = null
    players.value = []
  }

  function sendChat(text) {
    send({ type: 'CHAT', text })
  }

  function submitAction(text) {
    send({ type: 'ACTION_SUBMIT', text })
  }

  function syncState(charData) {
    send({ type: 'STATE_UPDATE', charData })
  }

  function saveGame(label = '') {
    send({ type: 'SAVE_GAME', label })
  }
  function loadGame(saveId) {
    send({ type: 'LOAD_GAME', saveId })
  }
  function listSaves() {
    send({ type: 'SAVE_LIST' })
  }

  function disconnect() {
    if (ws.value) ws.value.close()
  }

  /** 是否在多人游戏中 */
  const isInGame = computed(() => room.value?.status === 'playing')

  /** 是否轮到自己行动 */
  const myTurn = computed(() =>
    isInGame.value && room.value?.currentTurn === clientId.value
  )

  /** 当前回合的玩家名 */
  const currentPlayerName = computed(() =>
    room.value?.currentPlayerName || ''
  )

  return { isConnected, clientId, room, players, messages, error,
    send, connect, createRoom, joinRoom, leaveRoom, sendChat, submitAction, syncState, disconnect,
    saveGame, loadGame, listSaves, saves,
    isInGame, myTurn, currentPlayerName }
}
