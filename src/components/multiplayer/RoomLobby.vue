<script setup>
import { ref, onMounted } from 'vue'
import { useMultiplayer } from '../../composables/useMultiplayer.js'
import { useModuleContextStore } from '../../stores/moduleContext.js'
import { useUIStore } from '../../stores/ui.js'
import CardWrapper from '../common/CardWrapper.vue'

const emit = defineEmits(['start', 'close'])
const props = defineProps({
  module: { type: Object, default: null }  // 可选：从模组创建房间
})

const multi = useMultiplayer()
const moduleCtx = useModuleContextStore()
const ui = useUIStore()

const playerName = ref('玩家' + Math.floor(Math.random() * 100))
const joinCode = ref('')
const isHost = ref(false)
const errorMsg = ref('')
const connected = ref(false)
const stage = ref('connect')  // 'connect' | 'lobby'

// 角色创建
const charCreated = ref(false)
const charForm = ref({ name: '', race: '人类', class: '战士', level: 1, str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, hp: 10, maxHp: 10 })
const races = ref(['人类', '精灵', '矮人', '半精灵', '半兽人', '龙裔'])
const classes = ref(['战士', '法师', '游侠', '游荡者', '牧师', '野蛮人'])

onMounted(async () => {
  try {
    await multi.connect(playerName.value)
    connected.value = true

    // 如果传入模组则直接创建，否则进入大厅让用户选择
    if (props.module) {
      multi.createRoom(props.module.id || '', props.module.name || '')
    } else {
      // 等待用户操作
    }
  } catch {
    errorMsg.value = '无法连接服务器，请确认服务器已启动'
  }
})

// 监听房间创建/加入——房间信息到达后自动进入大厅
watch(() => multi.room?.value, (r) => {
  if (r) {
    stage.value = 'lobby'
    // isHost 由创建/加入方法设置
  }
})

async function doCreate() {
  isHost.value = true
  multi.createRoom(props.module?.id || '', props.module?.name || '')
}

async function doJoin() {
  if (!joinCode.value.trim()) return
  errorMsg.value = ''
  isHost.value = false
  multi.joinRoom(joinCode.value.trim().toUpperCase())
  // 等待 2s 让 WebSocket 消息到达
  await new Promise(r => setTimeout(r, 2000))
  if (!multi.room?.value && !multi.error.value) {
    errorMsg.value = '加入超时，请检查邀请码或服务器连接'
  } else if (multi.error.value) {
    errorMsg.value = multi.error.value
  }
}

function createCharacter() {
  const c = charForm.value
  if (!c.name.trim()) { errorMsg.value = '请输入角色名'; return }
  c.hp = 10; c.maxHp = 10
  multi.send({ type: 'SET_CHARACTER', charData: { ...c } })
  charCreated.value = true
  errorMsg.value = ''
}

function startGame() {
  // 检查是否所有玩家都有角色
  const allHaveChar = multi.players?.value?.every(p => p.char_data && p.char_data !== '{}')
  if (!allHaveChar) { errorMsg.value = '等待所有玩家创建角色'; return }
  multi.send({ type: 'GAME_START' })
  emit('start', { room: multi.room.value, players: multi.players.value })
}

function copyCode() {
  if (multi.room?.value?.code) {
    navigator.clipboard.writeText(multi.room.value.code)
  }
}

function charColor(name) {
  let hash = 0
  for (const c of name || '?') hash = ((hash << 5) - hash) + c.charCodeAt(0)
  return `hsl(${Math.abs(hash) % 360}, 25%, 50%)`
}
</script>

<script>
import { watch } from 'vue'
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" @click.self="emit('close')">
      <CardWrapper class="w-[480px] max-h-[85vh] overflow-y-auto p-6">
        <!-- 标题 -->
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg text-ink-primary">🎲 多人模式</h3>
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full" :class="connected ? 'bg-green-500' : 'bg-red-400'" />
            <span class="text-[10px] text-ink-muted">{{ connected ? '已连接' : '未连接' }}</span>
            <button class="btn-ghost text-xs" @click="emit('close')">✕</button>
          </div>
        </div>

        <!-- 错误提示 -->
        <div v-if="errorMsg" class="bg-red-50 text-red-500 text-xs p-2 rounded mb-3">{{ errorMsg }}</div>

        <!-- 阶段 1: 连接 + 创建/加入 -->
        <div v-if="stage === 'connect'" class="space-y-4">
          <!-- 名称输入 -->
          <div>
            <label class="text-xs text-ink-muted mb-1 block">你的名字</label>
            <input v-model="playerName" class="input-parchment w-full text-sm" placeholder="输入名字" maxlength="12" />
          </div>

          <!-- 创建房间 -->
          <div class="bg-[#F5F0E8] rounded-lg p-4 space-y-2">
            <p class="text-sm text-ink-primary font-medium">创建新房间</p>
            <p class="text-[10px] text-ink-muted">作为房主创建房间，邀请朋友加入</p>
            <button class="btn-primary text-sm w-full" :disabled="!playerName.trim()" @click="doCreate">创建房间</button>
          </div>

          <!-- 加入房间 -->
          <div class="bg-[#F5F0E8] rounded-lg p-4 space-y-2">
            <p class="text-sm text-ink-primary font-medium">加入已有房间</p>
            <p class="text-[10px] text-ink-muted">输入房主分享的 6 位邀请码</p>
            <div class="flex gap-2">
              <input v-model="joinCode" class="input-parchment flex-1 text-sm uppercase" placeholder="邀请码" maxlength="6" @keyup.enter="doJoin" />
              <button class="btn-primary text-sm" :disabled="joinCode.length !== 6" @click="doJoin">加入</button>
            </div>
          </div>
        </div>

        <!-- 阶段 2: 房间大厅 -->
        <div v-if="stage === 'lobby'" class="space-y-4">
          <!-- 房间信息 -->
          <div class="bg-[#F5F0E8] rounded-lg p-4 text-center space-y-2">
            <p class="text-xs text-ink-muted">邀请码</p>
            <p class="text-2xl text-ink-primary font-bold tracking-widest cursor-pointer select-all" @click="copyCode">{{ multi.room?.value?.code || '——' }}</p>
            <p class="text-[9px] text-ink-muted">点击复制 | 分享给朋友加入</p>
          </div>

          <!-- 玩家列表 -->
          <div>
            <p class="text-xs text-ink-muted mb-2">房间玩家 ({{ multi.players?.value?.length || 0 }}/5)</p>
            <div class="space-y-1.5">
              <div
                v-for="p in multi.players?.value"
                :key="p.id"
                class="flex items-center gap-3 p-2 rounded-lg border border-[#E8E2D8]"
              >
                <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs" :style="{ backgroundColor: charColor(p.name) }">{{ p.name?.charAt(0) }}</div>
                <div class="flex-1">
                  <span class="text-sm text-ink-primary">{{ p.name }}</span>
                  <span v-if="p.is_host" class="text-[9px] ml-1 bg-amber-100 text-amber-700 px-1 rounded">房主</span>
                  <span v-if="!p.is_online" class="text-[9px] ml-1 text-red-400">离线</span>
                  <span v-if="p.char_data && p.char_data !== '{}'" class="text-[9px] ml-1 text-[#5A7A5A]">✓ 角色已就绪</span>
                  <span v-else class="text-[9px] ml-1 text-ink-muted/50">未选择角色</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 角色创建 -->
          <div v-if="!charCreated" class="bg-[#F5F0E8] rounded-lg p-4 space-y-3">
            <p class="text-sm text-ink-primary font-medium">创建你的角色</p>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[10px] text-ink-muted">名称</label>
                <input v-model="charForm.name" class="input-parchment w-full text-xs" placeholder="角色名" maxlength="12" />
              </div>
              <div>
                <label class="text-[10px] text-ink-muted">种族</label>
                <select v-model="charForm.race" class="input-parchment w-full text-xs">
                  <option v-for="r in races" :key="r" :value="r">{{ r }}</option>
                </select>
              </div>
              <div>
                <label class="text-[10px] text-ink-muted">职业</label>
                <select v-model="charForm.class" class="input-parchment w-full text-xs">
                  <option v-for="c in classes" :key="c" :value="c">{{ c }}</option>
                </select>
              </div>
              <div>
                <label class="text-[10px] text-ink-muted">等级</label>
                <input v-model.number="charForm.level" type="number" min="1" max="20" class="input-parchment w-full text-xs" />
              </div>
            </div>
            <button class="btn-primary text-sm w-full" @click="createCharacter">确认角色</button>
          </div>
          <div v-if="charCreated" class="text-xs text-[#5A7A5A] text-center bg-[#5A7A5A]/5 rounded-lg p-3">
            ✅ 角色「{{ charForm.name }}」已就绪，等待其他玩家
          </div>

          <!-- 开始游戏 -->
          <button
            v-if="isHost"
            class="btn-primary text-sm w-full py-2.5 tracking-wider"
            :disabled="(multi.players?.value?.length || 0) < 2"
            @click="startGame"
          >
            {{ (multi.players?.value?.length || 0) < 2 ? `等待更多玩家 (最少2人)` : '开始游戏' }}
          </button>
          <p v-else class="text-xs text-ink-muted text-center">等待房主开始游戏...</p>
        </div>
      </CardWrapper>
    </div>
  </Teleport>
</template>
