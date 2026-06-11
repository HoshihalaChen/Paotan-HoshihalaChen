<script setup>
// 图鉴页 — 直接从模组 JSON 加载数据，不依赖 IndexedDB 导入
import { ref, computed, onMounted, watch } from 'vue'
import { useSessionStore } from '../stores/session.js'
import { useWorldStore } from '../stores/world.js'
import { useModuleContextStore } from '../stores/moduleContext.js'
import { getModuleSpecialSurnames } from '../../modules/index.js'
import CardWrapper from '../components/common/CardWrapper.vue'

const sessionStore = useSessionStore()
const worldStore = useWorldStore()
const moduleCtxStore = useModuleContextStore()

const currentModuleName = computed(() =>
  moduleCtxStore.activeModule?.name || sessionStore.currentSession?.name || '未知世界')
const currentModuleSystem = computed(() =>
  moduleCtxStore.activeModule?.system || sessionStore.currentSession?.system || '')
const currentModuleBg = computed(() =>
  moduleCtxStore.activeModule?.background || sessionStore.currentSession?.description || '')
const currentModuleSetting = computed(() =>
  moduleCtxStore.activeModule?.setting || '')

// ========== 核心数据源：直接从模组 JSON 构建图鉴条目 ==========
const moduleEntries = computed(() => {
  const entries = []
  const mod = moduleCtxStore.activeModule
  if (!mod) return entries

  // 1. 模组 worldLore 条目
  for (const e of (mod.worldLore || [])) {
    entries.push({
      id: 'mod-' + e.title,
      category: e.category || '未分类',
      title: e.title || '',
      content: e.content || '',
      tags: e.tags || [],
      icon: e.icon || '◆',
      order: e.order || 0,
      source: 'module'
    })
  }

  // 2. 特殊姓氏条目
  const specialSurnames = getModuleSpecialSurnames(mod)
  for (const [surname, meaning] of Object.entries(specialSurnames)) {
    entries.push({
      id: 'mod-surname-' + surname,
      category: '家族姓氏',
      title: `「${surname}」家族`,
      content: meaning,
      tags: ['特殊姓氏', '贵族', '家族'],
      icon: '🛡️',
      order: 0,
      source: 'module'
    })
  }

  return entries
})

// 用户手动添加的条目（从 DB 加载，排除与模组重复的标题）
const userEntries = computed(() => {
  const modTitles = new Set(moduleEntries.value.map(e => e.title))
  return worldStore.entries.filter(e => !modTitles.has(e.title))
})

// 合并后的所有条目
const allEntries = computed(() => {
  return [...moduleEntries.value, ...userEntries.value]
})

// 按分类分组
const entriesByCategory = computed(() => {
  const map = {}
  for (const entry of allEntries.value) {
    if (!map[entry.category]) map[entry.category] = []
    map[entry.category].push(entry)
  }
  return map
})

// 排序后的分类列表
const sortedCategories = computed(() => {
  const cats = Object.keys(entriesByCategory.value)
  const priority = ['魔法体系', '组织势力', '宗教', '宇宙', '规则']
  const ordered = []
  for (const p of priority) {
    if (cats.includes(p)) ordered.push(p)
  }
  for (const c of cats) {
    if (!ordered.includes(c)) ordered.push(c)
  }
  return ordered
})

// 表单
const showForm = ref(false)
const formData = ref({ id: null, title: '', category: '', content: '', tags: [], icon: '◆' })
const newTag = ref('')

// 各分类折叠状态 — 力量和势力默认展开
const collapsedCategories = ref({})
function toggleCategory(cat) {
  collapsedCategories.value[cat] = !collapsedCategories.value[cat]
}
function isCollapsed(cat) {
  if (collapsedCategories.value[cat] === undefined) {
    const priorityCats = ['魔法体系', '组织势力', '宗教', '规则', '宇宙']
    return !priorityCats.includes(cat)
  }
  return collapsedCategories.value[cat]
}

// 分类 meta
const catMeta = {
  '魔法体系': { icon: '✨', color: '#7A6A8B', desc: '这个世界的力量来源与运作规则' },
  '组织势力': { icon: '🏛️', color: '#6A7A8B', desc: '影响世界格局的各大组织与势力' },
  '历史':     { icon: '📜', color: '#8B7A6A', desc: '世界的历史脉络与重大事件' },
  '地理':     { icon: '🗺️', color: '#6A7A5A', desc: '世界的地理版图与重要地点' },
  '宗教':     { icon: '⛪', color: '#8B8580', desc: '信仰体系、神祇与教会' },
  '种族':     { icon: '👤', color: '#7A8B6A', desc: '世界中的智慧种族与生物' },
  '规则':     { icon: '⚖️', color: '#6A8B8B', desc: '世界运行的基本法则与判定规则' },
  '宇宙':     { icon: '🌌', color: '#5A6A8B', desc: '宇宙观、维度与星界知识' },
  '人物传记': { icon: '📖', color: '#8B6A6A', desc: '重要人物与传奇英雄' },
  '家族姓氏': { icon: '🛡️', color: '#8B6A5A', desc: '拥有特殊背景或贵族血统的家族谱系' },
}

// 左侧快捷导航
const navCategory = ref(null)
function scrollToCategory(cat) {
  navCategory.value = cat
  if (collapsedCategories.value[cat]) {
    collapsedCategories.value[cat] = false
  }
  const el = document.getElementById('cat-' + cat)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 刷新时重新加载 DB（仅用于用户手动添加的条目）
const loading = ref(false)
async function loadData() {
  loading.value = true
  try {
    if (sessionStore.currentSessionId) {
      await worldStore.loadWorldData(sessionStore.currentSessionId)
    }
  } finally {
    loading.value = false
  }
}
onMounted(loadData)
watch(() => sessionStore.currentSessionId, loadData)

function openCreate(cat) {
  formData.value = { id: null, title: '', category: cat || '未分类', content: '', tags: [], icon: '◆' }
  newTag.value = ''
  showForm.value = true
}
function openEdit(entry) {
  formData.value = { id: entry.id, title: entry.title, category: entry.category,
    content: entry.content, tags: [...(entry.tags || [])], icon: entry.icon || '◆' }
  newTag.value = ''
  showForm.value = true
}
async function saveEntry() {
  if (!sessionStore.currentSessionId || !formData.value.title.trim()) return
  await worldStore.addEntry(sessionStore.currentSessionId, { ...formData.value })
  showForm.value = false
}
async function deleteEntry(id) {
  await worldStore.deleteEntry(id, sessionStore.currentSessionId)
}
function addTag() {
  if (newTag.value.trim()) { formData.value.tags.push(newTag.value.trim()); newTag.value = '' }
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- ===== 标题 ===== -->
    <div class="flex justify-between items-center">
      <div>
        <h2 class="text-xl text-ink-primary tracking-wider">
          图鉴 — 《{{ currentModuleName }}》
        </h2>
        <p class="text-xs text-ink-muted tracking-wide mt-0.5">
          {{ currentModuleSystem }}
          <span class="ml-2">· {{ allEntries.length }} 条设定 · {{ sortedCategories.length }} 个分类</span>
        </p>
      </div>
      <div class="flex gap-2">
        <button class="btn-ghost text-xs" @click="loadData" :disabled="loading">
          {{ loading ? '加载中...' : '刷新' }}
        </button>
        <button class="btn-primary text-sm" @click="openCreate(null)">+ 新条目</button>
      </div>
    </div>

    <!-- ===== 模组背景概览 ===== -->
    <CardWrapper v-if="currentModuleBg" class="p-5">
      <div class="flex gap-4">
        <span class="text-xl flex-shrink-0">📖</span>
        <div>
          <p class="text-sm text-ink-secondary leading-relaxed">{{ currentModuleBg }}</p>
          <p v-if="currentModuleSetting" class="text-xs text-ink-muted mt-2">🗺️ {{ currentModuleSetting }}</p>
        </div>
      </div>
    </CardWrapper>

    <!-- ===== 未选模组提示 ===== -->
    <CardWrapper v-if="!moduleCtxStore.activeModule" class="p-12 text-center">
      <p class="text-sm text-ink-muted">请先在主页选择模组并开始游戏，启动后图鉴将自动展示该模组的完整设定。</p>
    </CardWrapper>

    <!-- ===== 主布局：快捷导航 + 分类区域 ===== -->
    <div v-if="moduleCtxStore.activeModule" class="flex gap-6">
      <!-- 左侧快捷导航 -->
      <CardWrapper class="w-40 flex-shrink-0 p-3 self-start sticky" style="top: 24px;">
        <h4 class="text-xs text-ink-muted tracking-wide mb-2">快捷导航</h4>
        <div class="space-y-0.5">
          <button
            v-for="cat in sortedCategories"
            :key="cat"
            class="w-full text-left text-xs px-2 py-1.5 rounded transition-colors flex items-center justify-between"
            :class="navCategory === cat ? 'bg-[#5A5550] text-[#F5F0E8]' : 'text-ink-secondary hover:bg-[#F5F0E8]'"
            @click="scrollToCategory(cat)"
          >
            <span>{{ (catMeta[cat]?.icon || '◆') }} {{ cat }}</span>
            <span class="text-[9px] opacity-60">{{ entriesByCategory[cat]?.length || 0 }}</span>
          </button>
        </div>
      </CardWrapper>

      <!-- 右侧分类详细内容 -->
      <div class="flex-1 space-y-6">
        <!-- 空状态 -->
        <CardWrapper v-if="allEntries.length === 0" class="p-12 text-center">
          <p class="text-sm text-ink-muted">该模组暂无图鉴设定。</p>
        </CardWrapper>

        <!-- 每个分类一个区块 -->
        <div
          v-for="cat in sortedCategories"
          :key="cat"
          :id="'cat-' + cat"
          class="space-y-3"
        >
          <!-- 分类头部 -->
          <div
            class="flex items-center gap-3 cursor-pointer select-none group"
            @click="toggleCategory(cat)"
          >
            <div
              class="w-1.5 h-1.5 rounded-full flex-shrink-0"
              :style="{ backgroundColor: catMeta[cat]?.color || '#8B8580' }"
            />
            <span class="text-lg">{{ catMeta[cat]?.icon || '◆' }}</span>
            <h3 class="text-base text-ink-primary font-medium">{{ cat }}</h3>
            <span class="text-xs text-ink-muted">({{ entriesByCategory[cat]?.length || 0 }})</span>
            <span
              class="text-xs text-ink-muted/40 ml-1 transition-transform"
              :class="isCollapsed(cat) ? '' : 'rotate-90'"
            >▶</span>
            <span class="text-[10px] text-ink-muted/40 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {{ catMeta[cat]?.desc || '' }}
            </span>
            <button
              class="text-[10px] text-ink-muted/30 hover:text-ink-primary ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
              @click.stop="openCreate(cat)"
            >+ 添加</button>
          </div>

          <!-- 分类条目列表（可折叠） -->
          <div v-if="!isCollapsed(cat)" class="space-y-3 pl-7">
            <div
              v-for="entry in entriesByCategory[cat]"
              :key="entry.id"
              class="fade-in"
            >
              <!-- 重点分类用加强卡片 -->
              <CardWrapper
                v-if="['魔法体系', '组织势力', '宗教', '宇宙'].includes(cat)"
                class="p-5 border-l-[3px]"
                :style="{ borderLeftColor: catMeta[cat]?.color || '#8B8580' }"
              >
                <div class="flex justify-between items-start mb-2">
                  <h4 class="text-sm text-ink-primary font-medium">{{ entry.title }}</h4>
                  <div class="flex gap-1 flex-shrink-0">
                    <button class="text-[10px] text-ink-muted hover:text-ink-primary px-1" @click="openEdit(entry)">编辑</button>
                    <button class="text-[10px] text-red-400 hover:text-red-600 px-1" @click="deleteEntry(entry.id)">删除</button>
                  </div>
                </div>
                <div class="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">{{ entry.content }}</div>
                <div v-if="entry.tags?.length" class="flex flex-wrap gap-1 mt-2 pt-2 border-t border-[#E8E2D8]/40">
                  <span v-for="tag in entry.tags" :key="tag" class="text-[10px] text-ink-muted bg-[#F5F0E8] px-2 py-0.5 rounded-full">#{{ tag }}</span>
                </div>
              </CardWrapper>

              <!-- 普通分类用标准卡片 -->
              <CardWrapper v-else class="p-4">
                <div class="flex justify-between items-start mb-2">
                  <h4 class="text-sm text-ink-primary font-medium">{{ entry.title }}</h4>
                  <div class="flex gap-1 flex-shrink-0">
                    <button class="text-[10px] text-ink-muted hover:text-ink-primary px-1" @click="openEdit(entry)">编辑</button>
                    <button class="text-[10px] text-red-400 hover:text-red-600 px-1" @click="deleteEntry(entry.id)">删除</button>
                  </div>
                </div>
                <div class="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">{{ entry.content }}</div>
                <div v-if="entry.tags?.length" class="flex flex-wrap gap-1 mt-2 pt-2 border-t border-[#E8E2D8]/40">
                  <span v-for="tag in entry.tags" :key="tag" class="text-[10px] text-ink-muted bg-[#F5F0E8] px-2 py-0.5 rounded-full">#{{ tag }}</span>
                </div>
              </CardWrapper>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 新建/编辑弹窗 ===== -->
    <Teleport to="body">
      <div v-if="showForm" class="fixed inset-0 bg-black/20 z-50 flex items-center justify-center" @click.self="showForm = false">
        <CardWrapper class="w-[500px] max-h-[80vh] overflow-y-auto p-6">
          <h3 class="text-lg text-ink-primary mb-4">{{ formData.id ? '编辑条目' : '新建条目' }}</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-xs text-ink-muted mb-1">标题</label>
              <input v-model="formData.title" class="input-parchment w-full" placeholder="条目名称..." />
            </div>
            <div class="flex gap-3">
              <div class="flex-1">
                <label class="block text-xs text-ink-muted mb-1">分类</label>
                <select v-model="formData.category" class="input-parchment w-full">
                  <option v-for="cat in sortedCategories" :key="cat" :value="cat">{{ cat }}</option>
                  <option value="未分类">未分类</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-ink-muted mb-1">图标</label>
                <select v-model="formData.icon" class="input-parchment w-20">
                  <option>◆</option><option>◇</option><option>✦</option><option>◈</option>
                  <option>○</option><option>△</option><option>☆</option><option>◉</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-xs text-ink-muted mb-1">内容</label>
              <textarea v-model="formData.content" class="input-parchment w-full h-40 resize-none" placeholder="世界设定的详细描述..." />
            </div>
            <div>
              <label class="block text-xs text-ink-muted mb-1">标签</label>
              <div class="flex gap-2 mb-2">
                <input v-model="newTag" class="input-parchment flex-1 text-xs" placeholder="添加标签..." @keyup.enter="addTag" />
                <button class="btn-primary text-xs" @click="addTag">添加</button>
              </div>
              <div class="flex flex-wrap gap-1">
                <span v-for="(tag, i) in formData.tags" :key="i" class="text-xs bg-[#F5F0E8] px-2 py-0.5 rounded-full flex items-center gap-1">
                  {{ tag }}
                  <button class="text-ink-muted hover:text-red-400" @click="formData.tags.splice(i, 1)">×</button>
                </span>
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-3 mt-6">
            <button class="btn-ghost text-sm" @click="showForm = false">取消</button>
            <button class="btn-primary text-sm" @click="saveEntry">{{ formData.id ? '保存修改' : '创建条目' }}</button>
          </div>
        </CardWrapper>
      </div>
    </Teleport>
  </div>
</template>
