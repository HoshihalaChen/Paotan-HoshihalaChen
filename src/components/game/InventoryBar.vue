<script setup>
import { ref, onMounted, watch } from 'vue'
import { loadInventory, addItem, removeItem, clearInventory, CATEGORIES } from '../../services/inventory.js'
import CardWrapper from '../common/CardWrapper.vue'

const props = defineProps({
  sessionId: { type: Number, default: null },
  characterId: { type: Number, default: null },
})

const emit = defineEmits(['refresh'])

const items = ref([])
const collapsed = ref(true)
const showAddForm = ref(false)
const newItem = ref({ name: '', qty: 1, desc: '' })
const errorMsg = ref('')

const totalCount = computed(() => items.value.reduce((s, i) => s + i.qty, 0))
const byCategory = computed(() => {
  const map = {}
  for (const item of items.value) {
    if (!map[item.category]) map[item.category] = { count: 0, icon: CATEGORIES[item.category]?.icon || '' }
    map[item.category].count += item.qty
  }
  return map
})

async function refresh() {
  if (!props.sessionId || !props.characterId) return
  items.value = await loadInventory(props.sessionId, props.characterId)
}

onMounted(refresh)
watch(() => props.characterId, refresh)
watch(() => props.sessionId, refresh)

async function doAdd() {
  errorMsg.value = ''
  if (!newItem.value.name.trim()) { errorMsg.value = '请输入物品名称'; return }
  if (newItem.value.qty < 1) { errorMsg.value = '数量至少为1'; return }
  await addItem(props.sessionId, props.characterId, newItem.value.name.trim(), newItem.value.qty, newItem.value.desc.trim())
  newItem.value = { name: '', qty: 1, desc: '' }
  showAddForm.value = false
  await refresh()
  emit('refresh')
}

async function doRemove(name) {
  await removeItem(props.sessionId, props.characterId, name, 1)
  await refresh()
  emit('refresh')
}

async function doRemoveAll(name) {
  await removeItem(props.sessionId, props.characterId, name, 999)
  await refresh()
  emit('refresh')
}

// 暴露 refresh 给父组件
defineExpose({ refresh })
</script>

<script>
import { computed } from 'vue'
</script>

<template>
  <div class="border-t border-[#E8E2D8] bg-[#FAF7F2]/80">
    <!-- 折叠头部 -->
    <div
      class="flex items-center justify-between px-4 py-2 cursor-pointer select-none hover:bg-[#F5F0E8] transition-colors"
      @click="collapsed = !collapsed"
    >
      <div class="flex items-center gap-2 text-xs text-ink-secondary">
        <span class="text-sm">{{ collapsed ? '▶' : '▼' }}</span>
        <span>🎒 背包</span>
        <span class="text-ink-muted">({{ totalCount }}件)</span>
        <span v-if="Object.keys(byCategory).length" class="flex gap-1 ml-2">
          <span v-for="(cat, key) in byCategory" :key="key" class="text-[10px] opacity-60">{{ cat.icon }}{{ cat.count }}</span>
        </span>
      </div>
      <div class="flex gap-2">
        <button
          v-if="!collapsed"
          class="text-[10px] text-ink-muted hover:text-ink-primary px-1.5 py-0.5 rounded border border-[#D8D2C8]"
          @click.stop="showAddForm = !showAddForm"
        >+ 添加</button>
      </div>
    </div>

    <!-- 展开内容 -->
    <div v-if="!collapsed" class="px-4 pb-3 space-y-2 fade-in">
      <!-- 添加表单 -->
      <div v-if="showAddForm" class="flex gap-2 items-end bg-white rounded-lg p-2 border border-[#E8E2D8]">
        <div class="flex-1">
          <input v-model="newItem.name" class="input-parchment w-full text-xs" placeholder="物品名称" @keyup.enter="doAdd" />
        </div>
        <input v-model.number="newItem.qty" type="number" min="1" class="input-parchment w-14 text-xs text-center" />
        <button class="btn-primary text-xs py-1 px-2" @click="doAdd">添加</button>
      </div>
      <p v-if="errorMsg" class="text-[10px] text-red-500">{{ errorMsg }}</p>

      <!-- 物品网格 -->
      <div v-if="items.length" class="grid grid-cols-6 gap-1.5">
        <div
          v-for="item in items"
          :key="item.id"
          class="group relative bg-white rounded-lg border border-[#E8E2D8] p-1.5 text-center hover:border-[#C5C0BA] transition-colors"
          :title="item.desc || item.name"
        >
          <div class="text-lg leading-none mb-0.5">{{ item.icon }}</div>
          <p class="text-[9px] text-ink-primary truncate leading-tight">{{ item.name }}</p>
          <span v-if="item.qty > 1" class="absolute top-0.5 right-0.5 text-[8px] bg-[#5A5550] text-white rounded-full w-4 h-4 flex items-center justify-center">{{ item.qty }}</span>
          <!-- 悬停操作 -->
          <div class="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
            <button class="w-4 h-4 rounded-full bg-red-400 text-white text-[8px] flex items-center justify-center" @click.stop="doRemove(item.name)" title="-1">−</button>
            <button v-if="item.qty > 1" class="w-4 h-4 rounded-full bg-red-600 text-white text-[8px] flex items-center justify-center" @click.stop="doRemoveAll(item.name)" title="全部删除">✕</button>
          </div>
        </div>
      </div>
      <p v-else class="text-xs text-ink-muted text-center py-2">背包为空 — AI 给出的物品将自动记录</p>
    </div>
  </div>
</template>
