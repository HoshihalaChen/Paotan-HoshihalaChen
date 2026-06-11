<script setup>
// 手动存档栏位选择弹窗
import { ref, onMounted } from 'vue'
import { createArchive, getManualArchives } from '../../services/archive.js'
import CardWrapper from '../common/CardWrapper.vue'

const props = defineProps({
  sessionId: { type: Number, required: true },
  characterId: { type: Number, default: null },
  moduleName: { type: String, default: '' },
  characterName: { type: String, default: '' },
  dayCount: { type: Number, default: 0 }
})

const emit = defineEmits(['saved', 'close'])

const MAX_SLOTS = 5
const slots = ref([])       // { index: 1-5, archive: null | { id, dayCount, createdAtBJ } }
const saving = ref(false)
const savingIndex = ref(-1)
const errorMsg = ref('')

onMounted(async () => {
  await loadSlots()
})

async function loadSlots() {
  const manuals = await getManualArchives(props.sessionId, props.characterId || 0)
  // 构建 1-5 号槽位数组
  const arr = []
  for (let i = 0; i < MAX_SLOTS; i++) {
    arr.push({
      index: i + 1,
      archive: manuals[i] || null
    })
  }
  slots.value = arr
}

async function saveToSlot(slotIndex) {
  errorMsg.value = ''
  const existing = slots.value[slotIndex - 1]
  if (existing?.archive) {
    // 已有存档，需要确认覆盖
    if (!confirm(`确定覆盖槽位 ${slotIndex} 的存档吗？\n${existing.archive.characterName} · D${existing.archive.dayCount} · ${existing.archive.createdAtBJ}`)) {
      return
    }
  }
  saving.value = true
  savingIndex.value = slotIndex
  try {
    await createArchive(props.sessionId, props.characterId || 0, {
      moduleName: props.moduleName,
      characterName: props.characterName,
      dayCount: props.dayCount,
      saveType: 'manual',
      force: true
    })
    emit('saved')
    await loadSlots()
  } catch (e) {
    errorMsg.value = e.message || '保存失败'
  } finally {
    saving.value = false
    savingIndex.value = -1
  }
}

function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" @click.self="emit('close')">
      <CardWrapper class="w-[480px] max-h-[85vh] overflow-y-auto p-6">
        <h3 class="text-lg text-ink-primary mb-1">保存进度</h3>
        <p class="text-xs text-ink-muted mb-4">
          {{ characterName }} · 第 {{ dayCount }} 天 · 选择保存栏位
        </p>

        <!-- 错误提示 -->
        <div v-if="errorMsg" class="bg-red-50 text-red-500 text-xs p-2 rounded-lg mb-3">
          {{ errorMsg }}
        </div>

        <!-- 5 个手动存档槽位 -->
        <div class="space-y-2">
          <div
            v-for="slot in slots"
            :key="slot.index"
            class="border rounded-lg p-3 cursor-pointer transition-all hover:border-[#5A5550] hover:bg-[#F5F0E8]/50"
            :class="slot.archive
              ? 'border-[#D8D2C8] bg-[#FAF7F2]'
              : 'border-dashed border-[#D8D2C8]/60 bg-transparent'"
            @click="saveToSlot(slot.index)"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="text-sm font-medium text-ink-muted w-6">#{{ slot.index }}</span>
                <div v-if="slot.archive">
                  <p class="text-sm text-ink-primary">{{ slot.archive.characterName }}</p>
                  <p class="text-[10px] text-ink-muted">
                    第 {{ slot.archive.dayCount }} 天 · {{ slot.archive.createdAtBJ || fmtTime(slot.archive.createdAt) }}
                  </p>
                </div>
                <div v-else>
                  <p class="text-sm text-ink-muted/50">空槽位 — 点击保存</p>
                </div>
              </div>
              <div v-if="saving && savingIndex === slot.index" class="text-xs text-ink-muted animate-pulse">
                保存中...
              </div>
            </div>
          </div>
        </div>

        <p class="text-[10px] text-ink-muted/50 mt-3">共 {{ MAX_SLOTS }} 个手动存档栏位，自动存档独立管理不受影响</p>

        <div class="flex justify-end mt-4">
          <button class="btn-ghost text-sm" @click="emit('close')">取消</button>
        </div>
      </CardWrapper>
    </div>
  </Teleport>
</template>
