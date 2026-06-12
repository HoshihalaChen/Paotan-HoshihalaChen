<script setup>
// 存档管理页 — 全局三级浏览器：模组 → 角色 → 槽位
import { ref, computed, onMounted } from 'vue'
import { useSessionStore } from '../stores/session.js'
import { useCharacterStore } from '../stores/character.js'
import { useUIStore } from '../stores/ui.js'
import { useChatStore } from '../stores/chat.js'
import { useModuleContextStore } from '../stores/moduleContext.js'
import { useDayCycleStore } from '../stores/dayCycle.js'
import {
  getGlobalArchivesGrouped, getRecommendedArchive, getManualArchives,
  restoreArchive, deleteArchive, exportSelectedArchives, createArchive,
  importArchives
} from '../services/archive.js'
import CardWrapper from '../components/common/CardWrapper.vue'

const sessionStore = useSessionStore()
const characterStore = useCharacterStore()
const ui = useUIStore()
const chatStore = useChatStore()
const moduleCtxStore = useModuleContextStore()
const dayCycle = useDayCycleStore()

// ===== 数据加载 =====
const allModules = ref([])
const groupedArchives = ref({})
const expandedModule = ref(null)
const expandedCharKey = ref(null)
const loading = ref(true)

async function loadData() {
  loading.value = true
  try {
    const mod = await import('../../modules/index.js')
    allModules.value = mod.getAllModules()
    groupedArchives.value = await getGlobalArchivesGrouped()
    await sessionStore.loadSessions()
  } finally {
    loading.value = false
  }
}
onMounted(loadData)

// ===== 模组排序：活跃会话 > 有存档 > 无数据 =====
const sortedModules = computed(() => {
  const mods = [...allModules.value].filter(Boolean)
  const getActivity = (mod) => {
    if (!mod) return { tier: 3, time: 0, label: '' }
    const sessions = (sessionStore.sessions || []).filter(s => s && s.moduleId === mod.id)
    if (sessions.length > 0) {
      return { tier: 1, time: Math.max(...sessions.map(s => s.updatedAt || 0)), label: '最近游玩' }
    }
    const archives = groupedArchives.value[mod.name]
    if (archives) {
      const times = Object.values(archives).flat().map(a => a.createdAt || 0)
      if (times.length > 0) return { tier: 2, time: Math.max(...times), label: '有存档' }
    }
    return { tier: 3, time: 0, label: '' }
  }
  mods.forEach(m => { m._activity = getActivity(m) })
  mods.sort((a, b) => {
    if (a._activity.tier !== b._activity.tier) return a._activity.tier - b._activity.tier
    return b._activity.time - a._activity.time
  })
  return mods
})

// ===== 模组下的角色列表 =====
function getModuleCharacters(modName) {
  if (!modName || !groupedArchives.value) return []
  const modArchives = groupedArchives.value[modName]
  if (!modArchives) return []
  return Object.keys(modArchives).filter(Boolean).map(name => {
    const archives = modArchives[name]
    const latest = archives[0]
    return {
      name,
      archiveCount: archives.length,
      latestDay: latest?.dayCount || 0,
      latestTime: latest?.createdAtBJ || new Date(latest?.createdAt || 0).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      createdAt: latest?.createdAt || 0,
      archives
    }
  }).sort((a, b) => b.createdAt - a.createdAt)
}

// ===== 角色的存档槽位 =====
const charSlots = ref({})

async function loadCharSlots(modName, charName) {
  const key = modName + '/' + charName
  if (charSlots.value[key]) return charSlots.value[key]
  const archives = groupedArchives.value[modName]?.[charName] || []
  if (!archives.length) return null
  const firstArchive = archives[0]
  const [recommended, manuals] = await Promise.all([
    getRecommendedArchive(firstArchive.sessionId, firstArchive.characterId),
    getManualArchives(firstArchive.sessionId, firstArchive.characterId)
  ])
  const data = { recommended, manuals: manuals || [] }
  charSlots.value[key] = data
  return data
}

function toggleModule(modName) {
  expandedModule.value = expandedModule.value === modName ? null : modName
  expandedCharKey.value = null
}

async function toggleCharacter(modName, charName) {
  const key = modName + '/' + charName
  expandedCharKey.value = expandedCharKey.value === key ? null : key
  if (expandedCharKey.value === key) {
    await loadCharSlots(modName, charName)
  }
}

// ===== 操作 =====
const selectedIds = ref(new Set())
const showRestoreConfirm = ref(null)

function toggleSelect(id) {
  const s = new Set(selectedIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selectedIds.value = s
}

async function requestRestore(archive) {
  showRestoreConfirm.value = archive
}

async function confirmRestore() {
  const archive = showRestoreConfirm.value
  if (!archive) return
  try {
    if (sessionStore.isGameActive && sessionStore.currentSessionId) {
      await createArchive(sessionStore.currentSessionId, characterStore.currentCharacterId, {
        moduleName: moduleCtxStore.moduleName || '',
        characterName: characterStore.currentCharacter?.name || '',
        dayCount: dayCycle.dayCount,
        saveType: 'auto'
      })
    }
    const result = await restoreArchive(archive.id)
    await sessionStore.switchSession(result.sessionId)
    await sessionStore.activateGame(result.sessionId)
    await chatStore.loadMessages(result.sessionId)
    await characterStore.loadCharacters(result.sessionId)
    dayCycle.dayCount = result.snapshot.dayCount || 0
    dayCycle.eventsToday = 0
    ui.setPage('game')
    showRestoreConfirm.value = null
  } catch (e) {
    console.error('恢复失败:', e)
  }
}

async function removeArchive(archive) {
  if (!confirm(`确定删除「${archive.characterName}」D${archive.dayCount} 的存档吗？`)) return
  await deleteArchive(archive.id)
  charSlots.value = {}
  groupedArchives.value = await getGlobalArchivesGrouped()
}

async function manualSaveCurrent() {
  if (!sessionStore.currentSessionId) return alert('请先在游戏中才能手动存档')
  try {
    await createArchive(sessionStore.currentSessionId, characterStore.currentCharacterId, {
      moduleName: moduleCtxStore.moduleName || '',
      characterName: characterStore.currentCharacter?.name || '',
      dayCount: dayCycle.dayCount,
      saveType: 'manual',
      force: true
    })
    charSlots.value = {}
    groupedArchives.value = await getGlobalArchivesGrouped()
    alert('手动存档完成')
  } catch (e) {
    alert(e.message)
  }
}

async function exportSelected() {
  if (selectedIds.value.size === 0) return
  await exportSelectedArchives([...selectedIds.value])
}

const fileInput = ref(null)
const importMsg = ref('')

function triggerImport() {
  fileInput.value?.click()
}

async function handleFileImport(e) {
  const file = e.target.files?.[0]
  if (!file) return
  importMsg.value = '导入中...'
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    const count = await importArchives(data)
    importMsg.value = `成功导入 ${count} 条存档`
    // 刷新
    charSlots.value = {}
    groupedArchives.value = await getGlobalArchivesGrouped()
    setTimeout(() => { importMsg.value = '' }, 3000)
  } catch (err) {
    importMsg.value = '导入失败: ' + (err.message || '格式错误')
    setTimeout(() => { importMsg.value = '' }, 4000)
  }
  // 清空 file input 以允许重复导入同一文件
  e.target.value = ''
}

function charColor(name) {
  let hash = 0
  for (const c of name || '?') hash = ((hash << 5) - hash) + c.charCodeAt(0)
  return `hsl(${Math.abs(hash) % 360}, 25%, 50%)`
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- 标题栏 -->
    <div class="flex justify-between items-center">
      <div>
        <h2 class="text-xl text-ink-primary tracking-wider">存档管理</h2>
        <p class="text-xs text-ink-muted mt-0.5">{{ allModules.length }} 个模组 · 全局存档浏览</p>
      </div>
      <div class="flex gap-2">
        <button class="btn-ghost text-xs" @click="loadData" :disabled="loading">{{ loading ? '加载中...' : '刷新' }}</button>
        <button class="btn-ghost text-xs" @click="manualSaveCurrent">💾 手动存档</button>
        <button v-if="selectedIds.size > 0" class="btn-primary text-xs" @click="exportSelected">导出选中 ({{ selectedIds.size }})</button>
        <button class="btn-ghost text-xs" @click="triggerImport">📥 导入存档</button>
        <input ref="fileInput" type="file" accept=".json" class="hidden" @change="handleFileImport" />
        <span v-if="importMsg" class="text-xs" :class="importMsg.includes('失败') ? 'text-red-500' : 'text-[#5A7A5A]'">{{ importMsg }}</span>
      </div>
    </div>

    <!-- 空状态 -->
    <CardWrapper v-if="Object.keys(groupedArchives).length === 0" class="p-12 text-center">
      <p class="text-sm text-ink-muted">暂无存档。开始游戏后自动存档将出现在这里。</p>
    </CardWrapper>

    <!-- 模组列表 -->
    <div class="space-y-4">
      <div v-for="mod in sortedModules" :key="mod.id" class="fade-in">
        <CardWrapper
          class="p-5 cursor-pointer transition-all"
          :class="mod._activity.tier === 3 ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-md hover:-translate-y-0.5'"
          @click="mod._activity.tier < 3 && toggleModule(mod.name)"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <span class="text-xs transition-transform" :class="expandedModule === mod.name ? 'rotate-90' : ''">▶</span>
              <div>
                <h3 class="text-base text-ink-primary font-medium">{{ mod.name }}</h3>
                <p class="text-[10px] text-ink-muted">{{ mod.system }} · {{ mod.levelRange }} · 角色: {{ getModuleCharacters(mod.name).length }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span v-if="mod._activity.label" class="text-[10px] px-2 py-0.5 rounded-full"
                :class="mod._activity.tier === 1 ? 'bg-[#5A7A5A]/10 text-[#5A7A5A]' : 'bg-[#8B8580]/10 text-[#6B6560]'">
                {{ mod._activity.label }}
              </span>
              <span v-if="mod._activity.time" class="text-[10px] text-ink-muted/50">
                {{ new Date(mod._activity.time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) }}
              </span>
            </div>
          </div>
        </CardWrapper>

        <!-- 角色列表 -->
        <div v-if="expandedModule === mod.name" class="mt-3 ml-8 space-y-4 fade-in">
          <div class="flex gap-3 overflow-x-auto pb-2">
            <CardWrapper
              v-for="char in getModuleCharacters(mod.name)" :key="char.name"
              class="flex-shrink-0 w-52 p-4 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg"
              :class="expandedCharKey === mod.name + '/' + char.name ? 'ring-2 ring-[#5A5550]/30' : ''"
              @click.stop="toggleCharacter(mod.name, char.name)"
            >
              <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-[#FAF7F2] text-sm flex-shrink-0" :style="{ backgroundColor: charColor(char.name) }">
                  {{ char.name.charAt(0) }}
                </div>
                <div class="min-w-0">
                  <p class="text-sm text-ink-primary font-medium truncate">{{ char.name }}</p>
                  <p class="text-[10px] text-ink-muted">D{{ char.latestDay }} · {{ char.archiveCount }} 个存档</p>
                </div>
              </div>
              <p class="text-[10px] text-ink-muted/70 text-right">{{ char.latestTime }}</p>
            </CardWrapper>
          </div>

          <!-- 存档槽位 -->
          <template v-for="char in getModuleCharacters(mod.name)" :key="'slots-'+char.name">
            <div v-if="expandedCharKey === mod.name + '/' + char.name && charSlots[mod.name + '/' + char.name]" class="fade-in">
              <div class="space-y-2 pl-4 border-l-2 border-[#E8E2D8]">
              <!-- 推荐存档 -->
              <div v-if="charSlots[mod.name + '/' + char.name]?.recommended" class="flex items-center gap-3 p-3 rounded-lg border border-[#5A7A5A]/30 bg-[#5A7A5A]/5">
                <span class="text-xs bg-[#5A7A5A] text-white px-1.5 py-0.5 rounded">⭐ 推荐</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-ink-primary">
                    第 {{ charSlots[mod.name + '/' + char.name].recommended.dayCount }} 天
                    <span class="text-[10px] text-ink-muted ml-2">{{ charSlots[mod.name + '/' + char.name].recommended.saveType === 'auto' ? '自动存档' : '手动存档' }}</span>
                  </p>
                  <p class="text-[10px] text-ink-muted">{{ charSlots[mod.name + '/' + char.name].recommended.createdAtBJ || '' }}</p>
                </div>
                <div class="flex gap-1 flex-shrink-0">
                  <input type="checkbox" class="w-3 h-3" :checked="selectedIds.has(charSlots[mod.name + '/' + char.name].recommended.id)" @click.stop @change="toggleSelect(charSlots[mod.name + '/' + char.name].recommended.id)" />
                  <button class="text-[10px] text-[#5A7A5A] hover:underline px-1" @click.stop="requestRestore(charSlots[mod.name + '/' + char.name].recommended)">读取</button>
                </div>
              </div>

              <!-- 手动存档槽位 -->
              <div v-for="(_, idx) in [...Array(5).keys()]" :key="'m-'+idx"
                class="flex items-center gap-3 p-3 rounded-lg border"
                :class="charSlots[mod.name + '/' + char.name]?.manuals[idx] ? 'border-[#D8D2C8] bg-[#FAF7F2]' : 'border-dashed border-[#D8D2C8]/40 bg-transparent'"
              >
                <span class="text-xs text-ink-muted/50 w-6">#{{ idx + 1 }}</span>
                <template v-if="charSlots[mod.name + '/' + char.name]?.manuals[idx]">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-ink-primary">第 {{ charSlots[mod.name + '/' + char.name].manuals[idx].dayCount }} 天 <span class="text-[10px] text-ink-muted ml-2">手动存档</span></p>
                    <p class="text-[10px] text-ink-muted">{{ charSlots[mod.name + '/' + char.name].manuals[idx].createdAtBJ || '' }}</p>
                  </div>
                  <div class="flex gap-1 flex-shrink-0">
                    <input type="checkbox" class="w-3 h-3" :checked="selectedIds.has(charSlots[mod.name + '/' + char.name].manuals[idx].id)" @click.stop @change="toggleSelect(charSlots[mod.name + '/' + char.name].manuals[idx].id)" />
                    <button class="text-[10px] text-[#5A7A5A] hover:underline px-1" @click.stop="requestRestore(charSlots[mod.name + '/' + char.name].manuals[idx])">读取</button>
                    <button class="text-[10px] text-red-400 hover:text-red-600 px-1" @click.stop="removeArchive(charSlots[mod.name + '/' + char.name].manuals[idx])">删除</button>
                  </div>
                </template>
                <template v-else>
                  <p class="text-sm text-ink-muted/30">空槽位</p>
                </template>
              </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 恢复确认弹窗 -->
    <Teleport to="body">
      <div v-if="showRestoreConfirm" class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" @click.self="showRestoreConfirm = null">
        <CardWrapper class="w-[440px] p-6">
          <h3 class="text-lg text-ink-primary mb-3">⚠️ 确认读取存档</h3>
          <div class="space-y-3 mb-4">
            <p class="text-sm text-ink-secondary">
              将读取「<strong>{{ showRestoreConfirm.characterName }}</strong>」第 <strong>{{ showRestoreConfirm.dayCount }}</strong> 天的存档。
            </p>
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
              <p>· 当前未保存的游戏进度将被<strong>覆盖</strong></p>
              <p>· 读取后页面将刷新，自动加载存档中的对话记录</p>
              <p>· 若存档末尾有未完成的选项，将重新生成选项框供继续选择</p>
            </div>
          </div>
          <div class="flex justify-end gap-3">
            <button class="btn-ghost text-sm" @click="showRestoreConfirm = null">取消</button>
            <button class="btn-primary text-sm bg-amber-600 hover:bg-amber-700" @click="confirmRestore">确认读取并覆盖</button>
          </div>
        </CardWrapper>
      </div>
    </Teleport>
  </div>
</template>
