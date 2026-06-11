<script setup>
// 冒险日志页 - 左侧任务条目列表 + 右侧记事文本框与关联
import { ref, computed, onMounted, watch } from 'vue'
import { useSessionStore } from '../stores/session.js'
import { useLogStore } from '../stores/log.js'
import { useCharacterStore } from '../stores/character.js'
import CardWrapper from '../components/common/CardWrapper.vue'
import { formatDate } from '../utils/format.js'

const sessionStore = useSessionStore()
const logStore = useLogStore()
const characterStore = useCharacterStore()

// 新建/编辑模式
const showForm = ref(false)
const formData = ref({ id: null, title: '', content: '', relatedNPCs: [], tags: [] })
const newNPC = ref('')
const newTag = ref('')

onMounted(async () => {
  if (sessionStore.currentSessionId) {
    await logStore.loadLogs(sessionStore.currentSessionId)
    await characterStore.loadCharacters(sessionStore.currentSessionId)
  }
})

watch(() => sessionStore.currentSessionId, async (id) => {
  if (id) {
    await logStore.loadLogs(id)
    await characterStore.loadCharacters(id)
  }
})

/** 打开新建表单 */
function openCreate() {
  formData.value = { id: null, title: '', content: '', relatedNPCs: [], tags: [] }
  newNPC.value = ''
  newTag.value = ''
  showForm.value = true
}

/** 编辑条目 */
function openEdit(entry) {
  formData.value = {
    id: entry.id,
    title: entry.title,
    content: entry.content,
    relatedNPCs: [...(entry.relatedNPCs || [])],
    tags: [...(entry.tags || [])]
  }
  newNPC.value = ''
  newTag.value = ''
  showForm.value = true
}

/** 保存 */
async function saveEntry() {
  if (!sessionStore.currentSessionId || !formData.value.title.trim()) return
  if (formData.value.id) {
    await logStore.updateEntry(formData.value.id, { ...formData.value })
  } else {
    await logStore.createEntry(sessionStore.currentSessionId, { ...formData.value })
  }
  showForm.value = false
}

/** 删除 */
async function deleteEntry(id) {
  await logStore.deleteEntry(id)
}

/** 添加 NPC */
function addNPC() {
  if (newNPC.value.trim()) {
    formData.value.relatedNPCs.push(newNPC.value.trim())
    newNPC.value = ''
  }
}

/** 添加标签 */
function addTag() {
  if (newTag.value.trim()) {
    formData.value.tags.push(newTag.value.trim())
    newTag.value = ''
  }
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- 页面标题 -->
    <div class="flex justify-between items-center">
      <div>
        <h2 class="text-xl text-ink-primary tracking-wider">冒险日志</h2>
        <p class="text-xs text-ink-muted tracking-wide">任务记录 · 冒险笔记</p>
      </div>
      <button class="btn-primary text-sm" @click="openCreate">+ 新日志</button>
    </div>

    <!-- 左右二分栏 -->
    <div class="flex gap-6">
      <!-- 左栏：日志条目列表 -->
      <div class="w-72 flex-shrink-0 space-y-2">
        <CardWrapper
          v-for="entry in logStore.entries"
          :key="entry.id"
          class="p-3 cursor-pointer transition-all"
          :class="{ 'ring-1 ring-[#B5AFA5]': logStore.currentEntryId === entry.id }"
          @click="logStore.selectEntry(entry.id)"
        >
          <h4 class="text-sm text-ink-primary font-medium truncate">{{ entry.title }}</h4>
          <p class="text-[10px] text-ink-muted mt-1">{{ formatDate(entry.timestamp) }}</p>
          <div v-if="entry.tags?.length" class="flex flex-wrap gap-1 mt-1">
            <span v-for="tag in entry.tags.slice(0, 3)" :key="tag" class="text-[9px] text-ink-muted bg-[#F5F0E8] px-1.5 py-0.5 rounded-full">{{ tag }}</span>
          </div>
        </CardWrapper>
        <div v-if="logStore.entries.length === 0" class="text-center py-8 text-xs text-ink-muted">
          暂无日志条目
        </div>
      </div>

      <!-- 右栏：日志内容 + 关联 -->
      <div class="flex-1">
        <CardWrapper v-if="logStore.currentEntry" class="p-6 fade-in">
          <div class="flex justify-between items-start mb-4">
            <div>
              <h3 class="text-base text-ink-primary font-medium">{{ logStore.currentEntry.title }}</h3>
              <p class="text-[10px] text-ink-muted">{{ formatDate(logStore.currentEntry.timestamp) }}</p>
            </div>
            <div class="flex gap-2">
              <button class="text-xs text-ink-muted hover:text-ink-primary" @click="openEdit(logStore.currentEntry)">编辑</button>
              <button class="text-xs text-red-400 hover:text-red-600" @click="deleteEntry(logStore.currentEntry.id)">删除</button>
            </div>
          </div>

          <!-- 正文 -->
          <div class="prose prose-sm max-w-none">
            <p class="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">{{ logStore.currentEntry.content || '暂无内容' }}</p>
          </div>

          <!-- 关联人物 -->
          <div class="mt-4 pt-4 border-t border-[#E8E2D8]">
            <h4 class="text-xs text-ink-muted tracking-wide mb-2">关联人物</h4>
            <div v-if="logStore.currentEntry.relatedNPCs?.length" class="flex flex-wrap gap-2">
              <span
                v-for="npc in logStore.currentEntry.relatedNPCs"
                :key="npc"
                class="text-xs bg-[#F5F0E8] px-3 py-1 rounded-full text-ink-secondary"
              >
                ◇ {{ npc }}
              </span>
            </div>
            <p v-else class="text-xs text-ink-muted">无关联人物</p>
          </div>

          <!-- 标签区域 -->
          <div class="mt-3">
            <h4 class="text-xs text-ink-muted tracking-wide mb-2">标签</h4>
            <div v-if="logStore.currentEntry.tags?.length" class="flex flex-wrap gap-1">
              <span
                v-for="tag in logStore.currentEntry.tags"
                :key="tag"
                class="text-[10px] bg-[#F5F0E8] px-2 py-0.5 rounded-full text-ink-secondary"
              >
                {{ tag }}
              </span>
            </div>
            <p v-else class="text-xs text-ink-muted">无标签</p>
          </div>
        </CardWrapper>
        <CardWrapper v-else class="p-12 text-center">
          <p class="text-sm text-ink-muted">选择左侧日志条目查看详情</p>
        </CardWrapper>
      </div>
    </div>

    <!-- 新建/编辑表单 -->
    <Teleport to="body">
      <div
        v-if="showForm"
        class="fixed inset-0 bg-black/20 z-50 flex items-center justify-center"
        @click.self="showForm = false"
      >
        <CardWrapper class="w-[500px] max-h-[80vh] overflow-y-auto p-6">
          <h3 class="text-lg text-ink-primary mb-4">
            {{ formData.id ? '编辑日志' : '新建日志' }}
          </h3>
          <div class="space-y-4">
            <div>
              <label class="block text-xs text-ink-muted mb-1">标题</label>
              <input v-model="formData.title" class="input-parchment w-full" placeholder="日志标题..." />
            </div>
            <div>
              <label class="block text-xs text-ink-muted mb-1">内容</label>
              <textarea
                v-model="formData.content"
                class="input-parchment w-full h-40 resize-none"
                placeholder="记录冒险中的事件..."
              />
            </div>
            <div>
              <label class="block text-xs text-ink-muted mb-1">关联人物</label>
              <div class="flex gap-2 mb-2">
                <input v-model="newNPC" class="input-parchment flex-1 text-xs" placeholder="NPC名称" @keyup.enter="addNPC" />
                <button class="btn-primary text-xs" @click="addNPC">添加</button>
              </div>
              <div class="flex flex-wrap gap-1">
                <span v-for="(npc, i) in formData.relatedNPCs" :key="i" class="text-xs bg-[#F5F0E8] px-2 py-0.5 rounded-full flex items-center gap-1">
                  {{ npc }}
                  <button class="text-ink-muted hover:text-red-400" @click="formData.relatedNPCs.splice(i, 1)">×</button>
                </span>
              </div>
            </div>
            <div>
              <label class="block text-xs text-ink-muted mb-1">标签</label>
              <div class="flex gap-2 mb-2">
                <input v-model="newTag" class="input-parchment flex-1 text-xs" placeholder="添加标签" @keyup.enter="addTag" />
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
            <button class="btn-primary text-sm" @click="saveEntry">
              {{ formData.id ? '保存修改' : '创建日志' }}
            </button>
          </div>
        </CardWrapper>
      </div>
    </Teleport>
  </div>
</template>
