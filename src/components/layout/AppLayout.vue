<script setup>
import AppSidebar from './AppSidebar.vue'
</script>

<template>
  <div class="flex h-full w-full">
    <AppSidebar />
    <main class="flex-1 ml-[220px] h-full overflow-y-auto parchment-texture">
      <div class="p-6 min-h-full fade-in">
        <slot></slot>
      </div>
    </main>
  </div>
</template>
