import { defineStore } from 'pinia'
import { ref } from 'vue'

/** UI 状态管理 - 当前页面、侧边栏等界面状态 */
export const useUIStore = defineStore('ui', () => {
  const activePage = ref('home')
  const sidebarCollapsed = ref(false)
  const mobileMenuOpen = ref(false)

  function setPage(page) {
    activePage.value = page
    mobileMenuOpen.value = false
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  return { activePage, sidebarCollapsed, mobileMenuOpen, setPage, toggleSidebar }
})
