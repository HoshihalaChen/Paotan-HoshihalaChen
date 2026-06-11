import { ref, computed } from 'vue'

/**
 * 天数周期系统
 *
 * 规则：
 * - 每局游戏起始年份、季节、月份、日期随机
 * - 天数从 0 开始计数
 * - 每天最多 4 个事件
 * - 每 4 个事件或触发睡眠事件 → 天数+1
 * - 一个完整事件 = 事件触发 → 事件过程 → 奖惩判定
 * - 当天数增加时返回 true，调用方可注入日期提示
 */
export function useDayCycle() {
  // 游戏内日期
  const year = ref(1492)
  const month = ref(1)
  const day = ref(1)
  const season = ref('spring')

  // 天数计数
  const dayCount = ref(0)
  const eventsToday = ref(0)
  const maxEventsPerDay = 4

  const seasonLabels = { spring: '春季', summer: '夏季', autumn: '秋季', winter: '冬季' }
  const seasonNames = ['spring', 'summer', 'autumn', 'winter']

  // 当前日期字符串
  const dateString = computed(() =>
    `${year.value}年${month.value}月${day.value}日 · ${seasonLabels[season.value]} · 第${dayCount.value}天`
  )

  /** 随机初始化起始日期 */
  function randomizeStartDate() {
    year.value = 1300 + Math.floor(Math.random() * 300) // 1300-1599
    month.value = 1 + Math.floor(Math.random() * 12)
    day.value = 1 + Math.floor(Math.random() * 28)
    const si = Math.floor(Math.random() * 4)
    season.value = seasonNames[si]
    dayCount.value = 0
    eventsToday.value = 0
  }

  /** 根据月份推断季节 */
  function inferSeason(m) {
    if (m >= 3 && m <= 5) return 'spring'
    if (m >= 6 && m <= 8) return 'summer'
    if (m >= 9 && m <= 11) return 'autumn'
    return 'winter'
  }

  /** 推进日期（天数+1时调用） */
  function advanceDate() {
    day.value++
    if (day.value > 28) {
      day.value = 1
      month.value++
      if (month.value > 12) {
        month.value = 1
        year.value++
      }
    }
    season.value = inferSeason(month.value)
  }

  /**
   * 记录一个事件完成
   * @returns {boolean} 是否触发了天数增加（需要提示日期）
   */
  function recordEvent() {
    eventsToday.value++

    if (eventsToday.value >= maxEventsPerDay) {
      advanceDay()
      return true
    }
    return false
  }

  /** 触发睡眠/长休 → 强制天数+1 */
  function triggerSleep() {
    advanceDay()
    return true
  }

  /** 内部：天数+1 */
  function advanceDay() {
    dayCount.value++
    eventsToday.value = 0
    advanceDate()
  }

  /** 获取当前状态快照 */
  function getSnapshot() {
    return {
      year: year.value,
      month: month.value,
      day: day.value,
      season: season.value,
      seasonLabel: seasonLabels[season.value],
      dayCount: dayCount.value,
      eventsToday: eventsToday.value,
      maxEventsPerDay,
      dateString: dateString.value
    }
  }

  /**
   * 构建日期提示文本（注入到聊天中）
   */
  function buildDateAnnouncement() {
    return `\n📅 **${dateString.value}** — 新的一天开始了。\n`
  }

  /**
   * 构建日期上下文（注入到 AI System Prompt）
   */
  function buildDateContext() {
    return `当前游戏日期：${dateString.value}。今日已发生 ${eventsToday.value}/${maxEventsPerDay} 个事件。`
  }

  return {
    year, month, day, season, dayCount, eventsToday, maxEventsPerDay,
    dateString, seasonLabels,
    randomizeStartDate, recordEvent, triggerSleep, getSnapshot,
    buildDateAnnouncement, buildDateContext
  }
}
