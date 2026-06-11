<script setup>
// 流程时间线图 - 展示冒险进程中的关键事件和数值变化
import { ref, onMounted, watch, onUnmounted, computed } from 'vue'
import { Chart, registerables } from 'chart.js'
import { db } from '../../db/index.js'
import { formatDate } from '../../utils/format.js'
import CardWrapper from '../common/CardWrapper.vue'

Chart.register(...registerables)

const props = defineProps({
  sessionId: { type: Number, required: true },
  characterId: { type: Number, default: null },
  refreshKey: { type: Number, default: 0 }
})

const canvas = ref(null)
let chart = null
const timelineData = ref([])

/** 加载时间线数据：消息数量 + 骰子记录按时间排列 */
async function loadTimeline() {
  if (!props.sessionId) return

  // 按小时聚合消息数量
  const messages = await db.messages
    .where('sessionId').equals(props.sessionId)
    .sortBy('timestamp')

  if (messages.length === 0) {
    timelineData.value = []
    return
  }

  // 按日期聚合
  const dayMap = {}
  for (const msg of messages) {
    const day = new Date(msg.timestamp).toLocaleDateString('zh-CN')
    if (!dayMap[day]) dayMap[day] = { count: 0, date: day }
    dayMap[day].count++
  }

  timelineData.value = Object.values(dayMap)
  renderChart()
}

function renderChart() {
  if (chart) chart.destroy()
  if (!canvas.value || timelineData.value.length === 0) return

  chart = new Chart(canvas.value, {
    type: 'line',
    data: {
      labels: timelineData.value.map(d => d.date),
      datasets: [{
        label: '消息数量',
        data: timelineData.value.map(d => d.count),
        borderColor: '#8B8580',
        backgroundColor: 'rgba(139, 133, 128, 0.1)',
        fill: true,
        tension: 0.3,
        borderWidth: 1.5,
        pointBackgroundColor: '#5A5550',
        pointRadius: 3,
        pointHoverRadius: 5,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          title: { display: true, text: '日期', color: '#8B8580', font: { size: 11 } },
          ticks: { color: '#8B8580', font: { size: 10 }, maxRotation: 45 },
          grid: { color: 'rgba(0,0,0,0.04)' }
        },
        y: {
          title: { display: true, text: '消息数 / 事件', color: '#8B8580', font: { size: 11 } },
          ticks: { color: '#8B8580', font: { size: 10 }, stepSize: 1 },
          grid: { color: 'rgba(0,0,0,0.04)' },
          beginAtZero: true
        }
      }
    }
  })
}

onMounted(loadTimeline)
watch(() => props.sessionId, loadTimeline)
watch(() => props.refreshKey, loadTimeline)
onUnmounted(() => { if (chart) chart.destroy() })
</script>

<template>
  <CardWrapper class="p-5">
    <h4 class="text-sm text-ink-secondary tracking-wide mb-3">冒险流程时间线</h4>
    <div v-if="timelineData.length > 0" style="height: 220px;">
      <canvas ref="canvas" />
    </div>
    <div v-else class="h-[220px] flex items-center justify-center text-xs text-ink-muted">
      暂无数据，开始冒险后此处将展示时间线
    </div>
  </CardWrapper>
</template>
