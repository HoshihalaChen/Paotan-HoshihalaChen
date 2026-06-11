<script setup>
// 通用进度条组件 - 用于属性数值、好感度等
const props = defineProps({
  label: { type: String, default: '' },
  value: { type: Number, default: 0 },
  max: { type: Number, default: 20 },
  color: { type: String, default: '#8B8580' },
  showValue: { type: Boolean, default: true }
})

const percentage = computed(() => Math.min(100, (props.value / props.max) * 100))
</script>

<script>
import { computed } from 'vue'
</script>

<template>
  <div class="w-full">
    <div v-if="label" class="flex justify-between items-center mb-1">
      <span class="text-xs text-ink-secondary tracking-wide">{{ label }}</span>
      <span v-if="showValue" class="text-xs text-ink-primary font-medium">{{ value }}/{{ max }}</span>
    </div>
    <div class="w-full h-2 bg-[#E8E2D8] rounded-full overflow-hidden">
      <div
        class="progress-fill h-full rounded-full"
        :style="{ width: percentage + '%', backgroundColor: color }"
      />
    </div>
  </div>
</template>
