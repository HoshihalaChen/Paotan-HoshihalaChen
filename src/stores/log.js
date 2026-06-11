import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '../db/index.js'

/** 冒险日志管理 */
export const useLogStore = defineStore('log', () => {
  const entries = ref([])
  const currentEntryId = ref(null)

  /** 加载日志 */
  async function loadLogs(sessionId) {
    entries.value = await db.logEntries.where('sessionId').equals(sessionId).reverse().sortBy('timestamp')
  }

  /** 创建日志条目 */
  async function createEntry(sessionId, data) {
    const entry = {
      sessionId,
      title: data.title || '新日志',
      content: data.content || '',
      relatedNPCs: data.relatedNPCs || [],
      tags: data.tags || [],
      timestamp: Date.now()
    }
    const id = await db.logEntries.add(entry)
    currentEntryId.value = id
    await loadLogs(sessionId)
    return id
  }

  /** 更新日志 */
  async function updateEntry(id, updates) {
    await db.logEntries.update(id, updates)
    const entry = await db.logEntries.get(id)
    if (entry) await loadLogs(entry.sessionId)
  }

  /** 删除日志 */
  async function deleteEntry(id) {
    const entry = await db.logEntries.get(id)
    await db.logEntries.delete(id)
    if (entry) await loadLogs(entry.sessionId)
  }

  function selectEntry(id) {
    currentEntryId.value = id
  }

  const currentEntry = computed(() =>
    entries.value.find(e => e.id === currentEntryId.value) || null
  )

  return {
    entries, currentEntryId, currentEntry,
    loadLogs, createEntry, updateEntry, deleteEntry, selectEntry
  }
})

