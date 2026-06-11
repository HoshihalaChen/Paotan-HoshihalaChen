import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '../db/index.js'

/** 角色管理状态 */
export const useCharacterStore = defineStore('character', () => {
  const characters = ref([])
  const currentCharacterId = ref(null)

  const currentCharacter = computed(() =>
    characters.value.find(c => c.id === currentCharacterId.value) || null
  )

  // 默认属性值
  const defaultStats = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, hp: 10, maxHp: 10, mp: 5, maxMp: 5 }

  /** 加载指定会话的角色 */
  async function loadCharacters(sessionId) {
    characters.value = await db.characters.where('sessionId').equals(sessionId).toArray()
    if (characters.value.length > 0 && !currentCharacterId.value) {
      currentCharacterId.value = characters.value[0].id
    }
  }

  /** 创建角色 */
  async function createCharacter(sessionId, data) {
    // 深度拷贝去除 Vue 响应式代理，确保 IndexedDB 可序列化
    const raw = JSON.parse(JSON.stringify(data))
    const charData = {
      sessionId,
      ...defaultStats,
      ...raw,
      avatar: raw.avatar || '',
      equipment: raw.equipment || [],
      skills: raw.skills || [],
      npcAffinity: raw.npcAffinity || {},
      status: raw.status || '正常',
      class: raw.class || '战士',
      race: raw.race || '人类',
      level: raw.level || 1,
      createdAt: Date.now()
    }
    const id = await db.characters.add(charData)
    currentCharacterId.value = id
    await loadCharacters(sessionId)
    return id
  }

  /** 更新角色属性 */
  async function updateCharacter(id, updates) {
    await db.characters.update(id, updates)
    await loadCharacters(db.characters.get(id).then(c => c?.sessionId))
  }

  /** 删除角色 */
  async function deleteCharacter(id) {
    const char = await db.characters.get(id)
    await db.characters.delete(id)
    if (char) await loadCharacters(char.sessionId)
  }

  /** 选择当前角色 */
  function selectCharacter(id) {
    currentCharacterId.value = id
  }

  return {
    characters, currentCharacterId, currentCharacter,
    loadCharacters, createCharacter, updateCharacter, deleteCharacter, selectCharacter
  }
})
