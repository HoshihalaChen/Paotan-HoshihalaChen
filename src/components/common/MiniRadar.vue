<script setup>
/**
 * 微型雷达图组件
 * 用于角色创建时展示属性分布
 * 支持悬停预览职业/种族倾向 + 当前属性值实时展示
 */
import { ref, watch, onUnmounted, onMounted, computed } from 'vue'
import { Chart, registerables } from 'chart.js'

let chartReady = false
try { Chart.register(...registerables); chartReady = true } catch {}

const props = defineProps({
  // 属性定义列表 [{key, label, desc}]
  attributes: { type: Array, default: () => [] },
  // 当前属性值 {str:5, dex:3, ...}
  values: { type: Object, default: () => ({}) },
  // 预览属性值（悬停时显示）
  previewValues: { type: Object, default: null },
  // 尺寸
  size: { type: Number, default: 200 },
  // 是否显示预览
  showPreview: { type: Boolean, default: false }
})

const canvas = ref(null)
let chart = null

const labels = computed(() => props.attributes.map(a => a.label))
const currentData = computed(() => props.attributes.map(a => props.values[a.key] ?? 0))
const previewData = computed(() => {
  if (!props.previewValues) return null
  return props.attributes.map(a => props.previewValues[a.key] ?? 0)
})

function createChart() {
  if (!canvas.value || !chartReady) return
  if (chart) { chart.destroy(); chart = null }

  const datasets = [{
    label: '当前属性',
    data: currentData.value,
    backgroundColor: 'rgba(139, 133, 128, 0.2)',
    borderColor: 'rgba(90, 85, 80, 0.7)',
    borderWidth: 1.5,
    pointBackgroundColor: '#5A5550',
    pointRadius: 3
  }]

  if (props.showPreview && previewData.value) {
    datasets.push({
      label: '预览',
      data: previewData.value,
      backgroundColor: 'rgba(120, 140, 120, 0.15)',
      borderColor: 'rgba(90, 122, 90, 0.6)',
      borderWidth: 1.5,
      borderDash: [4, 3],
      pointBackgroundColor: '#5A7A5A',
      pointRadius: 3
    })
  }

  chart = new Chart(canvas.value, {
    type: 'radar',
    data: { labels: labels.value, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 400, easing: 'easeOutQuart' },
      plugins: { legend: { display: false } },
      scales: {
        r: {
          beginAtZero: true,
          min: 0,
          max: 8,
          ticks: { stepSize: 2, display: false },
          pointLabels: { font: { size: 10 }, color: '#4A4540' },
          grid: { color: 'rgba(0,0,0,0.06)' }
        }
      }
    }
  })
}

// 监听数据变化 → 平滑更新
watch([currentData, previewData, () => props.showPreview], () => {
  if (!chart) { createChart(); return }
  chart.data.labels = labels.value
  chart.data.datasets[0].data = currentData.value
  if (props.showPreview && previewData.value) {
    if (chart.data.datasets.length < 2) {
      chart.data.datasets.push({
        label: '预览', data: previewData.value,
        backgroundColor: 'rgba(120, 140, 120, 0.15)',
        borderColor: 'rgba(90, 122, 90, 0.6)',
        borderWidth: 1.5, borderDash: [4, 3],
        pointBackgroundColor: '#5A7A5A', pointRadius: 3
      })
    } else {
      chart.data.datasets[1].data = previewData.value
    }
  } else if (chart.data.datasets.length > 1) {
    chart.data.datasets.pop()
  }
  chart.update('active')
}, { deep: true })

onMounted(() => { createChart() })
onUnmounted(() => { if (chart) { chart.destroy(); chart = null } })
</script>

<template>
  <div class="flex items-center justify-center" :style="{ width: size + 'px', height: size + 'px' }">
    <canvas ref="canvas" />
  </div>
</template>
