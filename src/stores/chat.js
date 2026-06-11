import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '../db/index.js'

/** 聊天消息状态管理 - 消息收发、AI 流式回复 */
export const useChatStore = defineStore('chat', () => {
  const messages = ref([])
  const isStreaming = ref(false)
  const streamingContent = ref('')

  /** 加载指定会话的聊天记录 */
  async function loadMessages(sessionId) {
    messages.value = await db.messages
      .where('sessionId').equals(sessionId)
      .sortBy('timestamp')
  }

  /** 添加消息到数据库和本地状态 */
  async function addMessage({ sessionId, characterId, role, content, type = 'chat' }) {
    const msg = {
      sessionId,
      characterId: characterId || null,
      role,
      content,
      type,
      timestamp: Date.now()
    }
    const id = await db.messages.add(msg)
    msg.id = id
    messages.value.push(msg)
    return msg
  }

  /** 设置流式状态 */
  function startStreaming() {
    isStreaming.value = true
    streamingContent.value = ''
  }

  function appendStreamToken(token) {
    streamingContent.value += token
  }

  async function finishStreaming(sessionId, characterId) {
    isStreaming.value = false
    // 将流式内容保存为正式消息
    if (streamingContent.value.trim()) {
      const msg = await addMessage({
        sessionId,
        characterId,
        role: 'assistant',
        content: streamingContent.value,
        type: 'chat'
      })
      streamingContent.value = ''
      return msg
    }
    streamingContent.value = ''
    return null
  }

  /** 清空聊天（本地 + DB） */
  async function clearChat(sessionId) {
    messages.value = []
    await db.messages.where('sessionId').equals(sessionId).delete()
  }

  return {
    messages, isStreaming, streamingContent,
    loadMessages, addMessage,
    startStreaming, appendStreamToken, finishStreaming,
    clearChat
  }
})
