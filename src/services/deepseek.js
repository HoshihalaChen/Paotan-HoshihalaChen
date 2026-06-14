/**
 * DeepSeek API 流式调用服务
 * 使用 fetch + ReadableStream 实现 SSE 流式打字机效果
 * 默认配置 DeepSeek V4 PRO 模型
 */

const API_BASE = 'https://api.deepseek.com/v1'
const API_KEY_STORAGE_KEY = 'paotuan_deepseek_api_key'

/** 获取 API Key — 用户必须在设置中配置 */
export function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE_KEY) || ''
}

/** 设置用户自定义 API Key */
export function setApiKey(key) {
  localStorage.setItem(API_KEY_STORAGE_KEY, key)
}

/** 是否使用了用户自定义 Key */
export function hasCustomApiKey() {
  return !!localStorage.getItem(API_KEY_STORAGE_KEY)
}

/**
 * 流式聊天请求 - 使用 fetch ReadableStream
 */
export async function streamChat(messages, { onToken, onDone, onError, signal }) {
  const apiKey = getApiKey()
  if (!apiKey) {
    onError(new Error('请先在设置页面配置 DeepSeek API Key'))
    return
  }

  try {
    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        stream: true,
        temperature: 0.85,
        max_tokens: 4096,
        frequency_penalty: 0.3,
        presence_penalty: 0.3
      }),
      signal
    })

    if (!response.ok) {
      const errText = await response.text()
      let errMsg = `API 请求失败: ${response.status}`
      try {
        const err = JSON.parse(errText)
        errMsg = err.error?.message || errMsg
      } catch {}
      throw new Error(errMsg)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

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
        if (data === '[DONE]') {
          onDone && onDone()
          return
        }
        try {
          const json = JSON.parse(data)
          const content = json.choices?.[0]?.delta?.content
          if (content) {
            onToken && onToken(content)
          }
        } catch {
          // skip parse errors
        }
      }
    }
    onDone && onDone()
  } catch (err) {
    if (err.name === 'AbortError') {
      onDone && onDone()
      return
    }
    onError && onError(err)
  }
}

/**
 * 非流式聊天（用于摘要生成等场景）
 */
export async function chatCompletion(messages) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('请先配置 API Key')

  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.5,
      max_tokens: 2048
    })
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `API 请求失败: ${response.status}`)
  }

  const json = await response.json()
  return json.choices[0].message.content
}
