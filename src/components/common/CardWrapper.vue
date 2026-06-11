<script setup>
// 圆角卡片容器，提供统一的卡片外观
defineProps({
  hoverable: { type: Boolean, default: false }
})
</script>

<template>
  <div
    class="bg-[#FAF7F2] rounded-card transition-all duration-300"
    :style="{
      boxShadow: hoverable
        ? 'inset 0 0 0 1px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)'
        : 'inset 0 0 0 1px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)'
    }"
  >
    <slot />
  </div>
</template>
