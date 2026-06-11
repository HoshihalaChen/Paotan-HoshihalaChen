import { ref } from 'vue'
import { streamChat } from '../services/deepseek.js'
import { buildSystemPrompt, buildMessages, getContextWindow } from '../services/memory.js'

/**
 * AI 流式聊天 composable
 * 提供完整的 DM 对话能力，带模组隔离上下文管理
 */
export function useStreaming() {
  const isStreaming = ref(false)
  const streamContent = ref('')
  const error = ref(null)
  let abortController = null

  /**
   * 开始流式聊天
   * @param {Object} options
   * @param {Array}  options.messages - 已有历史消息
   * @param {Object} options.session - 当前会话
   * @param {Array}  options.characters - 队伍角色列表
   * @param {Array}  options.worldEntries - 世界观条目
   * @param {string} options.summary - 剧情摘要
   * @param {string} options.userMessage - 当前用户消息
   * @param {string} options.moduleContextText - 模块隔离上下文（完整模块数据文本）
   */
  async function startStream({
    messages: historyMessages,
    session,
    characters,
    worldEntries,
    summary,
    userMessage,
    moduleContextText
  }) {
    // 构建增强的系统提示词（含模组隔离边界）
    const systemPrompt = buildSystemPrompt({
      session,
      characters,
      worldEntries,
      summary,
      moduleContextText
    })

    // 获取上下文窗口
    const contextMessages = getContextWindow(historyMessages, 25)

    // 构建完整的消息数组
    const msgs = buildMessages(systemPrompt, contextMessages, userMessage)

    // 重置状态
    isStreaming.value = true
    streamContent.value = ''
    error.value = null
    abortController = new AbortController()

    await streamChat(msgs, {
      onToken: (token) => {
        streamContent.value += token
      },
      onDone: () => {
        isStreaming.value = false
      },
      onError: (err) => {
        error.value = err.message
        isStreaming.value = false
      },
      signal: abortController.signal
    })
  }

  /** 取消流式输出 */
  function cancelStream() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    isStreaming.value = false
  }

  return { isStreaming, streamContent, error, startStream, cancelStream }
}
