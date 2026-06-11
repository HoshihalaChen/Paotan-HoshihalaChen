<script setup>
// 地图页面 - 地图生成器接口预留 + 只读游戏日期 + 图层勾选
import { onMounted, computed } from 'vue'
import { useSessionStore } from '../stores/session.js'
import { useMapStore } from '../stores/map.js'
import { useDayCycleStore } from '../stores/dayCycle.js'
import CardWrapper from '../components/common/CardWrapper.vue'

const sessionStore = useSessionStore()
const mapStore = useMapStore()
const dayCycle = useDayCycleStore()

const seasonIcons = { spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️' }
const currentSeasonIcon = computed(() => seasonIcons[dayCycle.season] || '')

onMounted(async () => {
  if (sessionStore.currentSessionId) {
    await mapStore.loadMapData(sessionStore.currentSessionId)
  }
})

async function saveMapConfig() {
  if (sessionStore.currentSessionId) {
    await mapStore.saveMapData(sessionStore.currentSessionId)
  }
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- 页面标题 -->
    <div class="flex justify-between items-center">
      <div>
        <h2 class="text-xl text-ink-primary tracking-wider">冒险地图</h2>
        <p class="text-xs text-ink-muted tracking-wide">世界地图 · 场景管理 · 日期由游戏系统自动管理</p>
      </div>
      <div class="flex gap-2">
        <button class="btn-ghost text-sm" @click="saveMapConfig">保存图层配置</button>
        <span class="text-xs text-ink-muted self-center">地图生成器即将接入</span>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-6">
      <!-- 地图主区域 (2/3) -->
      <CardWrapper class="col-span-2 p-0 overflow-hidden" style="min-height: 480px;">
        <div class="w-full h-full min-h-[480px] bg-[#E8E2D8]/50 flex flex-col items-center justify-center relative">
          <div
            class="absolute inset-0 opacity-10"
            style="background-image: linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px); background-size: 40px 40px;"
          />
          <div class="relative z-10 text-center">
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none" class="mx-auto mb-4 opacity-30">
              <rect x="10" y="10" width="60" height="60" rx="4" stroke="#6B6560" stroke-width="1" />
              <path d="M10 30 L40 10 L70 30 L70 70 L10 70 Z" stroke="#6B6560" stroke-width="1" fill="none" />
              <line x1="40" y1="10" x2="40" y2="70" stroke="#6B6560" stroke-width="0.5" />
              <line x1="25" y1="40" x2="55" y2="40" stroke="#6B6560" stroke-width="0.5" />
              <circle cx="40" cy="30" r="3" stroke="#6B6560" stroke-width="0.8" />
              <text x="40" y="65" text-anchor="middle" fill="#6B6560" font-size="6">MAP</text>
            </svg>
            <p class="text-sm text-ink-muted">地图生成器接口预留</p>
            <p class="text-xs text-ink-muted/60 mt-1">后续将接入地图生成功能</p>
          </div>
        </div>
      </CardWrapper>

      <!-- 右侧控制面板 -->
      <div class="space-y-4">
        <!-- 游戏日期（只读，由 dayCycle 系统管理） -->
        <CardWrapper class="p-5">
          <h4 class="text-sm text-ink-secondary tracking-wide mb-3">
            📅 游戏日期
            <span class="text-[10px] text-ink-muted ml-1">— 系统自动管理</span>
          </h4>
          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-xs text-ink-muted">年份</span>
              <span class="text-sm text-ink-primary font-medium">{{ dayCycle.year }} 年</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-xs text-ink-muted">月份</span>
              <span class="text-sm text-ink-primary font-medium">{{ dayCycle.month }} 月</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-xs text-ink-muted">日期</span>
              <span class="text-sm text-ink-primary font-medium">{{ dayCycle.day }} 日</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-xs text-ink-muted">季节</span>
              <span class="text-sm text-ink-primary font-medium">
                {{ currentSeasonIcon }} {{ dayCycle.seasonLabels[dayCycle.season] }}
              </span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-xs text-ink-muted">天数</span>
              <span class="text-sm text-ink-primary font-medium">第 {{ dayCycle.dayCount }} 天</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-xs text-ink-muted">今日事件</span>
              <span class="text-sm text-ink-primary font-medium">{{ dayCycle.eventsToday }} / {{ dayCycle.maxEventsPerDay }}</span>
            </div>
            <div class="mt-2 pt-3 border-t border-[#E8E2D8]">
              <p class="text-sm text-ink-primary text-center font-medium">
                {{ dayCycle.dateString }}
              </p>
              <p class="text-[10px] text-ink-muted/60 text-center mt-1">
                日期随游戏进程自动推进，不可手动设置
              </p>
            </div>
          </div>
        </CardWrapper>

        <!-- 地图图层 -->
        <CardWrapper class="p-5">
          <h4 class="text-sm text-ink-secondary tracking-wide mb-3">地图图层</h4>
          <div class="space-y-2">
            <label
              v-for="layer in mapStore.layers"
              :key="layer.id"
              class="flex items-center gap-3 p-2 rounded-lg hover:bg-[#F5F0E8] cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                :checked="layer.visible"
                class="accent-[#5A5550]"
                @change="mapStore.toggleLayer(layer.id)"
              />
              <span class="text-sm text-ink-primary">{{ layer.name }}</span>
            </label>
          </div>
        </CardWrapper>
      </div>
    </div>
  </div>
</template>
