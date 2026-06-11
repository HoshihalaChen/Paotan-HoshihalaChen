import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * 天数周期系统 — Pinia Store（跨页面共享）
 */
export const useDayCycleStore = defineStore('dayCycle', () => {
  const year = ref(1492)
  const month = ref(1)
  const day = ref(1)
  const season = ref('spring')
  const dayCount = ref(0)
  const eventsToday = ref(0)
  const maxEventsPerDay = 4

  const seasonLabels = { spring: '春季', summer: '夏季', autumn: '秋季', winter: '冬季' }
  const seasonNames = ['spring', 'summer', 'autumn', 'winter']

  const dateString = computed(() =>
    `${year.value}年${month.value}月${day.value}日 · ${seasonLabels[season.value]} · 第${dayCount.value}天`
  )

  function randomizeStartDate() {
    year.value = 1300 + Math.floor(Math.random() * 300)
    month.value = 1 + Math.floor(Math.random() * 12)
    day.value = 1 + Math.floor(Math.random() * 28)
    season.value = seasonNames[Math.floor(Math.random() * 4)]
    dayCount.value = 0
    eventsToday.value = 0
  }

  function inferSeason(m) {
    if (m >= 3 && m <= 5) return 'spring'
    if (m >= 6 && m <= 8) return 'summer'
    if (m >= 9 && m <= 11) return 'autumn'
    return 'winter'
  }

  function advanceDate() {
    day.value++
    if (day.value > 28) { day.value = 1; month.value++; if (month.value > 12) { month.value = 1; year.value++ } }
    season.value = inferSeason(month.value)
  }

  function recordEvent() {
    eventsToday.value++
    if (eventsToday.value >= maxEventsPerDay) { advanceDay(); return true }
    return false
  }

  function triggerSleep() { advanceDay(); return true }

  function advanceDay() { dayCount.value++; eventsToday.value = 0; advanceDate() }

  function getSnapshot() {
    return { year: year.value, month: month.value, day: day.value, season: season.value,
      seasonLabel: seasonLabels[season.value], dayCount: dayCount.value,
      eventsToday: eventsToday.value, maxEventsPerDay, dateString: dateString.value }
  }

  function buildDateAnnouncement() {
    return `\n📅 **${dateString.value}** — 新的一天开始了。\n`
  }

  function buildDateContext() {
    return `当前游戏日期：${dateString.value}。今日已发生 ${eventsToday.value}/${maxEventsPerDay} 个事件。`
  }

  return { year, month, day, season, dayCount, eventsToday, maxEventsPerDay,
    dateString, seasonLabels, randomizeStartDate, recordEvent, triggerSleep,
    getSnapshot, buildDateAnnouncement, buildDateContext }
})
