/**
 * 格式化工具函数
 */

/** 格式化时间戳为可读日期 */
export function formatDate(timestamp) {
  const d = new Date(timestamp)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}`
}

/** 格式化时间戳为简短时间 */
export function formatTime(timestamp) {
  const d = new Date(timestamp)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 截断文本 */
export function truncate(text, maxLen = 100) {
  if (!text) return ''
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

/** 根据属性值返回颜色 */
export function statColor(value) {
  if (value >= 18) return '#5A7A5A' // 暗绿，优秀
  if (value >= 14) return '#7A8B6A' // 黄绿，良好
  if (value >= 10) return '#8B8580' // 灰，普通
  if (value >= 6) return '#9B7A5A'  // 棕，较差
  return '#8B5A5A'                   // 红棕，差
}

/** 属性名称映射 */
export const statLabels = {
  str: '力量', dex: '敏捷', con: '体质',
  int: '智力', wis: '感知', cha: '魅力'
}

/** 导出 Markdown 格式的聊天记录 */
export function exportChatToMarkdown(messages, sessionName) {
  let md = `# ${sessionName || '跑团记录'}\n\n`
  md += `> 导出时间: ${formatDate(Date.now())}\n\n---\n\n`
  for (const msg of messages) {
    const roleLabel = { user: '玩家', assistant: 'DM', system: '系统', dice: '骰子' }[msg.role] || msg.role
    const time = formatTime(msg.timestamp)
    md += `**${roleLabel}** *(${time})*\n\n${msg.content}\n\n---\n\n`
  }
  return md
}

/** 导出 JSON 格式的完整数据 */
export function exportToJSON(data, name) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  return URL.createObjectURL(blob)
}

/** 触发文件下载 */
export function downloadFile(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
