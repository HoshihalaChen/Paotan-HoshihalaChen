<script setup>
// 投骰统计柱状图 - 使用 Chart.js
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { Chart, registerables } from 'chart.js'
import { getDiceStats } from '../../services/dice.js'
import CardWrapper from '../common/CardWrapper.vue'

Chart.register(...registerables)

const props = defineProps({
  sessionId: { type: Number, required: true },
  refreshKey: { type: Number, default: 0 } // 外部触发刷新
})

const canvas = ref(null)
let chart = null
const stats = ref({ total: 0, avgTotal: 0, d20Count: 0, nat20: 0, nat1: 0, distribution: {} })

/** 加载统计并渲染图表 */
async function loadStats() {
  if (!props.sessionId) return
  stats.value = await getDiceStats(props.sessionId)
  renderChart()
}

function renderChart() {
  if (chart) chart.destroy()
  if (!canvas.value || stats.value.total === 0) return

  const dist = stats.value.distribution
  const keys = Object.keys(dist).map(Number).sort((a, b) => a - b)

  chart = new Chart(canvas.value, {
    type: 'bar',
    data: {
      labels: keys.map(String),
      datasets: [{
        label: '投骰结果分布',
        data: keys.map(k => dist[k]),
        backgroundColor: keys.map(k => {
          if (k === 20) return 'rgba(90, 122, 90, 0.6)'   // nat20 绿色
          if (k === 1) return 'rgba(139, 90, 90, 0.6)'     // nat1 红色
          return 'rgba(139, 133, 128, 0.4)'                // 默认灰色
        }),
        borderColor: keys.map(k => {
          if (k === 20) return '#5A7A5A'
          if (k === 1) return '#8B5A5A'
          return '#8B8580'
        }),
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `投出 ${ctx.label}: ${ctx.raw} 次`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: '骰子结果', color: '#8B8580', font: { size: 11 } },
          ticks: { color: '#8B8580', font: { size: 10 } },
          grid: { color: 'rgba(0,0,0,0.04)' }
        },
        y: {
          title: { display: true, text: '次数', color: '#8B8580', font: { size: 11 } },
          ticks: { color: '#8B8580', font: { size: 10 }, stepSize: 1 },
          grid: { color: 'rgba(0,0,0,0.04)' },
          beginAtZero: true
        }
      }
    }
  })
}

onMounted(loadStats)
watch(() => props.sessionId, loadStats)
watch(() => props.refreshKey, loadStats)
onUnmounted(() => { if (chart) chart.destroy() })
</script>

<template>
  <CardWrapper class="p-5">
    <div class="flex justify-between items-center mb-3">
      <h4 class="text-sm text-ink-secondary tracking-wide">投骰统计</h4>
      <div class="flex gap-4 text-xs text-ink-muted">
        <span>总计: <strong class="text-ink-primary">{{ stats.total }}</strong> 次</span>
        <span v-if="stats.d20Count">d20: <strong class="text-ink-primary">{{ stats.d20Count }}</strong> 次</span>
        <span class="text-green-700">Nat20: <strong>{{ stats.nat20 }}</strong></span>
        <span class="text-red-600">Nat1: <strong>{{ stats.nat1 }}</strong></span>
        <span>均值: <strong class="text-ink-primary">{{ stats.avgTotal }}</strong></span>
      </div>
    </div>
    <div v-if="stats.total > 0" style="height: 200px;">
      <canvas ref="canvas" />
    </div>
    <div v-else class="h-[200px] flex items-center justify-center text-xs text-ink-muted">
      暂无投骰记录
    </div>
  </CardWrapper>
</template>
