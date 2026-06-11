import Dexie from 'dexie'

/** 数据库版本标记 — 变更时自动清理旧缓存 */
const DB_VERSION_KEY = 'paotuan_db_version'
const CURRENT_DB_VERSION = 1

class PaotuanDB extends Dexie {
  constructor() {
    super('PaotuanDB')

    this.version(3).stores({
      sessions: '++id, name, system, createdAt, updatedAt',
      characters: '++id, sessionId, name, class, race, level, createdAt',
      messages: '++id, sessionId, characterId, role, type, timestamp',
      worldInfo: '++id, sessionId, category, title, order',
      logEntries: '++id, sessionId, title, timestamp',
      diceLogs: '++id, sessionId, characterId, timestamp',
      mapData: '++id, sessionId',
      backups: '++id, sessionId, filename, createdAt',
      archives: '++id, sessionId, characterId, moduleName, characterName, dayCount, createdAt',
    })

    this.sessions = this.table('sessions')
    this.characters = this.table('characters')
    this.messages = this.table('messages')
    this.worldInfo = this.table('worldInfo')
    this.logEntries = this.table('logEntries')
    this.diceLogs = this.table('diceLogs')
    this.mapData = this.table('mapData')
    this.backups = this.table('backups')
    this.archives = this.table('archives')
  }
}

let _db = null
let _dbReady = false
let _dbError = null

/**
 * 安全获取数据库实例 — 自动处理版本冲突和缓存清理
 */
export async function getDB() {
  if (_dbReady) return _db

  try {
    // 检查版本标记，不匹配则清理旧库
    const storedVersion = localStorage.getItem(DB_VERSION_KEY)
    if (storedVersion && parseInt(storedVersion) !== CURRENT_DB_VERSION) {
      console.warn('[DB] 版本不匹配，清理旧缓存')
      try { await Dexie.delete('PaotuanDB') } catch {}
    }

    _db = new PaotuanDB()
    await _db.open()
    localStorage.setItem(DB_VERSION_KEY, String(CURRENT_DB_VERSION))
    _dbReady = true
    _dbError = null
    console.log('[DB] 数据库已就绪')
    return _db
  } catch (e) {
    console.error('[DB] 打开失败，尝试重建:', e.message)
    _dbError = e
    // 删除并重建
    try { await Dexie.delete('PaotuanDB') } catch {}
    try {
      _db = new PaotuanDB()
      await _db.open()
      localStorage.setItem(DB_VERSION_KEY, String(CURRENT_DB_VERSION))
      _dbReady = true
      _dbError = null
      return _db
    } catch (e2) {
      _dbError = e2
      throw e2
    }
  }
}

/** 数据库实例 — Dexie 支持未 open 时排队操作 */
export const db = new PaotuanDB()

/** 初始化数据库连接，自动处理版本冲突和损坏恢复 */
export async function initDB() {
  if (_dbReady) return

  const stored = localStorage.getItem(DB_VERSION_KEY)
  const versionMismatch = stored && parseInt(stored) !== CURRENT_DB_VERSION

  if (versionMismatch) {
    try { await Dexie.delete('PaotuanDB') } catch {}
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.open()
      localStorage.setItem(DB_VERSION_KEY, String(CURRENT_DB_VERSION))
      _dbReady = true
      return
    } catch (e) {
      if (attempt < 2) {
        try { await Dexie.delete('PaotuanDB') } catch {}
      } else {
        throw e
      }
    }
  }
}
