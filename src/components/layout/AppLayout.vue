<script setup>
import AppSidebar from './AppSidebar.vue'
</script>

<template>
  <div class="flex h-full w-full overflow-hidden">
    <AppSidebar />
    <main class="flex-1 md:ml-[220px] ml-0 h-full overflow-y-auto parchment-texture transition-[margin] duration-300">
      <div class="p-3 md:p-6 pt-14 md:pt-6 min-h-full fade-in">
        <slot></slot>
      </div>
    </main>
  </div>
</template>
