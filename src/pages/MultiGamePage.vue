<script setup>
import { ref, watch, onMounted, nextTick, computed } from 'vue'
import { useMultiplayer } from '../composables/useMultiplayer.js'
import CardWrapper from '../components/common/CardWrapper.vue'
import DiceIcon from '../components/common/DiceIcon.vue'

const multi = useMultiplayer()
const userInput = ref('')
const chatContainer = ref(null)
const chatMsgs = ref([])
const showSaves = ref(false)

// 队伍玩家（从 multi.players 读取）
const teamPlayers = computed(() => multi.players?.value || [])

// 当前回合信息
const turnInfo = computed(() => ({
  myTurn: multi.myTurn.value,
  currentName: multi.currentPlayerName.value,
  round: multi.room?.value?.round || 1
}))

// 监听新消息
let _count = 0
watch(() => multi.messages?.value?.length, (len) => {
  if (!len) return
  chatMsgs.value = [...multi.messages.value]
  _count = len
  nextTick(scrollToBottom)
})

function scrollToBottom() {
  if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
}

function sendMessage() {
  const t = userInput.value.trim()
  if (!t) return
  if (multi.myTurn.value) {
    multi.submitAction(t)
  } else {
    multi.sendChat(t)
  }
  // 本地回显
  chatMsgs.value.push({ role: 'user', content: t, playerName: '我', _local: true })
  userInput.value = ''
  nextTick(scrollToBottom)
}

function charColor(name) {
  let h = 0
  for (const c of name || '?') h = ((h << 5) - h) + c.charCodeAt(0)
  return `hsl(${Math.abs(h) % 360}, 25%, 50%)`
}

function parseCharData(p) {
  try { return typeof p.char_data === 'string' ? JSON.parse(p.char_data) : (p.char_data || {}) }
  catch { return {} }
}

onMounted(() => { chatMsgs.value = [...(multi.messages?.value || [])] })
</script>

<template>
  <div class="h-full flex flex-col" style="max-height: calc(100vh - 80px);">
    <!-- 回合指示横幅 -->
    <div class="text-center py-2.5 rounded-lg text-sm font-medium mb-3" :class="turnInfo.myTurn ? 'bg-amber-50 text-amber-700 border border-amber-300' : 'bg-gray-50 text-gray-400 border border-gray-200'">
      {{ turnInfo.myTurn ? '⚡ 轮到你行动了！' : `⏳ 等待 ${turnInfo.currentName || '其他玩家'} 行动...` }}
      <span class="ml-2 text-[10px] opacity-60">第 {{ turnInfo.round }} 回合</span>
      <span class="ml-auto flex gap-1">
        <button class="text-[10px] px-2 py-0.5 rounded border border-[#D8D2C8] hover:bg-[#F5F0E8]" @click="multi.saveGame('回合存档')">💾 存档</button>
        <button class="text-[10px] px-2 py-0.5 rounded border border-[#D8D2C8] hover:bg-[#F5F0E8]" @click="showSaves = !showSaves">📂 读档</button>
      </span>
    </div>

    <!-- 读档面板 -->
    <div v-if="showSaves" class="bg-white rounded-lg border border-[#E8E2D8] p-3 mb-3 text-xs">
      <p class="text-ink-muted mb-2">存档列表</p>
      <div v-if="!multi.saves?.value?.length" class="text-ink-muted/50">暂无存档</div>
      <div v-for="s in multi.saves?.value" :key="s.id" class="flex justify-between py-1 hover:bg-[#F5F0E8] px-1 rounded cursor-pointer" @click="multi.loadGame(s.id); showSaves = false">
        <span>{{ s.label }}</span><span class="text-ink-muted/50">{{ s.created_at }}</span>
      </div>
      <button class="text-[10px] text-ink-muted mt-1" @click="multi.listSaves()">刷新列表</button>
    </div>

    <div class="flex gap-4 flex-1 min-h-0">
      <!-- 左侧：队伍面板 -->
      <CardWrapper class="w-56 flex-shrink-0 p-4 overflow-y-auto space-y-3">
        <h4 class="text-xs text-ink-muted tracking-wide">队伍</h4>
        <div v-for="p in teamPlayers" :key="p.id" class="p-2 rounded-lg border" :class="multi.room?.value?.currentTurn === p.client_id ? 'border-amber-300 bg-amber-50' : 'border-[#E8E2D8]'">
          <div class="flex items-center gap-2 mb-1">
            <div class="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px]" :style="{ backgroundColor: charColor(p.name) }">{{ p.name?.charAt(0) }}</div>
            <div class="min-w-0">
              <p class="text-xs text-ink-primary font-medium truncate">{{ p.name }}</p>
              <p class="text-[9px] text-ink-muted">{{ parseCharData(p).race || '?' }} {{ parseCharData(p).class || '?' }}</p>
            </div>
            <span v-if="multi.room?.value?.currentTurn === p.client_id" class="text-[9px] text-amber-600">👈</span>
          </div>
          <div class="flex justify-between text-[9px] text-ink-muted">
            <span>HP {{ parseCharData(p).hp || '?' }}/{{ parseCharData(p).maxHp || '?' }}</span>
            <span v-if="p.is_host" class="text-amber-600">房主</span>
            <span v-if="!p.is_online" class="text-red-400">离线</span>
          </div>
        </div>
      </CardWrapper>

      <!-- 中间：聊天区 -->
      <CardWrapper class="flex-1 flex flex-col p-0 overflow-hidden min-h-0">
        <div ref="chatContainer" class="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          <div v-for="(m, i) in chatMsgs" :key="i" class="text-xs" :class="m.role === 'assistant' ? 'text-ink-secondary' : m.role === 'system' ? 'text-ink-muted/60 italic' : 'text-ink-primary'">
            <span v-if="m.playerName && m.role !== 'assistant'" class="font-medium text-ink-muted mr-1">{{ m.playerName }}:</span>
            <span class="whitespace-pre-wrap">{{ m.content }}</span>
            <span v-if="m._streaming" class="cursor-blink">▌</span>
          </div>
        </div>
        <!-- 输入 -->
        <div class="px-4 py-3 border-t border-[#E8E2D8] flex gap-2">
          <input v-model="userInput" class="input-parchment flex-1 text-sm"
            :placeholder="turnInfo.myTurn ? '输入你的行动...' : '等待轮到你...'"
            :disabled="!turnInfo.myTurn"
            @keyup.enter="sendMessage" />
          <button class="btn-primary text-sm" :disabled="!turnInfo.myTurn || !userInput.trim()" @click="sendMessage">发送</button>
        </div>
      </CardWrapper>
    </div>
  </div>
</template>
