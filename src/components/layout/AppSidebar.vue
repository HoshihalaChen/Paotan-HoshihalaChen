<script setup>
import CompassLogo from '../common/CompassLogo.vue'
import { useUIStore } from '../../stores/ui.js'
import { useSessionStore } from '../../stores/session.js'
import { useCharacterStore } from '../../stores/character.js'
import { useModuleContextStore } from '../../stores/moduleContext.js'
import { useDayCycleStore } from '../../stores/dayCycle.js'
import { createArchive } from '../../services/archive.js'

const ui = useUIStore()
const sessionStore = useSessionStore()
const characterStore = useCharacterStore()
const moduleCtxStore = useModuleContextStore()
const dayCycle = useDayCycleStore()

// 导航菜单项定义
const navItems = [
  { key: 'home', label: '主页', icon: '◇' },
  { key: 'game', label: '游戏', icon: '◆' },
  { key: 'character', label: '角色', icon: '◇' },
  { key: 'map', label: '地图', icon: '◇' },
  { key: 'world', label: '图鉴', icon: '◇' },
  { key: 'log', label: '日志', icon: '◇' },
  { key: 'archive', label: '存档', icon: '◇' },
  { key: 'settings', label: '设置', icon: '◇' },
]

/** 切换页面，若从游戏页离开则自动存档 */
async function navigateTo(key) {
  // 如果当前在游戏页面且游戏激活，自动存档
  if (ui.activePage === 'game' && sessionStore.isGameActive) {
    try {
      await createArchive(sessionStore.currentSessionId, characterStore.currentCharacterId, {
        moduleName: moduleCtxStore.moduleName,
        characterName: characterStore.currentCharacter?.name || '',
        dayCount: dayCycle.dayCount
      })
    } catch (e) { /* 静默 */ }
  }
  ui.setPage(key)
}
</script>

<template>
  <aside
    class="fixed left-0 top-0 h-full w-[220px] bg-sidebar-bg flex flex-col select-none z-50"
    style="box-shadow: 1px 0 0 rgba(0,0,0,0.08);"
  >
    <!-- Logo 区域 -->
    <div class="flex items-center gap-3 px-5 py-6 border-b border-[#4A4A4C]/50">
      <CompassLogo />
      <div>
        <h1 class="text-sm text-sidebar-textActive tracking-widest font-normal">跑团助手</h1>
        <p class="text-[10px] text-sidebar-text/60 tracking-wide">TRPG Manager</p>
      </div>
    </div>

    <!-- 导航菜单 -->
    <nav class="flex-1 py-4 flex flex-col gap-1">
      <button
        v-for="item in navItems"
        :key="item.key"
        class="nav-item"
        :class="{ active: ui.activePage === item.key }"
        @click="navigateTo(item.key)"
      >
        <span class="text-xs w-5 text-center opacity-50">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <!-- 底部信息 -->
    <div class="px-5 py-4 border-t border-[#4A4A4C]/50">
      <p class="text-[10px] text-sidebar-text/40 tracking-wide">v1.0 · DND 5E</p>
    </div>
  </aside>
</template>
