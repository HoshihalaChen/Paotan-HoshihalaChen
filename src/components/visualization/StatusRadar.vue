<script setup>
// 角色状态雷达图 - 六维属性雷达图
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { Chart, registerables } from 'chart.js'
import { statLabels } from '../../utils/format.js'
import CardWrapper from '../common/CardWrapper.vue'

Chart.register(...registerables)

const props = defineProps({
  character: { type: Object, default: null }
})

const canvas = ref(null)
let chart = null

const statKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha']

function renderChart() {
  if (chart) chart.destroy()
  if (!canvas.value || !props.character) return

  const data = statKeys.map(k => props.character[k] || 10)
  const labels = statKeys.map(k => statLabels[k])

  chart = new Chart(canvas.value, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: props.character.name || '角色属性',
        data,
        backgroundColor: 'rgba(139, 133, 128, 0.15)',
        borderColor: 'rgba(90, 85, 80, 0.6)',
        borderWidth: 1.5,
        pointBackgroundColor: data.map(v => {
          if (v >= 18) return '#5A7A5A'
          if (v >= 14) return '#7A8B6A'
          if (v >= 10) return '#8B8580'
          return '#8B5A5A'
        }),
        pointBorderColor: '#FAF7F2',
        pointRadius: 4,
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        r: {
          beginAtZero: false,
          min: 0,
          max: 20,
          ticks: {
            stepSize: 5,
            color: '#8B8580',
            font: { size: 9 },
            backdropColor: 'transparent'
          },
          pointLabels: {
            color: '#4A4540',
            font: { size: 11 }
          },
          grid: {
            color: 'rgba(0,0,0,0.08)'
          },
          angleLines: {
            color: 'rgba(0,0,0,0.08)'
          }
        }
      }
    }
  })
}

watch(() => props.character, renderChart, { deep: true, immediate: true })
onUnmounted(() => { if (chart) chart.destroy() })
</script>

<template>
  <CardWrapper class="p-5">
    <h4 class="text-sm text-ink-secondary tracking-wide mb-3">属性雷达图</h4>
    <div v-if="character" style="height: 260px;">
      <canvas ref="canvas" />
    </div>
    <div v-else class="h-[260px] flex items-center justify-center text-xs text-ink-muted">
      请先选择角色
    </div>
  </CardWrapper>
</template>
