import { ref } from 'vue'
import { db } from '../db/index.js'
import { exportChatToMarkdown, exportToJSON, downloadFile, formatDate } from '../utils/format.js'

/** 数据导出 composable */
export function useExport() {
  const isExporting = ref(false)

  /** 导出聊天记录为 Markdown */
  async function exportChat(sessionId, sessionName) {
    isExporting.value = true
    const messages = await db.messages.where('sessionId').equals(sessionId).sortBy('timestamp')
    const md = exportChatToMarkdown(messages, sessionName)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    downloadFile(url, `${sessionName || '跑团记录'}_${formatDate(Date.now()).replace(/\s/g, '_')}.md`)
    isExporting.value = false
  }

  /** 导出完整会话数据为 JSON */
  async function exportFullSession(sessionId, sessionName) {
    isExporting.value = true
    const [characters, messages, diceLogs, worldInfo, logEntries] = await Promise.all([
      db.characters.where('sessionId').equals(sessionId).toArray(),
      db.messages.where('sessionId').equals(sessionId).toArray(),
      db.diceLogs.where('sessionId').equals(sessionId).toArray(),
      db.worldInfo.where('sessionId').equals(sessionId).toArray(),
      db.logEntries.where('sessionId').equals(sessionId).toArray()
    ])
    const data = {
      exportTime: formatDate(Date.now()),
      sessionName,
      characters, messages, diceLogs, worldInfo, logEntries
    }
    const url = exportToJSON(data, sessionName)
    downloadFile(url, `${sessionName || '跑团数据'}_${formatDate(Date.now()).replace(/\s/g, '_')}.json`)
    isExporting.value = false
  }

  /** 导出角色卡 */
  async function exportCharacter(character) {
    const data = {
      ...character,
      exportTime: formatDate(Date.now())
    }
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    downloadFile(url, `角色卡_${character.name}_${formatDate(Date.now()).replace(/\s/g, '_')}.json`)
  }

  return { isExporting, exportChat, exportFullSession, exportCharacter }
}
