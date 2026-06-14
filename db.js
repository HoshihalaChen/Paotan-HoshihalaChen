/**
 * 数据库层 — sql.js (SQLite WebAssembly)
 * 单文件存储，无需安装数据库软件
 */
const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')

const DB_PATH = path.join(__dirname, 'paotuan.db')

let db = null

/** 初始化数据库连接并建表 */
async function initDB() {
  const SQL = await initSqlJs()

  // 尝试从文件加载已有数据库
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH)
    db = new SQL.Database(buffer)
    console.log('[DB] 已加载:', DB_PATH)
  } else {
    db = new SQL.Database()
    console.log('[DB] 新建内存数据库')
  }

  // 建表（IF NOT EXISTS 保证幂等）
  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id        TEXT PRIMARY KEY,
      code      TEXT NOT NULL UNIQUE,
      module_id TEXT DEFAULT '',
      module_name TEXT DEFAULT '',
      status    TEXT DEFAULT 'waiting',  -- waiting | playing | ended
      max_players INTEGER DEFAULT 5,
      host_id   TEXT DEFAULT '',
      api_key   TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS players (
      id        TEXT PRIMARY KEY,
      room_id   TEXT NOT NULL REFERENCES rooms(id),
      client_id TEXT NOT NULL,
      name      TEXT DEFAULT '',
      char_data TEXT DEFAULT '{}',  -- JSON
      is_host   INTEGER DEFAULT 0,
      turn_order INTEGER DEFAULT 0,
      is_online INTEGER DEFAULT 0,
      joined_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id   TEXT NOT NULL REFERENCES rooms(id),
      player_id TEXT DEFAULT '',
      role      TEXT DEFAULT 'user',
      content   TEXT DEFAULT '',
      type      TEXT DEFAULT 'chat',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS saves (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id   TEXT NOT NULL,
      label     TEXT DEFAULT '',
      data      TEXT DEFAULT '{}',  -- JSON: {players, messages, round, ...}
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_id);
    CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);
  `)

  return db
}

/** 持久化到磁盘 */
function saveDB() {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(DB_PATH, buffer)
}

// ==================== 房间操作 ====================

/** 生成 6 位邀请码 */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

/** 创建房间 */
function createRoom(moduleId = '', moduleName = '', hostClientId = '', apiKey = '') {
  const id = `room_${Date.now()}`
  const code = generateCode()
  db.run(
    'INSERT INTO rooms (id, code, module_id, module_name, host_id, api_key) VALUES (?, ?, ?, ?, ?, ?)',
    [id, code, moduleId, moduleName, hostClientId, apiKey]
  )
  saveDB()
  return { id, code }
}

/** 通过邀请码查找房间 */
function findRoomByCode(code) {
  const stmt = db.prepare('SELECT * FROM rooms WHERE code = ?')
  stmt.bind([code])
  if (stmt.step()) {
    const row = stmt.getAsObject()
    stmt.free()
    return row
  }
  stmt.free()
  return null
}

/** 获取房间的 API Key */
function getRoomApiKey(roomId) {
  const r = getRoom(roomId)
  return r?.api_key || ''
}

/** 通过 ID 查找房间 */
function getRoom(id) {
  const stmt = db.prepare('SELECT * FROM rooms WHERE id = ?')
  stmt.bind([id])
  if (stmt.step()) {
    const row = stmt.getAsObject()
    stmt.free()
    return row
  }
  stmt.free()
  return null
}

/** 获取房间内所有玩家 */
function getRoomPlayers(roomId) {
  const stmt = db.prepare('SELECT * FROM players WHERE room_id = ? ORDER BY turn_order')
  stmt.bind([roomId])
  const players = []
  while (stmt.step()) players.push(stmt.getAsObject())
  stmt.free()
  return players
}

// ==================== 玩家操作 ====================

/** 玩家加入房间 */
function joinRoom(roomId, clientId, name = '') {
  // 已加入则更新
  const existing = db.prepare('SELECT * FROM players WHERE room_id = ? AND client_id = ?')
  existing.bind([roomId, clientId])
  if (existing.step()) {
    existing.free()
    db.run('UPDATE players SET name = ?, is_online = 1 WHERE room_id = ? AND client_id = ?',
      [name, roomId, clientId])
  } else {
    const id = `player_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`
    const count = db.prepare('SELECT COUNT(*) as c FROM players WHERE room_id = ?')
    count.bind([roomId])
    count.step()
    const order = count.getAsObject().c
    count.free()

    db.run('INSERT INTO players (id, room_id, client_id, name, is_host, turn_order, is_online) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [id, roomId, clientId, name, 0, order])
  }
  saveDB()
}

/** 更新玩家角色数据 */
function updatePlayerChar(roomId, clientId, charData) {
  const json = typeof charData === 'string' ? charData : JSON.stringify(charData)
  db.run('UPDATE players SET char_data = ? WHERE room_id = ? AND client_id = ?',
    [json, roomId, clientId])
  saveDB()
}

/** 玩家离开房间 */
function leaveRoom(roomId, clientId) {
  db.run('UPDATE players SET is_online = 0 WHERE room_id = ? AND client_id = ?', [roomId, clientId])
  saveDB()
}

// ==================== 消息操作 ====================

/** 保存消息 */
function saveMessage(roomId, playerId, role, content, type = 'chat') {
  db.run('INSERT INTO messages (room_id, player_id, role, content, type) VALUES (?, ?, ?, ?, ?)',
    [roomId, playerId, role, content, type])
  saveDB()
}

/** 获取房间消息 */
function getRoomMessages(roomId, limit = 50) {
  const stmt = db.prepare('SELECT * FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?')
  stmt.bind([roomId, limit])
  const msgs = []
  while (stmt.step()) msgs.push(stmt.getAsObject())
  stmt.free()
  return msgs.reverse()
}

/** 健康检查 */
/** 保存游戏快照 */
function saveGame(roomId, label = '', data = {}) {
  db.run('INSERT INTO saves (room_id, label, data) VALUES (?, ?, ?)',
    [roomId, label, JSON.stringify(data)])
  saveDB()
  return listSaves(roomId)
}

/** 获取房间的存档列表 */
function listSaves(roomId) {
  const stmt = db.prepare('SELECT id, label, created_at FROM saves WHERE room_id = ? ORDER BY created_at DESC')
  stmt.bind([roomId])
  const saves = []
  while (stmt.step()) saves.push(stmt.getAsObject())
  stmt.free()
  return saves
}

/** 加载存档 */
function loadSave(saveId) {
  const stmt = db.prepare('SELECT * FROM saves WHERE id = ?')
  stmt.bind([saveId])
  if (stmt.step()) {
    const row = stmt.getAsObject()
    stmt.free()
    return { ...row, data: JSON.parse(row.data || '{}') }
  }
  stmt.free()
  return null
}

function dbStatus() {
  if (!db) return { ok: false }
  const count = db.prepare('SELECT COUNT(*) as c FROM rooms').step() ? 1 : 0
  return { ok: true, file: DB_PATH }
}

module.exports = { initDB, saveDB, createRoom, findRoomByCode, getRoom, getRoomPlayers,
  joinRoom, leaveRoom, updatePlayerChar, getRoomApiKey, saveMessage, getRoomMessages,
  saveGame, listSaves, loadSave, dbStatus }
