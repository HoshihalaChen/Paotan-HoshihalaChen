<script setup>
// 导出对话框 - 提供多种导出选项
import { ref } from 'vue'
import { useExport } from '../../composables/useExport.js'
import CardWrapper from '../common/CardWrapper.vue'

const { exportChat, exportFullSession, isExporting } = useExport()

const props = defineProps({
  sessionId: { type: Number, default: null },
  sessionName: { type: String, default: '' }
})

const emit = defineEmits(['close'])

const exportType = ref('chat')

async function doExport() {
  if (!props.sessionId) return
  if (exportType.value === 'chat') {
    await exportChat(props.sessionId, props.sessionName)
  } else if (exportType.value === 'full') {
    await exportFullSession(props.sessionId, props.sessionName)
  }
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 bg-black/20 z-50 flex items-center justify-center" @click.self="emit('close')">
      <CardWrapper class="w-[400px] p-6">
        <h3 class="text-lg text-ink-primary mb-4">导出记录</h3>
        <div class="space-y-3 mb-6">
          <label class="flex items-center gap-3 p-3 rounded-lg hover:bg-[#F5F0E8] cursor-pointer">
            <input v-model="exportType" type="radio" value="chat" class="accent-[#5A5550]" />
            <div>
              <p class="text-sm text-ink-primary">聊天记录 (Markdown)</p>
              <p class="text-[10px] text-ink-muted">导出为 Markdown 格式，适合阅读和分享</p>
            </div>
          </label>
          <label class="flex items-center gap-3 p-3 rounded-lg hover:bg-[#F5F0E8] cursor-pointer">
            <input v-model="exportType" type="radio" value="full" class="accent-[#5A5550]" />
            <div>
              <p class="text-sm text-ink-primary">完整数据 (JSON)</p>
              <p class="text-[10px] text-ink-muted">包含角色、消息、骰子记录、世界观等全部数据</p>
            </div>
          </label>
        </div>
        <div class="flex justify-end gap-3">
          <button class="btn-ghost text-sm" @click="emit('close')">取消</button>
          <button class="btn-primary text-sm" :disabled="!sessionId || isExporting" @click="doExport">
            {{ isExporting ? '导出中...' : '导出' }}
          </button>
        </div>
      </CardWrapper>
    </div>
  </Teleport>
</template>
