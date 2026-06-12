<script setup>
// 主页 - 新建冒险
import { ref, computed, onMounted } from 'vue'
import { useSessionStore } from '../stores/session.js'
import { useCharacterStore } from '../stores/character.js'
import { useChatStore } from '../stores/chat.js'
import { useUIStore } from '../stores/ui.js'
import { useModuleContextStore } from '../stores/moduleContext.js'
import { useDayCycleStore } from '../stores/dayCycle.js'
import CardWrapper from '../components/common/CardWrapper.vue'
import CompassLogo from '../components/common/CompassLogo.vue'
import ModuleInitModal from '../components/export/ModuleInitModal.vue'

const sessionStore = useSessionStore()
const characterStore = useCharacterStore()
const chatStore = useChatStore()
const ui = useUIStore()
const moduleCtxStore = useModuleContextStore()
const dayCycleStore = useDayCycleStore()

// 加载状态
const loading = ref(true)
const loadError = ref(null)

// 按钮点击反馈状态
const clickingButton = ref(null) // 哪个按钮正在处理中

// 模组数据 - 延迟加载以避免阻塞渲染
const allModules = ref([])
const availableSystems = ref([])

// 筛选
const selectedSystemFilter = ref('全部')
const filteredModules = computed(() => {
  if (selectedSystemFilter.value === '全部') return allModules.value
  return allModules.value.filter(m => m.system === selectedSystemFilter.value)
})

// 初始化弹窗
const showInitModal = ref(false)
const selectedModule = ref(null)

// 新建冒险表单
const formData = ref({ name: '', system: 'D&D 5E', description: '' })

// 队伍角色
const partyMembers = computed(() =>
  sessionStore.currentSessionId
    ? characterStore.characters.filter(c => c.sessionId === sessionStore.currentSessionId)
    : []
)

/** 页面初始化逻辑 — 可复用于重试 */
async function initPage() {
  try {
    loading.value = true
    loadError.value = null

    // 加载模组数据
    try {
      const mod = await import('../../modules/index.js')
      allModules.value = mod.getAllModules()
      availableSystems.value = mod.getAvailableSystems()
    } catch (e) {
      console.error('Failed to load modules:', e)
      loadError.value = '模组数据加载失败: ' + e.message
    }

    // 加载会话和角色
    await sessionStore.loadSessions()
    if (sessionStore.currentSessionId) {
      await characterStore.loadCharacters(sessionStore.currentSessionId)
    }
  } catch (e) {
    console.error('HomePage init error:', e)
    loadError.value = '初始化失败: ' + (e.message || e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  initPage()
})

const pendingModule = ref(null) // 等待确认的模组

/** 打开初始化弹窗 */
function openInitModal(mod) {
  if (clickingButton.value) return

  if (sessionStore.isGameActive) {
    // 游戏进行中，弹出确认提示
    pendingModule.value = mod
    return
  }

  doOpenInitModal(mod)
}

function doOpenInitModal(mod) {
  clickingButton.value = mod.id
  try {
    selectedModule.value = mod
    showInitModal.value = true
  } catch (e) {
    console.error('openInitModal error:', e)
  } finally {
    clickingButton.value = null
  }
}

/** 确认覆盖当前游戏，开始新模组 */
async function confirmNewGame() {
  const mod = pendingModule.value
  pendingModule.value = null
  if (!mod) return

  // 先存档当前进度
  if (sessionStore.currentSessionId) {
    try {
      const { createArchive } = await import('../services/archive.js')
      await createArchive(sessionStore.currentSessionId, characterStore.currentCharacterId, {
        moduleName: moduleCtxStore.activeModule?.name || '',
        characterName: characterStore.currentCharacter?.name || '',
        dayCount: dayCycleStore.dayCount,
        saveType: 'auto'
      })
    } catch (e) { /* 静默 */ }
  }
  // 重置当前游戏
  if (sessionStore.currentSessionId) {
    await sessionStore.resetGame(sessionStore.currentSessionId)
    moduleCtxStore.unbindModule()
    chatStore.messages = []
  }
  doOpenInitModal(mod)
}

/** 初始化完成回调 */
function onInitComplete() {
  showInitModal.value = false
  selectedModule.value = null
}

/** 创建自定义冒险 */
async function createAdventure() {
  if (!formData.value.name.trim()) return
  if (clickingButton.value) return

  clickingButton.value = 'custom'
  try {
    await sessionStore.createSession(formData.value)
    formData.value = { name: '', system: 'D&D 5E', description: '' }
  } catch (e) {
    console.error('createAdventure error:', e)
  } finally {
    clickingButton.value = null
  }
}

/** 快速创建角色 */
async function quickCreateCharacter() {
  if (!sessionStore.currentSessionId) return
  if (clickingButton.value) return

  clickingButton.value = 'quickchar'
  try {
    const names = ['亚瑟·龙血', '艾琳·月影', '索林·石拳', '莉莉丝·暗语']
    const classes = ['战士', '法师', '牧师', '游荡者']
    const races = ['人类', '精灵', '矮人', '半精灵']
    const existing = characterStore.characters.filter(c => c.sessionId === sessionStore.currentSessionId).length
    if (existing >= 4) return

    const newChar = await characterStore.createCharacter(sessionStore.currentSessionId, {
      name: names[existing],
      class: classes[existing],
      race: races[existing],
      level: 1,
      str: 14 + existing % 3, dex: 12 + (existing + 1) % 3, con: 13 + existing % 2,
      int: 10 + (existing + 2) % 3, wis: 12 + existing % 2, cha: 10 + (existing + 1) % 3,
      hp: 12, maxHp: 12
    })
    console.log('Character created:', newChar)
  } catch (e) {
    console.error('quickCreateCharacter error:', e)
  } finally {
    clickingButton.value = null
  }
}

/** 跳转到游戏页面 */
function goToGame() {
  ui.setPage('game')
}

/** 跳转到角色页面 */
function goToCharacter() {
  ui.setPage('character')
}

/** 重置游戏（测试快捷接口） */
async function resetCurrentGame() {
  if (clickingButton.value) return
  clickingButton.value = 'reset'
  try {
    if (sessionStore.currentSessionId) {
      await sessionStore.resetGame(sessionStore.currentSessionId)
      moduleCtxStore.unbindModule()
      await characterStore.loadCharacters(sessionStore.currentSessionId)
      await chatStore.loadMessages(sessionStore.currentSessionId)
    }
  } catch (e) {
    console.error('resetCurrentGame error:', e)
  } finally {
    clickingButton.value = null
    showResetConfirm.value = false
  }
}

/** 获取角色头像颜色 */
function avatarColor(index) {
  const colors = ['#8B8580', '#7A8B6A', '#6A7A8B', '#8B7A6A']
  return colors[index % colors.length]
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- 加载状态 -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="text-center">
        <div class="w-8 h-8 border-2 border-[#8B8580] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p class="text-sm text-ink-muted">正在加载模组数据...</p>
      </div>
    </div>

    <!-- 加载错误 -->
    <div v-if="loadError" class="bg-red-50 border border-red-200 rounded-card p-6 text-center">
      <p class="text-sm text-red-500">{{ loadError }}</p>
      <button class="btn-primary text-sm mt-3" @click="initPage()">
        重试
      </button>
    </div>

    <!-- 主内容 -->
    <template v-if="!loading && !loadError">
      <!-- ===== 游戏激活状态横幅（简化为状态提示） ===== -->
      <div
        v-if="sessionStore.isGameActive"
        class="bg-[#5A7A5A]/10 border border-[#5A7A5A]/30 rounded-card px-5 py-3"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-[#5A7A5A] animate-pulse" />
            <span class="text-xs text-[#4A6A4A]">「{{ sessionStore.currentSession?.name }}」进行中</span>
          </div>
          <button class="btn-primary text-xs tracking-wider" @click="goToGame">继续冒险 →</button>
        </div>
      </div>

      <!-- ===== 覆盖确认弹窗 ===== -->
      <Teleport to="body">
        <div v-if="pendingModule" class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" @click.self="pendingModule = null">
          <CardWrapper class="w-[420px] p-6">
            <h3 class="text-lg text-ink-primary mb-3">⚠️ 开始新冒险将覆盖当前进度</h3>
            <div class="space-y-3 mb-4 text-sm text-ink-secondary">
              <p>当前冒险「<strong>{{ sessionStore.currentSession?.name }}</strong>」仍在进行中。</p>
              <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
                <p>· 当前进度将在开始新游戏前<strong>自动存档</strong></p>
                <p>· 新模组「<strong>{{ pendingModule.name }}</strong>」将覆盖当前游戏</p>
                <p>· 可通过存档页恢复之前的进度</p>
              </div>
            </div>
            <div class="flex justify-end gap-3">
              <button class="btn-ghost text-sm" @click="pendingModule = null">取消</button>
              <button class="btn-primary text-sm bg-amber-600 hover:bg-amber-700" @click="confirmNewGame">确认并开始新冒险</button>
            </div>
          </CardWrapper>
        </div>
      </Teleport>

      <!-- ===== 页面标题 ===== -->
      <div class="flex items-center gap-4 mb-2">
        <CompassLogo />
        <div>
          <h2 class="text-xl text-ink-primary tracking-wider">新建冒险</h2>
          <p class="text-xs text-ink-muted tracking-wide">
            选择模组或创建自定义跑团会话
          </p>
        </div>
      </div>

      <!-- ===== 模组预览卡片 ===== -->
      <section>
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
          <h3 class="text-sm text-ink-secondary tracking-wide">
            本地模组库 <span class="text-ink-muted text-xs">({{ allModules.length }} 个)</span>
          </h3>
          <div class="flex gap-1 flex-wrap">
            <button
              v-for="sys in ['全部', ...availableSystems]"
              :key="sys"
              class="text-[10px] px-3 py-1 rounded-full transition-colors"
              :class="selectedSystemFilter === sys
                ? 'bg-[#5A5550] text-[#F5F0E8]'
                : 'text-ink-muted hover:bg-[#E8E2D8]'"
              @click="selectedSystemFilter = sys"
            >
              {{ sys }}
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <CardWrapper
            v-for="mod in filteredModules" :key="mod.id"
            class="flex flex-col transition-all p-5 cursor-pointer group"
          >
            <h4 class="text-base text-ink-primary font-medium leading-tight mb-2">{{ mod.name }}</h4>
            <div class="flex gap-2 mb-2">
              <span class="text-[9px] text-ink-muted bg-[#E8E2D8] px-2 py-0.5 rounded-full">{{ mod.levelRange }}</span>
              <span class="text-[9px] text-ink-muted bg-[#E8E2D8] px-2 py-0.5 rounded-full">{{ mod.playerCount }}人</span>
              <span class="text-[9px] text-ink-muted bg-[#E8E2D8] px-2 py-0.5 rounded-full">{{ mod.system }}</span>
            </div>
            <p class="text-xs text-ink-secondary leading-relaxed mb-3 flex-1">
              {{ mod.description.slice(0, 120) }}{{ mod.description.length > 120 ? '...' : '' }}
            </p>
            <div class="flex gap-1 flex-wrap mb-3">
              <span v-for="theme in (mod.themes || []).slice(0, 3)" :key="theme" class="text-[9px] text-ink-muted/60">#{{ theme }}</span>
            </div>
            <div class="flex justify-between items-center pt-2 border-t border-[#E8E2D8]">
              <span class="text-[10px] text-ink-muted truncate max-w-[140px]">{{ mod.setting }}</span>
              <button
                class="text-xs px-3 py-1 rounded-lg transition-all min-w-[80px]"
                :class="clickingButton === mod.id
                  ? 'bg-[#5A5550] text-[#F5F0E8] cursor-wait'
                  : 'bg-[#E8E2D8] text-[#5A5550] hover:bg-[#5A5550] hover:text-[#F5F0E8] cursor-pointer'"
                :disabled="clickingButton !== null"
                @click.stop="openInitModal(mod)"
              >
                <span v-if="clickingButton === mod.id" class="inline-block w-3 h-3 border border-[#F5F0E8] border-t-transparent rounded-full animate-spin mr-1 align-middle" />
                {{ clickingButton === mod.id ? '加载中' : '使用模组 →' }}
              </button>
            </div>
          </CardWrapper>
        </div>

        <CardWrapper v-if="filteredModules.length === 0" class="p-8 text-center mt-4">
          <p class="text-sm text-ink-muted">该分类下暂无模组</p>
        </CardWrapper>
      </section>

      <!-- ===== 自定义创建表单 + 队伍头像区 ===== -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <CardWrapper class="md:col-span-2 p-6">
          <h3 class="text-sm text-ink-secondary tracking-wide mb-4">自定义冒险</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-xs text-ink-muted mb-1">冒险名称</label>
              <input v-model="formData.name" class="input-parchment w-full" placeholder="输入冒险名称..." @keyup.enter="createAdventure" />
            </div>
            <div>
              <label class="block text-xs text-ink-muted mb-1">规则系统</label>
              <select v-model="formData.system" class="input-parchment w-full">
                <option>D&D 5E</option>
                <option>Pathfinder 2E</option>
                <option>COC 7th</option>
                <option>自定义 · 诡秘体系</option>
                <option>自定义</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-ink-muted mb-1">冒险简介</label>
              <textarea v-model="formData.description" class="input-parchment w-full h-20 resize-none" placeholder="简要描述冒险背景..." />
            </div>
            <button
              class="btn-primary w-full text-sm tracking-wider"
              :disabled="!formData.name.trim() || clickingButton === 'custom'"
              @click="createAdventure"
            >
              {{ clickingButton === 'custom' ? '创建中...' : '创建新冒险' }}
            </button>
          </div>
        </CardWrapper>

        <CardWrapper class="p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-sm text-ink-secondary tracking-wide">队伍成员</h3>
            <button
              class="text-[10px] hover:text-ink-primary transition-colors"
              :class="partyMembers.length >= 4 || clickingButton === 'quickchar' ? 'text-ink-muted/50' : 'text-ink-muted'"
              :disabled="partyMembers.length >= 4 || clickingButton !== null"
              @click="quickCreateCharacter"
            >
              {{ clickingButton === 'quickchar' ? '创建中...' : '+ 快速创建' }}
            </button>
          </div>

          <div class="flex flex-wrap gap-3 mb-4">
            <div v-for="(member, i) in partyMembers" :key="member.id" class="flex flex-col items-center gap-1">
              <div class="w-12 h-12 rounded-full flex items-center justify-center text-[#FAF7F2] text-sm font-medium" :style="{ backgroundColor: avatarColor(i) }">
                {{ member.name.charAt(0) }}
              </div>
              <span class="text-[10px] text-ink-secondary">{{ member.name }}</span>
            </div>
            <div v-if="partyMembers.length === 0" class="text-xs text-ink-muted py-4 text-center w-full">
              尚未创建角色
            </div>
          </div>

          <button class="btn-primary w-full text-sm tracking-wider mb-2"
            :disabled="!sessionStore.currentSession || partyMembers.length === 0"
            @click="goToGame">
            进入游戏
          </button>
          <button class="btn-ghost w-full text-xs"
            :disabled="!sessionStore.currentSession"
            @click="goToCharacter">
            管理角色
          </button>
        </CardWrapper>
      </div>

      <!-- ===== 当前会话概览 ===== -->
      <CardWrapper v-if="sessionStore.currentSession && !sessionStore.isGameActive" class="p-5">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm text-ink-primary font-medium">当前会话：{{ sessionStore.currentSession.name }}</h3>
            <p class="text-xs text-ink-muted mt-1">{{ sessionStore.currentSession.system }} · {{ partyMembers.length }} 名角色</p>
          </div>
          <span class="text-[10px] text-ink-muted bg-[#E8E2D8] px-3 py-1 rounded-full">等待开始</span>
        </div>
      </CardWrapper>
    </template>

    <!-- ===== 模组初始化弹窗 ===== -->
    <ModuleInitModal
      v-if="showInitModal && selectedModule"
      :module="selectedModule"
      @close="showInitModal = false; selectedModule = null"
      @complete="onInitComplete"
    />
  </div>
</template>
