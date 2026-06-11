<script setup>
// 设置页 - API 配置、数据管理、关于信息
import { ref, computed, onMounted } from 'vue'
import { useSessionStore } from '../stores/session.js'
import { useExport } from '../composables/useExport.js'
import { useUIStore } from '../stores/ui.js'
import { getApiKey, setApiKey, hasCustomApiKey } from '../services/deepseek.js'
import { db } from '../db/index.js'
import { useBackup } from '../composables/useBackup.js'
import { useCustomAttrsStore } from '../stores/customAttrs.js'
import CardWrapper from '../components/common/CardWrapper.vue'
import CompassLogo from '../components/common/CompassLogo.vue'

const sessionStore = useSessionStore()
const { exportFullSession, isExporting } = useExport()
const backupService = useBackup()
const customAttrs = useCustomAttrsStore()

// 属性自定义状态
const attrModules = ref([])
const selectedAttrModule = ref(null)
const attrTab = ref('class')
const selectedClassOrRace = ref(null)

async function loadAttrModules() {
  try {
    const mod = await import('../../modules/index.js')
    const all = mod.getAllModules?.() || []
    attrModules.value = all
    if (all.length > 0 && !selectedAttrModule.value) selectedAttrModule.value = all[0].id
  } catch (e) {
    console.warn('[Settings] 模组数据加载失败，使用空列表')
    attrModules.value = []
  }
}
onMounted(loadAttrModules)

const currentModuleData = computed(() => {
  if (!attrModules.value?.length) return null
  return attrModules.value.find(m => m.id === selectedAttrModule.value) || null
})
const attrs = computed(() => currentModuleData.value?.charCreation?.attributes || [])
const classList = computed(() => currentModuleData.value?.charCreation?.classes || [])
const raceList = computed(() => currentModuleData.value?.charCreation?.races || [])
const defaultClassMods = computed(() => currentModuleData.value?.charCreation?.classMods || {})
const defaultRaceMods = computed(() => currentModuleData.value?.charCreation?.raceMods || {})
const mergedClassMods = computed(() => customAttrs.getClassMods(selectedAttrModule.value, defaultClassMods.value))
const mergedRaceMods = computed(() => customAttrs.getRaceMods(selectedAttrModule.value, defaultRaceMods.value))

function getMod(collection, key, attr) {
  return collection[key]?.[attr] ?? 0
}
function setMod(type, key, attr, value) {
  if (type === 'class') customAttrs.setClassAttr(selectedAttrModule.value, key, attr, value)
  else customAttrs.setRaceAttr(selectedAttrModule.value, key, attr, value)
}
function resetMods() {
  if (confirm('确定重置此模组的所有自定义属性为默认值？')) customAttrs.resetModule(selectedAttrModule.value)
}

const apiKeyInput = ref('')
const apiKeySaved = ref(false)
const showApiKey = ref(false)

onMounted(() => {
  apiKeyInput.value = getApiKey()
})

/** 保存 API Key */
function saveApiKey() {
  setApiKey(apiKeyInput.value.trim())
  apiKeySaved.value = true
  setTimeout(() => { apiKeySaved.value = false }, 2000)
}

/** 导出所有数据 */
async function exportAll() {
  if (sessionStore.currentSessionId) {
    await exportFullSession(sessionStore.currentSessionId, sessionStore.currentSession?.name)
  }
}

/** 清空所有数据 */
async function clearAllData() {
  if (confirm('确定要清空所有数据吗？此操作不可撤销。')) {
    try { await db.delete() } catch {}
    window.location.reload()
  }
}

/** 获取数据库信息 */
const dbInfo = ref({ sessions: 0, characters: 0, messages: 0, backups: 0 })
const backups = ref([])
async function refreshDBInfo() {
  try {
    dbInfo.value = {
      sessions: (await db.sessions.count()) || 0,
      characters: (await db.characters.count()) || 0,
      messages: (await db.messages.count()) || 0,
      backups: (await db.backups.count()) || 0
    }
    backups.value = (await backupService.getAllBackups()) || []
  } catch (e) {
    console.warn('[Settings] DB info refresh failed:', e.message)
  }
}
onMounted(() => { setTimeout(refreshDBInfo, 500) })

/** 删除单个备份 */
async function removeBackup(id) {
  try { await backupService.deleteBackup(id); await refreshDBInfo() } catch {}
}
/** 清空所有备份 */
async function clearBackups() {
  if (confirm('确定要清空所有游戏备份吗？此操作不可撤销。')) {
    try { await backupService.clearAllBackups(); await refreshDBInfo() } catch {}
  }
}
/** 下载备份文件 */
function downloadBackup(b) {
  try { backupService.downloadBackup(b) } catch {}
}

/** 格式化备份创建时间 */
function formatBackupTime(ts) {
  return new Date(ts).toLocaleString('zh-CN')
}
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <!-- 页面标题 -->
    <div class="flex items-center gap-4">
      <CompassLogo />
      <div>
        <h2 class="text-xl text-ink-primary tracking-wider">设置</h2>
        <p class="text-xs text-ink-muted tracking-wide">应用配置 · API · 数据管理</p>
      </div>
    </div>

    <!-- API 配置 -->
    <CardWrapper class="p-6">
      <h3 class="text-sm text-ink-secondary tracking-wide mb-4">AI API 配置</h3>
      <div class="space-y-3">
        <div>
          <label class="block text-xs text-ink-muted mb-1">DeepSeek API Key</label>
          <div class="flex gap-2">
            <input
              v-model="apiKeyInput"
              :type="showApiKey ? 'text' : 'password'"
              class="input-parchment flex-1 text-sm"
              placeholder="sk-..."
            />
            <button class="btn-ghost text-xs" @click="showApiKey = !showApiKey">
              {{ showApiKey ? '隐藏' : '显示' }}
            </button>
            <button class="btn-primary text-sm" @click="saveApiKey">
              {{ apiKeySaved ? '已保存 ✓' : '保存' }}
            </button>
          </div>
          <p class="text-[10px] mt-1" :class="hasCustomApiKey() ? 'text-ink-muted' : 'text-[#5A7A5A]'">
            <template v-if="hasCustomApiKey()">
              使用自定义 API Key · 仅存储在本地浏览器
            </template>
            <template v-else>
              ✓ 已配置默认 DeepSeek API Key · AI DM 服务可用
            </template>
          </p>
        </div>
        <div class="text-xs text-ink-muted bg-[#F5F0E8] p-3 rounded-lg">
          <p class="font-medium text-ink-secondary mb-1">AI DM 主动引导机制</p>
          <ul class="space-y-1">
            <li>· <strong>主动推进剧情</strong>：AI 会主动引入事件、NPC、转折，不被动等待玩家</li>
            <li>· <strong>沉浸式叙述</strong>：生动的感官描写 + 史诗感叙事风格</li>
            <li>· <strong>适时检定</strong>：在关键时刻自动要求玩家进行属性检定</li>
            <li>· <strong>世界记忆</strong>：对话历史保留 30 条 + 角色属性 + 世界观自动注入</li>
            <li>· <strong>持续引导</strong>：玩家犹豫时主动提供选项，确保故事不断推进</li>
          </ul>
        </div>
      </div>
    </CardWrapper>

    <!-- 数据管理 -->
    <CardWrapper class="p-6">
      <h3 class="text-sm text-ink-secondary tracking-wide mb-4">数据管理</h3>
      <div class="grid grid-cols-4 gap-4 mb-4">
        <div class="bg-[#F5F0E8] rounded-lg p-3 text-center">
          <p class="text-lg text-ink-primary font-medium">{{ dbInfo.sessions }}</p>
          <p class="text-[10px] text-ink-muted">跑团会话</p>
        </div>
        <div class="bg-[#F5F0E8] rounded-lg p-3 text-center">
          <p class="text-lg text-ink-primary font-medium">{{ dbInfo.characters }}</p>
          <p class="text-[10px] text-ink-muted">角色档案</p>
        </div>
        <div class="bg-[#F5F0E8] rounded-lg p-3 text-center">
          <p class="text-lg text-ink-primary font-medium">{{ dbInfo.messages }}</p>
          <p class="text-[10px] text-ink-muted">聊天消息</p>
        </div>
        <div class="bg-[#F5F0E8] rounded-lg p-3 text-center">
          <p class="text-lg text-ink-primary font-medium">{{ dbInfo.backups }}</p>
          <p class="text-[10px] text-ink-muted">备份存档</p>
        </div>
      </div>
      <div class="flex gap-3">
        <button class="btn-primary text-sm" :disabled="!sessionStore.currentSessionId || isExporting" @click="exportAll">
          {{ isExporting ? '导出中...' : '导出当前会话 JSON' }}
        </button>
        <button class="btn-ghost text-sm text-red-400 hover:text-red-600" @click="clearAllData">
          清空所有数据
        </button>
      </div>
    </CardWrapper>

    <!-- 属性自定义 -->
    <CardWrapper class="p-6">
      <h3 class="text-sm text-ink-secondary tracking-wide mb-4">初始属性自定义</h3>
      <div class="flex items-center gap-4 mb-4">
        <select v-model="selectedAttrModule" class="input-parchment text-sm w-48">
          <option v-for="m in attrModules" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
        <div class="flex gap-1">
          <button class="text-xs px-3 py-1 rounded" :class="attrTab==='class'?'bg-[#5A5550] text-[#F5F0E8]':'text-ink-muted hover:bg-[#E8E2D8]'" @click="attrTab='class';selectedClassOrRace=null">职业</button>
          <button class="text-xs px-3 py-1 rounded" :class="attrTab==='race'?'bg-[#5A5550] text-[#F5F0E8]':'text-ink-muted hover:bg-[#E8E2D8]'" @click="attrTab='race';selectedClassOrRace=null">种族</button>
        </div>
        <button class="btn-ghost text-xs text-red-400 ml-auto" @click="resetMods">重置默认</button>
      </div>

      <div class="flex gap-4">
        <!-- 列表 -->
        <div class="w-32 flex-shrink-0 space-y-1 max-h-64 overflow-y-auto">
          <button
            v-for="item in (attrTab==='class' ? classList : raceList)"
            :key="item"
            class="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-[#F5F0E8] transition-colors"
            :class="selectedClassOrRace===item ? 'bg-[#5A5550] text-[#F5F0E8]' : 'text-ink-secondary'"
            @click="selectedClassOrRace = item"
          >{{ item }}</button>
        </div>

        <!-- 滑块面板 -->
        <div class="flex-1">
          <template v-if="selectedClassOrRace">
            <div
              v-for="attr in attrs"
              :key="attr.key"
              class="flex items-center gap-3 mb-2"
            >
              <span class="text-xs text-ink-muted w-10">{{ attr.label }}</span>
              <input
                type="range"
                :min="-3" :max="3" :step="1"
                :value="getMod(attrTab==='class'?mergedClassMods:mergedRaceMods, selectedClassOrRace, attr.key)"
                class="flex-1 accent-[#5A5550] h-1"
                @input="setMod(attrTab, selectedClassOrRace, attr.key, parseInt($event.target.value))"
              />
              <span class="text-xs w-6 text-right font-medium"
                :class="getMod(attrTab==='class'?mergedClassMods:mergedRaceMods, selectedClassOrRace, attr.key) >= 0 ? 'text-[#5A7A5A]' : 'text-red-400'"
              >{{ getMod(attrTab==='class'?mergedClassMods:mergedRaceMods, selectedClassOrRace, attr.key) >= 0 ? '+' : '' }}{{ getMod(attrTab==='class'?mergedClassMods:mergedRaceMods, selectedClassOrRace, attr.key) }}</span>
            </div>
            <p class="text-[10px] text-ink-muted mt-2">调整范围 -3 到 +3。修改后角色创建时自动应用。</p>
          </template>
          <div v-else class="text-xs text-ink-muted py-8 text-center">← 选择一个{{ attrTab==='class'?'职业':'种族' }}开始调整</div>
        </div>
      </div>
    </CardWrapper>

    <!-- 备份管理（已迁移至存档页） -->
    <CardWrapper class="p-4 text-center">
      <p class="text-xs text-ink-muted">
        备份和存档管理已迁移至
        <span class="text-ink-primary cursor-pointer hover:underline" @click="useUIStore().setPage('archive')">存档页面</span>
      </p>
    </CardWrapper>

    <!-- 关于 -->
    <CardWrapper class="p-6">
      <h3 class="text-sm text-ink-secondary tracking-wide mb-4">关于</h3>
      <div class="space-y-2 text-sm text-ink-secondary">
        <p>跑团助手 v1.0 · TRPG Manager</p>
        <p class="text-xs text-ink-muted">技术栈：Vue 3 + Vite + Tailwind CSS + Pinia + Dexie.js</p>
        <p class="text-xs text-ink-muted">AI 模型：DeepSeek V4 PRO · 流式打字机回复</p>
        <p class="text-xs text-ink-muted">支持规则：D&D 5E, Pathfinder 2E, COC 7th</p>
        <p class="text-xs text-ink-muted mt-2">课程作品 · 2026</p>
      </div>
    </CardWrapper>
  </div>
</template>
