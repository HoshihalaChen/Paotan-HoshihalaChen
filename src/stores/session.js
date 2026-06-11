import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '../db/index.js'

/** 跑团会话状态管理 */
export const useSessionStore = defineStore('session', () => {
  const sessions = ref([])
  const currentSessionId = ref(null)

  // 当前会话对象
  const currentSession = computed(() =>
    sessions.value.find(s => s.id === currentSessionId.value) || null
  )

  // 当前会话的游戏是否激活中
  const isGameActive = computed(() =>
    currentSession.value?.gameActive === true
  )

  /** 从数据库加载所有会话 */
  async function loadSessions() {
    sessions.value = await db.sessions.orderBy('updatedAt').reverse().toArray()
    // 如果无会话，创建一个默认示例会话
    if (sessions.value.length === 0) {
      const id = await db.sessions.add({
        name: '示例冒险 - 失落矿坑',
        system: 'D&D 5E',
        description: '经典的入门冒险模组，探索凡达林附近的失落矿坑。',
        gameActive: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
      currentSessionId.value = id
      await loadSessions()
    }
    // 默认选中第一个
    if (!currentSessionId.value && sessions.value.length > 0) {
      currentSessionId.value = sessions.value[0].id
    }
  }

  /** 创建新会话 */
  async function createSession({ name, system, description, moduleId }) {
    const id = await db.sessions.add({
      name, system, description,
      moduleId: moduleId || null,
      gameActive: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    currentSessionId.value = id
    await loadSessions()
    return id
  }

  /** 删除会话 */
  async function deleteSession(id) {
    await db.sessions.delete(id)
    // 清理关联数据
    await db.characters.where('sessionId').equals(id).delete()
    await db.messages.where('sessionId').equals(id).delete()
    await db.worldInfo.where('sessionId').equals(id).delete()
    await db.logEntries.where('sessionId').equals(id).delete()
    await db.diceLogs.where('sessionId').equals(id).delete()
    await db.mapData.where('sessionId').equals(id).delete()
    await loadSessions()
  }

  /** 切换会话 */
  async function switchSession(id) {
    currentSessionId.value = id
    await db.sessions.update(id, { updatedAt: Date.now() })
  }

  /** 激活游戏 - 设置会话的游戏运行状态 */
  async function activateGame(sessionId) {
    await db.sessions.update(sessionId, { gameActive: true, updatedAt: Date.now() })
    await loadSessions()
  }

  /** 结束游戏 - 重置游戏状态（测试用快捷接口） */
  async function resetGame(sessionId) {
    await db.sessions.update(sessionId, { gameActive: false, updatedAt: Date.now() })
    // 清空游戏数据
    await db.messages.where('sessionId').equals(sessionId).delete()
    await db.diceLogs.where('sessionId').equals(sessionId).delete()
    await db.logEntries.where('sessionId').equals(sessionId).delete()
    await loadSessions()
  }

  /** 检查指定会话的游戏是否激活 */
  function checkGameActive(sessionId) {
    const session = sessions.value.find(s => s.id === sessionId)
    return session?.gameActive === true
  }

  return {
    sessions, currentSessionId, currentSession, isGameActive,
    loadSessions, createSession, deleteSession, switchSession,
    activateGame, resetGame, checkGameActive
  }
})
