<script setup>
// 游戏页面 - 左侧聊天窗口 + 右侧 d20 骰子面板 & 属性快捷检定
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useSessionStore } from '../stores/session.js'
import { useCharacterStore } from '../stores/character.js'
import { useChatStore } from '../stores/chat.js'
import { useWorldStore } from '../stores/world.js'
import { useUIStore } from '../stores/ui.js'
import { useModuleContextStore } from '../stores/moduleContext.js'
import { useDice } from '../composables/useDice.js'
import { useStreaming } from '../composables/useStreaming.js'
import { useExport } from '../composables/useExport.js'
import { performUnifiedCheck, performDeclinedCheck, formatCheckResult, logCheckResult, DIFFICULTY } from '../services/check.js'
import { createArchive } from '../services/archive.js'
import { useDayCycleStore } from '../stores/dayCycle.js'
import { useBackup } from '../composables/useBackup.js'
import CardWrapper from '../components/common/CardWrapper.vue'
import DiceIcon from '../components/common/DiceIcon.vue'
import ProgressBar from '../components/common/ProgressBar.vue'
import DiceStatsChart from '../components/visualization/DiceStatsChart.vue'
import StatusRadar from '../components/visualization/StatusRadar.vue'
import TimelineChart from '../components/visualization/TimelineChart.vue'
import CombatStats from '../components/visualization/CombatStats.vue'
import ExportDialog from '../components/export/ExportDialog.vue'
import ChoiceButtons from '../components/chat/ChoiceButtons.vue'
import { formatTime } from '../utils/format.js'
import { statLabels } from '../utils/format.js'

const sessionStore = useSessionStore()
const characterStore = useCharacterStore()
const chatStore = useChatStore()
const worldStore = useWorldStore()
const moduleCtxStore = useModuleContextStore()
const { lastResult, isRolling, diceHistory, roll, abilityCheck } = useDice()
const { isStreaming: aiStreaming, streamContent: aiContent, error: aiError, startStream, cancelStream } = useStreaming()
const { exportChat, isExporting } = useExport()
const dayCycle = useDayCycleStore()
const backup = useBackup()

// 战斗面板
const showCombat = ref(false)
const enemies = ref([])

// 自动存档通知
const autoSaveNotice = ref('')

// 重置确认
const showResetConfirm = ref(false)

// 用户消息输入
const userInput = ref('')
const chatContainer = ref(null)
const showDiceHistory = ref(false)
const showScrollBtn = ref(false)

// 当前选中的快捷检定角色
const selectedCharId = ref(null)

// 可视化面板
const showStats = ref(false)
const showExport = ref(false)
const vizRefreshKey = ref(0)

// 骰子面板 tab
const diceTab = ref('d20') // 'd20' | 'custom' | 'history'

// 标记游戏是否已在该会话中初始化过日期
const dateInitialized = ref(false)

onMounted(async () => {
  if (sessionStore.currentSessionId) {
    await chatStore.loadMessages(sessionStore.currentSessionId)
    await characterStore.loadCharacters(sessionStore.currentSessionId)
    await worldStore.loadWorldData(sessionStore.currentSessionId)

    // 仅首次挂载时初始化日期（从已有消息中恢复，不再重新随机）
    if (!dateInitialized.value && dayCycle.dayCount === 0 && chatStore.messages.length === 0) {
      dayCycle.randomizeStartDate()
      const dateMsg = `📅 **冒险开始** — ${dayCycle.dateString.value}\n天空中的星辰预示着一段传奇的序幕。`
      await chatStore.addMessage({
        sessionId: sessionStore.currentSessionId,
        role: 'system',
        content: dateMsg,
        type: 'system'
      })
    }
    dateInitialized.value = true
  }
})

// 监听消息变化，自动滚动
watch(() => chatStore.messages.length, async () => {
  await nextTick()
  scrollToBottom()
})

watch(aiContent, async () => {
  await nextTick()
  scrollToBottom()
})

function scrollToBottom() {
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    showScrollBtn.value = false
  }
}

/** 监听滚动，距底部超过200px则显示回底按钮 */
function onChatScroll() {
  if (!chatContainer.value) return
  const el = chatContainer.value
  showScrollBtn.value = (el.scrollHeight - el.scrollTop - el.clientHeight) > 200
}

/**
 * 记录一个完整游戏事件（触发→过程→判定）
 * 在每个 AI 回复后调用
 */
async function recordGameEvent() {
  // 标记事件
  backup.markEvent()
  const dayChanged = dayCycle.recordEvent()

  if (dayChanged) {
    // 天数+1，注入日期提示
    const dateMsg = dayCycle.buildDateAnnouncement()
    await chatStore.addMessage({
      sessionId: sessionStore.currentSessionId,
      role: 'system',
      content: dateMsg,
      type: 'system'
    })

    // 自动存档
    try {
      await createArchive(sessionStore.currentSessionId, selectedCharId.value || characterStore.currentCharacterId, {
        moduleName: moduleCtxStore.moduleName,
        characterName: characterStore.currentCharacter?.name || '',
        dayCount: dayCycle.dayCount
      })
      autoSaveNotice.value = `📥 自动存档完成 — 第${dayCycle.dayCount}天`
      setTimeout(() => { autoSaveNotice.value = '' }, 3000)
    } catch (e) { console.error('[AutoSave] 失败:', e) }
  }

  // 尝试自动备份
  const sid = sessionStore.currentSessionId
  const sname = sessionStore.currentSession?.name
  const cnames = characterStore.characters.map(c => c.name)
  const snapshot = dayCycle.getSnapshot()
  await backup.tryAutoBackup(sid, sname, cnames, snapshot)
}

/** 结束当前游戏 */
async function endGame() {
  if (sessionStore.currentSessionId) {
    await sessionStore.resetGame(sessionStore.currentSessionId)
    moduleCtxStore.unbindModule()
    chatStore.messages = []
  }
  showResetConfirm.value = false
}

/** 返回主页（提示存档） */
async function goHome() {
  if (sessionStore.isGameActive) {
    await createArchive(sessionStore.currentSessionId, characterStore.currentCharacterId, {
      moduleName: moduleCtxStore.moduleName,
      characterName: characterStore.currentCharacter?.name || '',
      dayCount: dayCycle.dayCount
    })
  }
  useUIStore().setPage('home')
}

/** 获取最后一条 AI 消息文本（用于选项按钮解析） */
const lastAssistantMessage = computed(() => {
  const msgs = chatStore.messages
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant') return msgs[i].content
  }
  return ''
})

/** 点击选项按钮 — 把选项文本当作玩家消息发送 */
async function handleChoiceSelect(choiceText) {
  if (!sessionStore.currentSessionId || aiStreaming.value || chatStore.isStreaming) return

  await chatStore.addMessage({
    sessionId: sessionStore.currentSessionId,
    characterId: selectedCharId.value,
    role: 'user',
    content: choiceText,
    type: 'chat'
  })

  // 调用 AI
  const moduleContextText = moduleCtxStore.buildModuleContextText()
  await startStream({
    messages: chatStore.messages.slice(0, -1),
    session: sessionStore.currentSession,
    characters: characterStore.characters,
    worldEntries: worldStore.entries,
    summary: null,
    userMessage: choiceText,
    moduleContextText
  })

  // 保存 AI 回复
  if (aiContent.value.trim()) {
    await chatStore.addMessage({
      sessionId: sessionStore.currentSessionId,
      role: 'assistant',
      content: aiContent.value,
      type: 'chat'
    })
    // 记录事件 + 自动备份
    await recordGameEvent()
  }
}

/**
 * 从最后一条 AI 消息中解析检定请求
 * 返回 { checkType, difficulty, dc } 或 null
 */
function parseCheckRequest() {
  const lastMsg = lastAssistantMessage.value
  if (!lastMsg) return null
  // 匹配: ⚡ 检定请求：敏捷(潜行) | 难度：中等 (DC 13) | 成功：xxx | 失败：xxx
  const match = lastMsg.match(/检定请求[：:]\s*(.+?)\s*\|.*?难度[：:]\s*(.+?)\s*\(?DC\s*(\d+)\)?/i)
  if (!match) {
    // 尝试匹配简化格式: DC 13 的敏捷(隐匿)检定
    const simpleMatch = lastMsg.match(/DC\s*(\d+).*?([一-龥]+)\s*\(?(\w+)?\)?\s*检定/)
    if (simpleMatch) {
      const dc = parseInt(simpleMatch[1])
      const skillName = simpleMatch[3] || simpleMatch[2]
      return { checkType: skillName, difficulty: dcToDifficulty(dc), dc }
    }
    return null
  }
  const checkDesc = match[1].trim()
  const difficultyName = match[2].trim()
  const dc = parseInt(match[3])

  // 从描述中提取检定类型
  const parenMatch = checkDesc.match(/\((\w+)\)/)
  let checkType = parenMatch ? parenMatch[1] : checkDesc
  // 中文技能名映射
  const cnMap = { '潜行': 'stealth', '隐匿': 'stealth', '察觉': 'perception', '侦查': 'perception',
    '运动': 'athletics', '攀爬': 'climb', '游泳': 'swim', '奥秘': 'arcana', '调查': 'investigation',
    '说服': 'persuasion', '欺瞒': 'deception', '威吓': 'intimidation', '表演': 'performance',
    '巧手': 'sleight', '杂技': 'acrobatics', '生存': 'survival', '医药': 'medicine',
    '洞察': 'insight', '知识': 'knowledge', '历史': 'history' }
  checkType = cnMap[checkType] || checkType.toLowerCase()

  return { checkType, difficulty: normalizeDifficulty(difficultyName), dc }
}

function dcToDifficulty(dc) {
  if (dc <= 5) return 'trivial'; if (dc <= 10) return 'easy'; if (dc <= 13) return 'medium'
  if (dc <= 16) return 'hard'; if (dc <= 19) return 'veryHard'; if (dc <= 22) return 'nearlyImpossible'
  return 'legendary'
}

function normalizeDifficulty(name) {
  const map = { '极简单': 'trivial', '简单': 'easy', '中等': 'medium', '普通': 'medium',
    '困难': 'hard', '极难': 'veryHard', '近乎不可能': 'nearlyImpossible', '传奇': 'legendary' }
  // 尝试英文匹配
  for (const [key, val] of Object.entries(map)) { if (name.includes(key) || name.includes(val)) return val }
  // 尝试 DIFFICULTY keys
  for (const key of Object.keys(DIFFICULTY)) { if (name.toLowerCase().includes(key)) return key }
  return 'medium'
}

/** 发送消息 */
async function sendMessage() {
  const text = userInput.value.trim()
  if (!text || !sessionStore.currentSessionId || chatStore.isStreaming || aiStreaming.value) return
  userInput.value = ''

  // ===== 检定指令: .yes 或 .no =====
  if (text === '.yes' || text === '.no') {
    const char = selectedCharId.value
      ? characterStore.characters.find(c => c.id === selectedCharId.value)
      : characterStore.characters[0]

    if (text === '.no') {
      const result = performDeclinedCheck()
      await logCheckResult(sessionStore.currentSessionId, selectedCharId.value, result)
      const msg = formatCheckResult(result)
      await chatStore.addMessage({ sessionId: sessionStore.currentSessionId, characterId: selectedCharId.value, role: 'dice', content: msg, type: 'dice' })
    } else if (text === '.yes' && char) {
      const checkRequest = parseCheckRequest()
      if (checkRequest) {
        const result = performUnifiedCheck(char, checkRequest.checkType, checkRequest.difficulty)
        await logCheckResult(sessionStore.currentSessionId, selectedCharId.value, result)
        const msg = formatCheckResult(result)
        await chatStore.addMessage({ sessionId: sessionStore.currentSessionId, characterId: selectedCharId.value, role: 'dice', content: msg, type: 'dice' })
      } else {
        // 无明确检定请求时，做普通d20检定
        const result = performUnifiedCheck(char, 'perception', 'medium')
        await logCheckResult(sessionStore.currentSessionId, selectedCharId.value, result)
        const msg = formatCheckResult(result)
        await chatStore.addMessage({ sessionId: sessionStore.currentSessionId, characterId: selectedCharId.value, role: 'dice', content: msg, type: 'dice' })
      }
    } else if (text === '.yes' && !char) {
      await chatStore.addMessage({ sessionId: sessionStore.currentSessionId, role: 'system', content: '⚠️ 请先在右侧选择一个角色再进行检定。', type: 'system' })
    }
    return
  }

  // 检测骰子指令: .d20, .2d6+3 等
  if (text.startsWith('.')) {
    const expr = text.slice(1)
    const result = await roll(expr, sessionStore.currentSessionId, selectedCharId.value)
    if (result) {
      await chatStore.addMessage({
        sessionId: sessionStore.currentSessionId,
        characterId: selectedCharId.value,
        role: 'dice',
        content: result.detail,
        type: 'dice'
      })
    }
    return
  }

  // 添加用户消息
  await chatStore.addMessage({
    sessionId: sessionStore.currentSessionId,
    characterId: selectedCharId.value,
    role: 'user',
    content: text,
    type: 'chat'
  })

  // 调用 AI 流式回复
  const session = sessionStore.currentSession
  const characters = characterStore.characters
  const worldEntries = worldStore.entries

  // 构建模组隔离上下文
  const moduleContextText = moduleCtxStore.buildModuleContextText()

  await startStream({
    messages: chatStore.messages.slice(0, -1), // 排除刚添加的用户消息
    session,
    characters,
    worldEntries,
    summary: null,
    userMessage: text,
    moduleContextText
  })

  // 保存 AI 回复
  if (aiContent.value.trim()) {
    await chatStore.addMessage({
      sessionId: sessionStore.currentSessionId,
      role: 'assistant',
      content: aiContent.value,
      type: 'chat'
    })
    // 记录事件 + 自动备份
    await recordGameEvent()
  }
}

/** 快捷属性检定 */
async function quickCheck(statName, statValue) {
  if (!sessionStore.currentSessionId) return
  const result = await abilityCheck(statName, statValue, sessionStore.currentSessionId, selectedCharId.value)
  if (result) {
    await chatStore.addMessage({
      sessionId: sessionStore.currentSessionId,
      characterId: selectedCharId.value,
      role: 'dice',
      content: `${result.label}: ${result.detail}`,
      type: 'dice'
    })
  }
}

// 获取角色名
function getCharName(id) {
  return characterStore.characters.find(c => c.id === id)?.name || '未知'
}

// 消息角色标签样式
function roleLabel(role) {
  const map = { user: '玩家', assistant: 'DM', system: '系统', dice: '骰子' }
  return map[role] || role
}
</script>

<template>
  <div class="space-y-4">
    <!-- 自动存档通知 -->
    <Transition name="fade">
      <div v-if="autoSaveNotice" class="text-center">
        <p class="text-[11px] text-ink-muted/50 italic">{{ autoSaveNotice }}</p>
      </div>
    </Transition>

    <!-- 顶部工具栏 -->
    <div class="flex justify-between items-center">
      <span class="text-xs text-ink-muted">
        今日事件: {{ dayCycle.eventsToday.value }}/{{ dayCycle.maxEventsPerDay }}
      </span>
      <div class="flex gap-2">
        <button class="btn-ghost text-xs" @click="showCombat = !showCombat">
          {{ showCombat ? '隐藏' : '⚔️' }} 战斗面板
        </button>
        <button class="btn-ghost text-xs" @click="showStats = !showStats">
          {{ showStats ? '隐藏' : '显示' }}数据统计
        </button>
        <button class="btn-ghost text-xs" @click="showExport = true">
          导出记录
        </button>
        <button class="btn-ghost text-xs" @click="vizRefreshKey++">
          刷新图表
        </button>
      </div>
    </div>

    <!-- 战斗属性面板 -->
    <CombatStats
      :characters="characterStore.characters"
      :enemies="enemies"
      :visible="showCombat"
      @close="showCombat = false"
      @update:enemies="enemies = $event"
    />

  <div class="flex gap-4" style="min-height: calc(100vh - 180px); max-height: calc(100vh - 150px);">
    <!-- ===== 左侧：聊天窗口 ===== -->
    <CardWrapper class="flex-1 flex flex-col p-0 overflow-hidden">
      <!-- 聊天头部 -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-[#E8E2D8]">
        <div class="flex items-center gap-3">
          <DiceIcon :size="18" />
          <span class="text-sm text-ink-primary tracking-wide">
            {{ sessionStore.currentSession?.name || '游戏会话' }}
          </span>
          <!-- 游戏激活状态指示器 -->
          <span
            v-if="sessionStore.isGameActive"
            class="text-[9px] bg-[#5A7A5A]/10 text-[#5A7A5A] px-2 py-0.5 rounded-full flex items-center gap-1"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-[#5A7A5A] animate-pulse" />
            运行中
          </span>
          <!-- 日期显示 -->
          <span class="text-[10px] text-ink-muted ml-2">
            📅 {{ dayCycle.dateString.value }}
          </span>
          <!-- 事件进度 -->
          <span class="text-[9px] text-ink-muted/60">
            事件 {{ dayCycle.eventsToday.value }}/{{ dayCycle.maxEventsPerDay }}
          </span>
        </div>
        <div class="flex gap-2 items-center">
          <button class="btn-ghost text-xs" @click="exportChat(sessionStore.currentSessionId, sessionStore.currentSession?.name)">
            导出
          </button>
          <button class="btn-ghost text-xs" @click="chatStore.clearChat(sessionStore.currentSessionId)">
            清空
          </button>
          <!-- 游戏控制 -->
          <div class="border-l border-[#D8D2C8] pl-2 ml-1 flex gap-1">
            <button class="btn-ghost text-xs" @click="goHome">
              主页
            </button>
            <template v-if="!showResetConfirm">
              <button class="btn-ghost text-xs text-red-400" @click="showResetConfirm = true">
                结束
              </button>
            </template>
            <template v-else>
              <span class="text-[10px] text-red-400">确认?</span>
              <button class="text-[10px] bg-red-400 text-white px-2 py-0.5 rounded" @click="endGame">是</button>
              <button class="text-[10px] text-ink-muted px-1" @click="showResetConfirm = false">否</button>
            </template>
          </div>
        </div>
      </div>

      <!-- 消息列表 -->
      <div ref="chatContainer" class="flex-1 overflow-y-auto px-4 py-3 space-y-3 relative" @scroll="onChatScroll">
        <!-- 空状态 -->
        <div v-if="chatStore.messages.length === 0 && !aiStreaming" class="flex flex-col items-center justify-center h-full text-ink-muted">
          <DiceIcon :size="40" class="mb-2 opacity-30" />
          <p class="text-sm">开始你的冒险...</p>
          <p class="text-xs mt-1">输入消息与 DM 对话，或使用 .d20 等骰子指令</p>
        </div>

        <!-- 历史消息 -->
        <div
          v-for="msg in chatStore.messages"
          :key="msg.id"
          class="fade-in"
          :class="msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'"
        >
          <div
            class="max-w-[75%] rounded-lg px-3 py-2"
            :class="{
              'bg-[#5A5550] text-[#F5F0E8]': msg.role === 'user',
              'bg-[#F5F0E8] text-ink-primary': msg.role === 'assistant',
              'bg-[#E8E2D8] text-ink-secondary': msg.role === 'dice' || msg.role === 'system'
            }"
          >
            <div v-if="msg.role !== 'user'" class="text-[10px] text-ink-muted mb-1">
              {{ roleLabel(msg.role) }}
              <span v-if="msg.characterId"> · {{ getCharName(msg.characterId) }}</span>
            </div>
            <p class="text-sm leading-relaxed whitespace-pre-wrap">{{ msg.content }}</p>
            <div class="text-[9px] opacity-60 mt-1 text-right">{{ formatTime(msg.timestamp) }}</div>
          </div>
        </div>

        <!-- AI 流式输出 -->
        <div v-if="aiStreaming || chatStore.isStreaming" class="flex justify-start">
          <div class="max-w-[75%] bg-[#F5F0E8] rounded-lg px-3 py-2">
            <div class="text-[10px] text-ink-muted mb-1">DM</div>
            <p class="text-sm leading-relaxed whitespace-pre-wrap">
              {{ chatStore.isStreaming ? chatStore.streamingContent : aiContent }}
              <span v-if="aiStreaming" class="cursor-blink"></span>
            </p>
          </div>
        </div>

        <!-- AI 错误 -->
        <div v-if="aiError" class="flex justify-center">
          <p class="text-xs text-red-400 bg-red-50 px-3 py-1 rounded-full">{{ aiError }}</p>
        </div>

        <!-- 滚动到底部按钮 -->
        <Transition name="fade">
          <button
            v-if="showScrollBtn"
            class="absolute bottom-4 right-4 w-8 h-8 rounded-full bg-[#5A5550] text-[#F5F0E8] flex items-center justify-center shadow-md hover:bg-[#4A4540] transition-all z-10"
            title="滚动到底部"
            @click="scrollToBottom"
          >
            ↓
          </button>
        </Transition>

        <!-- 选项按钮 — 从AI回复中解析可点击选项 -->
        <div class="flex justify-start">
          <div class="max-w-[75%]">
            <ChoiceButtons
              :text="lastAssistantMessage"
              :is-streaming="aiStreaming || chatStore.isStreaming"
              :disabled="aiStreaming || chatStore.isStreaming"
              @select="handleChoiceSelect"
            />
          </div>
        </div>
      </div>

      <!-- 输入区 -->
      <div class="px-4 py-3 border-t border-[#E8E2D8]">
        <div class="flex gap-2">
          <select
            v-model="selectedCharId"
            class="input-parchment text-xs w-28"
          >
            <option :value="null">全体</option>
            <option v-for="c in characterStore.characters" :key="c.id" :value="c.id">
              {{ c.name }}
            </option>
          </select>
          <input
            v-model="userInput"
            class="input-parchment flex-1 text-sm"
            placeholder="输入消息... (.d20 投骰)"
            :disabled="aiStreaming || chatStore.isStreaming"
            @keyup.enter="sendMessage"
          />
          <button
            v-if="aiStreaming || chatStore.isStreaming"
            class="btn-primary text-sm !bg-red-400"
            @click="cancelStream"
          >
            停止
          </button>
          <button
            v-else
            class="btn-primary text-sm"
            @click="sendMessage"
          >
            发送
          </button>
        </div>
      </div>
    </CardWrapper>

    <!-- ===== 右侧：骰子面板 ===== -->
    <div class="w-[320px] flex-shrink-0 flex flex-col gap-4">
      <!-- d20 数值面板 -->
      <CardWrapper class="p-4">
        <div class="flex items-center justify-between mb-4">
          <h4 class="text-sm text-ink-secondary tracking-wide">d20 投骰</h4>
          <div class="flex gap-1">
            <button
              class="text-[10px] px-2 py-0.5 rounded"
              :class="diceTab === 'd20' ? 'bg-[#5A5550] text-[#F5F0E8]' : 'text-ink-muted hover:bg-[#E8E2D8]'"
              @click="diceTab = 'd20'"
            >快速</button>
            <button
              class="text-[10px] px-2 py-0.5 rounded"
              :class="diceTab === 'custom' ? 'bg-[#5A5550] text-[#F5F0E8]' : 'text-ink-muted hover:bg-[#E8E2D8]'"
              @click="diceTab = 'custom'"
            >自定义</button>
          </div>
        </div>

        <!-- 快速 d20 -->
        <div v-if="diceTab === 'd20'" class="space-y-3">
          <!-- 纯 d20（无手动加成，加成由代码自动计算） -->
          <button
            class="w-full py-3 rounded-lg text-sm border border-[#D8D2C8] hover:bg-[#F5F0E8] transition-colors"
            :disabled="isRolling"
            @click="roll('d20', sessionStore.currentSessionId, selectedCharId)"
          >
            🎲 投掷 d20（纯骰面）
          </button>
          <p class="text-[9px] text-ink-muted/60 text-center">
            AI要求检定时输入 <strong>.yes</strong> 进行统一检定（自动计算加成）<br>
            或 <strong>.no</strong> 放弃检定（自动获低值）
          </p>
          <!-- 骰子结果展示 -->
          <div v-if="lastResult" class="fade-in bg-[#F5F0E8] rounded-lg p-3 text-center">
            <div :class="{ 'dice-rolling': isRolling }" class="inline-block mb-2">
              <DiceIcon :size="36" :rolling="isRolling" />
            </div>
            <p class="text-2xl font-medium text-ink-primary">{{ lastResult.total }}</p>
            <p class="text-xs text-ink-muted mt-1">{{ lastResult.detail }}</p>
            <p v-if="lastResult.label" class="text-xs text-ink-secondary mt-0.5">{{ lastResult.label }}</p>
          </div>
          <div v-else class="bg-[#F5F0E8] rounded-lg p-6 text-center">
            <DiceIcon :size="40" class="mx-auto opacity-20" />
            <p class="text-xs text-ink-muted mt-2">AI 要求检定时使用 .yes / .no</p>
            <p class="text-[10px] text-ink-muted/60 mt-1">加成由代码自动计算</p>
          </div>
        </div>

        <!-- 自定义骰子 -->
        <div v-if="diceTab === 'custom'" class="space-y-3">
          <div class="flex gap-2 flex-wrap">
            <button
              v-for="expr in ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', '2d6', '3d6', '4d6k3']"
              :key="expr"
              class="text-xs px-3 py-1.5 rounded-lg border border-[#D8D2C8] hover:bg-[#F5F0E8] transition-colors"
              @click="roll(expr, sessionStore.currentSessionId, selectedCharId)"
            >
              {{ expr }}
            </button>
          </div>
          <div class="flex gap-2">
            <input
              v-model="userInput"
              class="input-parchment flex-1 text-xs"
              placeholder="输入表达式，如 3d8+2"
              @keyup.enter="sendMessage"
            />
          </div>
        </div>
      </CardWrapper>

      <!-- 属性快捷检定 -->
      <CardWrapper class="p-4 flex-1 overflow-y-auto">
        <h4 class="text-sm text-ink-secondary tracking-wide mb-3">快捷检定</h4>
        <div v-if="selectedCharId && characterStore.currentCharacter" class="space-y-2">
          <div
            v-for="stat in ['str','dex','con','int','wis','cha']"
            :key="stat"
            class="flex items-center gap-2 p-2 rounded-lg hover:bg-[#F5F0E8] cursor-pointer transition-colors"
            @click="quickCheck(stat, characterStore.currentCharacter[stat])"
          >
            <span class="text-xs text-ink-secondary w-10">{{ statLabels[stat] }}</span>
            <div class="flex-1">
              <ProgressBar
                :value="characterStore.currentCharacter[stat]"
                :max="20"
                :color="stat === 'str' ? '#8B6A6A' : stat === 'dex' ? '#7A8B6A' : stat === 'con' ? '#6A7A8B' : stat === 'int' ? '#8B7A6A' : stat === 'wis' ? '#6A8B7A' : '#7A6A8B'"
                :show-value="false"
              />
            </div>
            <span class="text-xs text-ink-primary font-medium w-6 text-right">
              {{ characterStore.currentCharacter[stat] >= 10 ? '+' : '' }}{{ Math.floor((characterStore.currentCharacter[stat] - 10) / 2) }}
            </span>
            <span class="text-[10px] text-ink-muted opacity-0 hover:opacity-100">d20</span>
          </div>
        </div>
        <div v-else class="text-xs text-ink-muted text-center py-4">
          选择角色以进行属性检定
        </div>
      </CardWrapper>

      <!-- 投骰历史 -->
      <CardWrapper class="p-3">
        <button class="text-xs text-ink-secondary w-full text-left flex justify-between" @click="showDiceHistory = !showDiceHistory">
          <span>投骰历史 ({{ diceHistory.length }})</span>
          <span>{{ showDiceHistory ? '▲' : '▼' }}</span>
        </button>
        <div v-if="showDiceHistory && diceHistory.length > 0" class="mt-2 space-y-1 max-h-32 overflow-y-auto">
          <div
            v-for="(h, i) in diceHistory.slice(0, 10)"
            :key="i"
            class="text-[10px] text-ink-muted flex justify-between"
          >
            <span>{{ h.detail }}</span>
          </div>
        </div>
      </CardWrapper>
    </div>
  </div>

    <!-- 数据可视化面板 -->
    <div v-if="showStats" class="space-y-4 fade-in">
      <div class="grid grid-cols-2 gap-4">
        <DiceStatsChart
          :session-id="sessionStore.currentSessionId"
          :refresh-key="vizRefreshKey"
        />
        <StatusRadar
          :character="characterStore.currentCharacter"
        />
      </div>
      <TimelineChart
        :session-id="sessionStore.currentSessionId"
        :refresh-key="vizRefreshKey"
      />
    </div>

    <!-- 导出对话框 -->
    <ExportDialog
      v-if="showExport"
      :session-id="sessionStore.currentSessionId"
      :session-name="sessionStore.currentSession?.name"
      @close="showExport = false"
    />
  </div>
</template>
