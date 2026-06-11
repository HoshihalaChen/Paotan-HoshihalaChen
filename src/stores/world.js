import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '../db/index.js'

/** 世界观情报管理 */
export const useWorldStore = defineStore('world', () => {
  const categories = ref([])
  const entries = ref([])
  const selectedCategory = ref(null)

  // 默认分类
  const defaultCategories = ['种族', '地理', '历史', '宗教', '魔法体系', '组织势力', '人物传记']

  /** 加载数据 */
  async function loadWorldData(sessionId) {
    entries.value = await db.worldInfo.where('sessionId').equals(sessionId).toArray()
    // 从条目中提取分类
    const cats = [...new Set(entries.value.map(e => e.category))]
    categories.value = cats.length > 0 ? cats : defaultCategories
  }

  /** 添加分类 */
  async function addCategory(name) {
    if (!categories.value.includes(name)) {
      categories.value.push(name)
    }
  }

  /** 添加/更新条目 */
  async function addEntry(sessionId, entry) {
    // 确保数据可序列化（去除 Vue 响应式代理）
    const raw = JSON.parse(JSON.stringify(entry))
    const data = {
      sessionId,
      category: raw.category || '未分类',
      title: raw.title || '',
      content: raw.content || '',
      tags: raw.tags || [],
      icon: raw.icon || '◆',
      order: raw.order || 0,
    }
    if (entry.id) {
      await db.worldInfo.update(entry.id, data)
    } else {
      await db.worldInfo.add(data)
    }
    await loadWorldData(sessionId)
  }

  /** 删除条目 */
  async function deleteEntry(id, sessionId) {
    await db.worldInfo.delete(id)
    await loadWorldData(sessionId)
  }

  function selectCategory(cat) {
    selectedCategory.value = cat
  }

  // 当前选中分类的条目
  const filteredEntries = computed(() => {
    if (!selectedCategory.value) return entries.value
    return entries.value.filter(e => e.category === selectedCategory.value)
  })

  return {
    categories, entries, selectedCategory, filteredEntries,
    loadWorldData, addCategory, addEntry, deleteEntry, selectCategory
  }
})
