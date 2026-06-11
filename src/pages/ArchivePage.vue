<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSessionStore } from '../stores/session.js'
import { useCharacterStore } from '../stores/character.js'
import { useChatStore } from '../stores/chat.js'
import { useUIStore } from '../stores/ui.js'
import { useModuleContextStore } from '../stores/moduleContext.js'
import { useDayCycleStore } from '../stores/dayCycle.js'
import { useBackup } from '../composables/useBackup.js'
import { getArchivesGrouped, restoreArchive, deleteArchive, exportSelectedArchives, createArchive } from '../services/archive.js'
import { db } from '../db/index.js'
import CardWrapper from '../components/common/CardWrapper.vue'
import CompassLogo from '../components/common/CompassLogo.vue'

const sessionStore = useSessionStore()
const characterStore = useCharacterStore()
const chatStore = useChatStore()
const ui = useUIStore()
const moduleCtxStore = useModuleContextStore()
const dayCycle = useDayCycleStore()
const backupService = useBackup()

// 存档分组数据
const archivesGrouped = ref({})
const loading = ref(false)
const showPrompt = ref(false)
const pendingRestore = ref(null)
const pendingNav = ref(null)

// 展开状态
const expandedMod = ref(null)
const expandedChar = ref(null)

// 选中批量备份
const selectedIds = ref(new Set())

// 备份管理
const allBackups = ref([])

onMounted(async () => {
  await loadArchives()
  allBackups.value = await backupService.getAllBackups()
})

async function loadArchives() {
  loading.value = true
  archivesGrouped.value = await getArchivesGrouped()
  loading.value = false
}

const moduleList = computed(() => Object.keys(archivesGrouped.value).sort())

function charList(modName) {
  return Object.keys(archivesGrouped.value[modName] || {}).sort()
}

function archivesFor(modName, charName) {
  return archivesGrouped.value[modName]?.[charName] || []
}

function toggleMod(name) { expandedMod.value = expandedMod.value === name ? null : name }
function toggleChar(name) { expandedChar.value = expandedChar.value === name ? null : name }

/** 格式化时间 */
function fmtTime(ts) { return new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) }

/** 请求恢复存档 */
function requestRestore(archive) {
  showPrompt.value = true
  pendingRestore.value = archive
}

/** 确认恢复 */
async function confirmRestore() {
  if (!pendingRestore.value) return
  const archive = pendingRestore.value

  // 先保存当前进度
  if (sessionStore.currentSessionId && sessionStore.isGameActive) {
    const charId = characterStore.currentCharacterId
    await createArchive(sessionStore.currentSessionId, charId, {
      moduleName: moduleCtxStore.moduleName,
      characterName: characterStore.currentCharacter?.name || '',
      dayCount: dayCycle.dayCount,
      force: true
    })
  }

  // 恢复目标存档
  const { sessionId, snapshot } = await restoreArchive(archive.id)

  // 切换会话
  await sessionStore.switchSession(sessionId)
  await sessionStore.activateGame(sessionId)

  // 恢复日期
  if (snapshot.dayCount != null) {
    dayCycle.dayCount = snapshot.dayCount
  }

  // 重新加载
  await chatStore.loadMessages(sessionId)
  await characterStore.loadCharacters(sessionId)

  showPrompt.value = false
  pendingRestore.value = null
  ui.setPage('game')
}

function cancelRestore() {
  showPrompt.value = false
  pendingRestore.value = null
}

/** 删除存档 */
async function removeArchive(archive) {
  if (!confirm(`确定删除「${archive.characterName}」第${archive.dayCount}天的存档吗？`)) return
  await deleteArchive(archive.id)
  await loadArchives()
}

/** 切换选择 */
function toggleSelect(id) {
  const s = new Set(selectedIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selectedIds.value = s
}

/** 导出选中 */
async function exportSelected() {
  if (selectedIds.value.size === 0) return
  await exportSelectedArchives([...selectedIds.value])
  selectedIds.value = new Set()
}

/** 一键全部备份 */
async function backupAllArchives() {
  const allIds = []
  for (const mod of moduleList.value) {
    for (const char of charList(mod)) {
      for (const a of archivesFor(mod, char)) {
        allIds.push(a.id)
      }
    }
  }
  if (allIds.length === 0) return
  await exportSelectedArchives(allIds)
}

/** 手动保存当前游戏 */
async function manualSave() {
  if (!sessionStore.currentSessionId) {
    alert('没有正在进行的游戏')
    return
  }
  await createArchive(sessionStore.currentSessionId, characterStore.currentCharacterId, {
    moduleName: moduleCtxStore.moduleName,
    characterName: characterStore.currentCharacter?.name || '',
    dayCount: dayCycle.dayCount,
    force: true
  })
  await loadArchives()
}

/** 备份操作 */
async function downloadBackup(b) { backupService.downloadBackup(b) }
async function removeBackup(id) { await backupService.deleteBackup(id); allBackups.value = await backupService.getAllBackups() }
async function clearBackups() {
  if (confirm('确定清空所有备份？')) { await backupService.clearAllBackups(); allBackups.value = [] }
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- 标题 -->
    <div class="flex justify-between items-center">
      <div class="flex items-center gap-3">
        <CompassLogo />
        <div>
          <h2 class="text-xl text-ink-primary tracking-wider">存档管理</h2>
          <p class="text-xs text-ink-muted">存读档 · 回退 · 备份</p>
        </div>
      </div>
      <div class="flex gap-2">
        <button class="btn-ghost text-xs" @click="loadArchives" :disabled="loading">
          {{ loading ? '加载中...' : '刷新' }}
        </button>
        <button class="btn-primary text-sm" @click="manualSave" :disabled="!sessionStore.isGameActive">
          手动存档
        </button>
      </div>
    </div>

    <!-- 存档列表（三级分类） -->
    <CardWrapper v-if="moduleList.length === 0 && !loading" class="p-12 text-center">
      <p class="text-sm text-ink-muted">暂无存档</p>
      <p class="text-xs text-ink-muted/60 mt-1">游戏天数+1时自动存档，也可随时手动存档</p>
    </CardWrapper>

    <div v-for="mod in moduleList" :key="mod" class="space-y-2">
      <!-- 一级：模组 -->
      <div
        class="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-[#F5F0E8] transition-colors"
        :class="expandedMod === mod ? 'bg-[#F5F0E8]' : ''"
        @click="toggleMod(mod)"
      >
        <span class="text-xs">{{ expandedMod === mod ? '▼' : '▶' }}</span>
        <span class="text-sm text-ink-primary font-medium">📦 {{ mod }}</span>
        <span class="text-xs text-ink-muted">
          ({{ Object.values(archivesGrouped[mod] || {}).flat().length }} 存档)
        </span>
      </div>

      <div v-if="expandedMod === mod" class="pl-8 space-y-1">
        <!-- 二级：角色 -->
        <div v-for="char in charList(mod)" :key="char">
          <div
            class="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-[#FAF7F2] transition-colors"
            :class="expandedChar === mod + '|' + char ? 'bg-[#FAF7F2]' : ''"
            @click="toggleChar(mod + '|' + char)"
          >
            <span class="text-xs">{{ expandedChar === mod + '|' + char ? '▼' : '▶' }}</span>
            <span class="text-sm text-ink-secondary">👤 {{ char }}</span>
            <span class="text-[10px] text-ink-muted">
              {{ archivesFor(mod, char)[0]?.createdAtBJ || '' }}
              ({{ archivesFor(mod, char).length }}/10)
            </span>
          </div>

          <!-- 三级：天数存档 -->
          <div v-if="expandedChar === mod + '|' + char" class="pl-8 space-y-1 mt-1">
            <div
              v-for="archive in archivesFor(mod, char)"
              :key="archive.id"
              class="flex items-center justify-between p-2 rounded hover:bg-[#F5F0E8]/50 transition-colors"
            >
              <div class="flex items-center gap-3">
                <input
                  type="checkbox"
                  :checked="selectedIds.has(archive.id)"
                  class="accent-[#5A5550] w-3 h-3"
                  @click.stop
                  @change="toggleSelect(archive.id)"
                />
                <div>
                  <p class="text-xs text-ink-primary">
                    📅 第 {{ archive.dayCount }} 天
                    <span class="text-[10px] text-ink-muted ml-2">{{ fmtTime(archive.createdAt) }}</span>
                  </p>
                </div>
              </div>
              <div class="flex gap-1">
                <button class="text-[10px] text-[#5A7A5A] hover:underline px-1" @click="requestRestore(archive)">
                  读取
                </button>
                <button class="text-[10px] text-red-400 hover:underline px-1" @click="removeArchive(archive)">
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 批量操作 -->
    <CardWrapper v-if="selectedIds.size > 0" class="p-4 flex items-center justify-between">
      <span class="text-xs text-ink-secondary">已选 {{ selectedIds.size }} 个存档</span>
      <div class="flex gap-2">
        <button class="btn-primary text-xs" @click="exportSelected">导出选中</button>
        <button class="btn-ghost text-xs" @click="selectedIds = new Set()">取消选择</button>
      </div>
    </CardWrapper>

    <!-- 备份管理（从设置页迁移） -->
    <CardWrapper class="p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-sm text-ink-secondary tracking-wide">
          备份管理 <span class="text-xs text-ink-muted">({{ allBackups.length }} 个)</span>
        </h3>
        <div class="flex gap-2">
          <button class="btn-primary text-xs" @click="backupAllArchives" :disabled="moduleList.length === 0">
            一键全部备份
          </button>
          <button v-if="allBackups.length > 0" class="btn-ghost text-xs text-red-400" @click="clearBackups">
            清空备份
          </button>
        </div>
      </div>
      <div v-if="allBackups.length === 0" class="text-xs text-ink-muted py-2 text-center">暂无备份</div>
      <div v-else class="space-y-1 max-h-48 overflow-y-auto">
        <div v-for="b in allBackups" :key="b.id" class="flex items-center justify-between text-xs py-1">
          <span class="text-ink-secondary truncate flex-1">{{ b.filename }}</span>
          <span class="text-ink-muted mx-2">{{ fmtTime(b.createdAt) }}</span>
          <button class="text-ink-muted hover:text-ink-primary px-1" @click="downloadBackup(b)">下载</button>
          <button class="text-red-400 hover:text-red-600 px-1" @click="removeBackup(b.id)">删除</button>
        </div>
      </div>
    </CardWrapper>

    <!-- 恢复确认弹窗 -->
    <Teleport to="body">
      <div v-if="showPrompt" class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
        <CardWrapper class="w-[400px] p-6">
          <h3 class="text-lg text-ink-primary mb-2">确认读取存档</h3>
          <p class="text-sm text-ink-secondary mb-1">
            将恢复到「{{ pendingRestore?.characterName }}」第 {{ pendingRestore?.dayCount }} 天的存档。
          </p>
          <p class="text-xs text-ink-muted mb-4">
            当前进度将自动保存后再恢复。此操作不可撤销。
          </p>
          <div class="flex justify-end gap-3">
            <button class="btn-ghost text-sm" @click="cancelRestore">取消</button>
            <button class="btn-primary text-sm" @click="confirmRestore">确认恢复</button>
          </div>
        </CardWrapper>
      </div>
    </Teleport>
  </div>
</template>
