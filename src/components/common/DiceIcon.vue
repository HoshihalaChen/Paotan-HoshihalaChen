<script setup>
// d20 骰子 SVG 图标
const props = defineProps({
  size: { type: Number, default: 24 },
  rolling: { type: Boolean, default: false }
})
</script>

<template>
  <svg
    :width="size" :height="size"
    :class="{ 'dice-rolling': rolling }"
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- 二十面体投影为六边形 -->
    <polygon
      points="24,2 44,14 44,34 24,46 4,34 4,14"
      stroke="#6B6560"
      stroke-width="1.2"
      fill="#FAF7F2"
    />
    <!-- 内部线条 -->
    <line x1="24" y1="2" x2="24" y2="46" stroke="#D8D2C8" stroke-width="0.6" />
    <line x1="4" y1="14" x2="44" y2="34" stroke="#D8D2C8" stroke-width="0.6" />
    <line x1="44" y1="14" x2="4" y2="34" stroke="#D8D2C8" stroke-width="0.6" />
    <!-- 数字 20 -->
    <text x="24" y="28" text-anchor="middle" fill="#6B6560" font-size="10" font-family="serif">20</text>
  </svg>
</template>
