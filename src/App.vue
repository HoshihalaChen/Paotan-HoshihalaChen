<script setup>
import { onErrorCaptured, ref, onMounted } from 'vue'
import { useUIStore } from './stores/ui.js'
import { initDB } from './db/index.js'
import AppLayout from './components/layout/AppLayout.vue'
import HomePage from './pages/HomePage.vue'
import GamePage from './pages/GamePage.vue'
import CharacterPage from './pages/CharacterPage.vue'
import MapPage from './pages/MapPage.vue'
import WorldPage from './pages/WorldPage.vue'
import LogPage from './pages/LogPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import ArchivePage from './pages/ArchivePage.vue'

const ui = useUIStore()

// 全局应用状态 — 不阻塞渲染，后台初始化
const appReady = ref(true)
const dbStatus = ref('')

// 全局错误捕获
const globalError = ref(null)
onErrorCaptured((err, instance, info) => {
  console.error('[App Error]', err, info)
  globalError.value = `页面错误: ${err.message || err}`
  return false
})

// 后台初始化数据库
onMounted(async () => {
  try {
    await initDB()
    dbStatus.value = 'ok'
  } catch (e) {
    console.warn('[App] DB 后台初始化失败:', e.message)
    dbStatus.value = 'error'
  }
})
</script>

<template>
  <!-- 全局错误提示 -->
  <div v-if="globalError" class="fixed top-0 left-0 right-0 z-[999] bg-red-100 border-b border-red-300 px-4 py-3">
    <div class="flex items-center justify-between max-w-5xl mx-auto">
      <p class="text-sm text-red-600">{{ globalError }}</p>
      <button class="text-xs text-red-500 hover:text-red-700 underline" @click="globalError = null">关闭</button>
    </div>
  </div>

  <AppLayout>
    <HomePage v-if="ui.activePage === 'home'" />
    <GamePage v-else-if="ui.activePage === 'game'" />
    <CharacterPage v-else-if="ui.activePage === 'character'" />
    <MapPage v-else-if="ui.activePage === 'map'" />
    <WorldPage v-else-if="ui.activePage === 'world'" />
    <LogPage v-else-if="ui.activePage === 'log'" />
    <SettingsPage v-else-if="ui.activePage === 'settings'" />
    <ArchivePage v-else-if="ui.activePage === 'archive'" />
  </AppLayout>
</template>
