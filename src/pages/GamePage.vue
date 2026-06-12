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
import { streamChat } from '../services/deepseek.js'
import { useDayCycleStore } from '../stores/dayCycle.js'
import { useBackup } from '../composables/useBackup.js'
import CardWrapper from '../components/common/CardWrapper.vue'
import CompassLogo from '../components/common/CompassLogo.vue'
import DiceIcon from '../components/common/DiceIcon.vue'
import ProgressBar from '../components/common/ProgressBar.vue'
import CombatStats from '../components/visualization/CombatStats.vue'
import ExportDialog from '../components/export/ExportDialog.vue'
import SaveSlotDialog from '../components/export/SaveSlotDialog.vue'
import InventoryBar from '../components/game/InventoryBar.vue'
import ChoiceButtons from '../components/chat/ChoiceButtons.vue'
import { syncItemsFromMessage } from '../services/inventory.js'
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

// 快捷检定使用主控角色（始终跟随 characterStore.currentCharacterId）

// 可视化面板
const showStats = ref(false)
const dataTab = ref('角色')
const showExport = ref(false)
const showSaveDialog = ref(false)
const combatState = ref(null)
const inventoryRef = ref(null)
const showDiceMobile = ref(false)

// 游戏模式：引导模式(默认) / 自由模式
const gameMode = ref('guided')  // 'guided' | 'free'

/** 获取最后一条 AI 消息文本（用于选项按钮解析 + 检定检测） */
const lastAssistantMessage = computed(() => {
  const msgs = chatStore.messages
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant') return msgs[i].content
  }
  return ''
})

// 检定状态管理 — pendingCheck 是唯一判定来源
const checkResponded = ref(false)
const pendingCheck = computed(() => {
  if (!lastAssistantMessage.value) return null
  return parseCheckRequest()
})
// 是否可以进行检定：有待处理请求 + 未响应 + AI 未在流式输出
const canRoll = computed(() =>
  !!pendingCheck.value && !checkResponded.value && !chatStore.isStreaming
)

// 新检定请求出现 → 重置响应状态
watch(() => pendingCheck.value?.dc, (newDc, oldDc) => {
  if (newDc && newDc !== oldDc) {
    checkResponded.value = false
  }
})
const vizRefreshKey = ref(0)

// 骰子面板 tab
const diceTab = ref('d20') // 'd20' | 'custom' | 'history'

// 标记游戏是否已在该会话中初始化过日期
const dateInitialized = ref(false)
// 标记游戏是否已开始（用于控制开场白生成）
const gameStarted = ref(false)
// 标记开场白是否已生成
const openingNarrationDone = ref(false)

onMounted(async () => {
  if (sessionStore.currentSessionId) {
    await chatStore.loadMessages(sessionStore.currentSessionId)
    await characterStore.loadCharacters(sessionStore.currentSessionId)
    await worldStore.loadWorldData(sessionStore.currentSessionId)

    // 检测是否已存在 AI 回复（恢复存档/继续游戏的情况）→ 跳过开场
    const hasAI = chatStore.messages.some(m => m.role === 'assistant' && m.type === 'chat')
    if (hasAI) {
      gameStarted.value = true
      openingNarrationDone.value = true
    }

    // 仅首次挂载时初始化日期
    if (!dateInitialized.value && dayCycle.dayCount === 0 && chatStore.messages.length === 0) {
      dayCycle.randomizeStartDate()
    }
    dateInitialized.value = true
  }
})

/** 检测是否需要生成开场白，如果是则根据角色自动生成 */
async function generateOpeningNarrationIfNeeded() {
  const sessionId = sessionStore.currentSessionId
  if (!sessionId || openingNarrationDone.value) return

  openingNarrationDone.value = true
  gameStarted.value = true

  // 获取角色列表
  const characters = characterStore.characters
  if (characters.length === 0) return

  // 构建角色描述
  const charDescriptions = characters.map(c => {
    let desc = `- ${c.name}：${c.race} ${c.class}`
    if (c.level) desc += ` Lv.${c.level}`
    if (c.pathway) desc += ` (${c.pathway})`
    if (c.background) desc += `\n  📖 背景：${c.background}`
    if (c.surnameMeaning) desc += `\n  🔶 特殊姓氏背景：${c.surnameMeaning}`
    return desc
  }).join('\n')

  // 获取模组信息
  const mod = moduleCtxStore.activeModule || {}
  const modName = mod.name || sessionStore.currentSession?.name || '未知冒险'
  const modSystem = mod.system || sessionStore.currentSession?.system || ''
  const modBackground = mod.background || ''

  // 加载规则书（安全回退）
  let rulesText = ''
  try {
    const { getRulebook, formatRulebookForPrompt } = await import('../../modules/index.js')
    const rules = await getRulebook(modSystem)
    rulesText = formatRulebookForPrompt(rules)
  } catch { rulesText = '' }

  const hasSpecialSurnames = characters.some(c => c.surnameMeaning)

  const openingPrompt = `你是一位经验丰富的 TRPG 游戏主持人 (DM/GM)。
你的 DM 风格：沉浸式叙述、主动引导玩家、营造戏剧张力、适时引入挑战。

你正在主持一场《${modName}》的跑团冒险。

# 冒险背景
${modBackground}

${rulesText}

# 当前队伍冒险者
${charDescriptions}
${hasSpecialSurnames ? `
⚠️ 重要：上述冒险者中有角色拥有特殊的家族/姓氏背景。请在开场叙述中巧妙地融入这些背景元素——这可能是故事的重要线索，影响整个冒险的走向。` : ''}

# 你的任务
为以上冒险者写一段精彩的冒险开场叙述。要求：
1. 以第二人称「你」直接称呼玩家，营造代入感
2. 用生动的感官细节描绘当前场景——玩家看到什么、听到什么、闻到什么
3. 迅速建立故事冲突或悬念——不要平铺直叙
4. 如果有冒险者拥有特殊家族背景，务必巧妙地将其融入故事起点
5. **最重要**：结尾必须另起一行，以数字编号给出 2-3 个具体的行动选项，格式如下：
1. [选项描述]
2. [选项描述]
3. [选项描述]

语气要有画面感和戏剧张力。使用中文。控制在400-600字。`

  const messages = [
    { role: 'system', content: openingPrompt },
    { role: 'user', content: `请开始《${modName}》的冒险开场，为冒险者${characters.map(c => c.name).join('、')}开启旅程。` }
  ]

  // 开始流式生成
  chatStore.startStreaming()
  let abortController = new AbortController()

  // 15秒超时保护
  const timeout = setTimeout(() => {
    if (!openingNarrationDone.value) {
      abortController.abort()
    }
  }, 15000)

  try {
    await streamChat(messages, {
      onToken: (token) => {
        chatStore.appendStreamToken(token)
      },
      onDone: async () => {
        clearTimeout(timeout)
        await chatStore.finishStreaming(sessionId, null)
        openingNarrationDone.value = true
        scrollToBottom()
      },
      onError: async (err) => {
        clearTimeout(timeout)
        console.error('Opening narration failed, using fallback:', err.message)
        const fallback = `欢迎来到《${modName}》的世界！\n\n你环顾四周，空气中弥漫着冒险的气息。远处有什么在召唤着你——也许是命运，也许是危险，也许是宝藏。\n\n你的故事即将开始。你打算怎么做？\n1. 观察周围的环境\n2. 寻找附近的城镇或村庄\n3. 检查你的装备和物资`
        chatStore.streamingContent = fallback
        await chatStore.finishStreaming(sessionId, null)
        openingNarrationDone.value = true
        scrollToBottom()
      },
      signal: abortController.signal
    })
  } catch (e) {
    clearTimeout(timeout)
    console.error('generateOpeningNarration error:', e)
    // 兜底：直接生成本地开场白
    const fallback = `欢迎来到《${modName}》的世界！\n\n你环顾四周，空气中弥漫着冒险的气息。\n\n你的故事即将开始。你打算怎么做？\n1. 观察周围的环境\n2. 寻找附近的城镇或村庄\n3. 检查你的装备和物资`
    if (!chatStore.streamingContent) {
      chatStore.streamingContent = fallback
    }
    await chatStore.finishStreaming(sessionId, null)
    openingNarrationDone.value = true
    scrollToBottom()
  }
}

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
      await createArchive(sessionStore.currentSessionId, characterStore.currentCharacterId, {
        moduleName: moduleCtxStore.moduleName,
        characterName: characterStore.currentCharacter?.name || '',
        dayCount: dayCycle.dayCount,
        saveType: 'auto'
      })
      autoSaveNotice.value = `📥 自动存档完成 — 第${dayCycle.dayCount}天`
      setTimeout(() => { autoSaveNotice.value = '' }, 3000)
    } catch (e) { console.error('[AutoSave] 失败:', e) }
  }

  // 同步AI回复中的物品变动到背包（仅玩家角色）
  const lastMsg = chatStore.messages[chatStore.messages.length - 1]
  if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content) {
    const sid2 = sessionStore.currentSessionId
    const cid = characterStore.currentCharacterId
    if (sid2 && cid) {
      const playerNames = characterStore.characters.map(c => c.name)
      await syncItemsFromMessage(sid2, cid, lastMsg.content, playerNames)
      if (inventoryRef.value) inventoryRef.value.refresh()
    }
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
      dayCount: dayCycle.dayCount,
      saveType: 'auto'
    })
  }
  useUIStore().setPage('home')
}

// pendingCheck watcher 已在上面处理 unlock + reset

/** 骰子投掷包装函数 — 拦截检定请求自动计算加权 */
async function handleDiceRoll(expression) {
  if (!sessionStore.currentSessionId) return

  // 如果有待处理的检定请求，使用统一检定计算加权
  const checkReq = pendingCheck.value
  if (checkReq && !checkResponded.value) {
    const char = characterStore.currentCharacter || characterStore.characters[0]
    if (char) {
      const result = performUnifiedCheck(char, checkReq.checkType, checkReq.difficulty)
      await logCheckResult(sessionStore.currentSessionId, characterStore.currentCharacterId, result)
      const msg = formatCheckResult(result)
      await chatStore.addMessage({
        sessionId: sessionStore.currentSessionId,
        characterId: characterStore.currentCharacterId,
        role: 'dice',
        content: msg,
        type: 'dice'
      })
      checkResponded.value = true
      // 自动继续剧情
      await continueAfterCheck(msg)
      return
    }
  }

  // 普通投骰（无检定请求或已响应）
  const result = await roll(expression, sessionStore.currentSessionId, characterStore.currentCharacterId)
  if (result) {
    await chatStore.addMessage({
      sessionId: sessionStore.currentSessionId,
      characterId: characterStore.currentCharacterId,
      role: 'dice',
      content: result.detail,
      type: 'dice'
    })
  }
}

/** 检定结果出来后自动继续剧情 */
async function continueAfterCheck(diceMsg) {
  const session = sessionStore.currentSession
  if (!session) return
  const characters = characterStore.characters
  const worldEntries = worldStore.entries
  const moduleContextText = moduleCtxStore.buildModuleContextText()

  // 排除刚添加的骰子消息，AI 会从上下文窗口看到它
  await startStream({
    messages: chatStore.messages.slice(0, -1),
    session,
    characters,
    worldEntries,
    summary: null,
    userMessage: `[检定结果] ${diceMsg}`,
    moduleContextText,
    gameMode: gameMode.value
  })

  // 保存 AI 回复
  await chatStore.finishStreaming(sessionStore.currentSessionId, null)
  await recordGameEvent()
}

/** 点击选项按钮 — 把选项文本当作玩家消息发送 */
async function handleChoiceSelect(choiceText) {
  if (!sessionStore.currentSessionId || aiStreaming.value || chatStore.isStreaming) return

  await chatStore.addMessage({
    sessionId: sessionStore.currentSessionId,
    characterId: characterStore.currentCharacterId,
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
    moduleContextText,
    gameMode: gameMode.value
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

  // 检测骰子指令: .d20, .2d6+3 等（也可以通过右侧面板投骰）
  if (text.startsWith('.')) {
    const expr = text.slice(1)
    await handleDiceRoll(expr)
    return
  }

  // 添加用户消息
  await chatStore.addMessage({
    sessionId: sessionStore.currentSessionId,
    characterId: characterStore.currentCharacterId,
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
    moduleContextText,
    gameMode: gameMode.value
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
  // 未到检定时机则忽略
  if (!canRoll.value) return

  // 如有待处理检定请求，使用统一检定
  const checkReq = pendingCheck.value
  if (checkReq && !checkResponded.value) {
    const char = characterStore.currentCharacter || characterStore.characters[0]
    if (char) {
      const result = performUnifiedCheck(char, checkReq.checkType, checkReq.difficulty)
      await logCheckResult(sessionStore.currentSessionId, characterStore.currentCharacterId, result)
      const msg = formatCheckResult(result)
      await chatStore.addMessage({ sessionId: sessionStore.currentSessionId, characterId: characterStore.currentCharacterId, role: 'dice', content: msg, type: 'dice' })
      checkResponded.value = true
      await continueAfterCheck(msg)
      return
    }
  }

  // 普通快捷检定
  const result = await abilityCheck(statName, statValue, sessionStore.currentSessionId, characterStore.currentCharacterId)
  if (result) {
    await chatStore.addMessage({
      sessionId: sessionStore.currentSessionId,
      characterId: characterStore.currentCharacterId,
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

function charColor(name) {
  let hash = 0
  for (const c of name || '?') hash = ((hash << 5) - hash) + c.charCodeAt(0)
  return `hsl(${Math.abs(hash) % 360}, 25%, 50%)`
}

const ATTR_LABELS = { str:'力量',dex:'敏捷',con:'体质',int:'智力',wis:'感知',cha:'魅力', spirit:'灵性',physique:'体能',sanity:'理智',charm:'魅力',lore:'学识',will:'意志', pow:'意志',app:'外貌',edu:'教育',siz:'体型',luck:'幸运' }
function attrLabel(key) { return ATTR_LABELS[key] || key.toUpperCase() }

const currentCharAttrs = computed(() => {
  const char = characterStore.currentCharacter
  if (!char) return {}
  const skip = new Set(['id','sessionId','name','race','class','level','pathway','hp','maxHp','mp','maxMp','equipment','skills','skillSheet','growth','npcAffinity','status','avatar','background','surnameMeaning','createdAt'])
  const attrs = {}
  for (const [k, v] of Object.entries(char)) {
    if (!skip.has(k) && typeof v === 'number' && !k.startsWith('_')) attrs[k] = v
  }
  return attrs
})
</script>

<template>
  <div class="space-y-4">
    <!-- 自动存档通知 -->
    <Transition name="fade">
      <div v-if="autoSaveNotice" class="text-center">
        <p class="text-[11px] text-ink-muted/50 italic">{{ autoSaveNotice }}</p>
      </div>
    </Transition>

    <!-- 顶部工具栏：移动端滑动选项卡，桌面端并排 -->
    <div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
      <!-- 今日事件（始终首位） -->
      <span class="text-xs text-ink-muted whitespace-nowrap flex-shrink-0">
        今日 {{ dayCycle?.eventsToday?.value ?? 0 }}/{{ dayCycle?.maxEventsPerDay ?? 4 }}
      </span>
      <span class="text-ink-muted/20 flex-shrink-0">|</span>
      <!-- 滑动选项卡 -->
      <div class="flex gap-1.5 flex-nowrap overflow-x-auto scrollbar-hide">
        <button class="tab-pill text-[10px] whitespace-nowrap" :class="gameMode === 'guided' ? 'tab-active' : ''" @click="gameMode = 'guided'">引导</button>
        <button class="tab-pill text-[10px] whitespace-nowrap" :class="gameMode === 'free' ? 'tab-active' : ''" @click="gameMode = 'free'">自由</button>
        <button class="tab-pill text-[10px] whitespace-nowrap" :class="showCombat ? 'tab-active' : ''" @click="showCombat = !showCombat">⚔️ 战斗</button>
        <button class="tab-pill text-[10px] whitespace-nowrap" :class="showStats ? 'tab-active' : ''" @click="showStats = !showStats">📊 数据</button>
        <button class="tab-pill text-[10px] whitespace-nowrap" @click="showSaveDialog = true">💾 存档</button>
        <button class="tab-pill text-[10px] whitespace-nowrap" @click="showExport = true">导出</button>
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

  <div class="flex flex-col md:flex-row gap-3 md:gap-4" style="max-height: calc(100vh - 130px); min-height: calc(100vh - 220px);">
    <!-- ===== 左侧：聊天窗口 ===== -->
    <CardWrapper class="flex-1 flex flex-col p-0 overflow-hidden min-h-0 relative">
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
            事件 {{ dayCycle?.eventsToday?.value ?? 0 }}/{{ dayCycle?.maxEventsPerDay ?? 4 }}
          </span>
        </div>
      </div>

      <!-- 消息列表 -->
      <div ref="chatContainer" class="flex-1 overflow-y-auto px-4 py-3 space-y-3 relative" @scroll="onChatScroll">
        <!-- 开始游戏按钮（首次进入） -->
        <div v-if="!gameStarted && !aiStreaming" class="flex flex-col items-center justify-center h-full text-ink-muted">
          <CompassLogo />
          <p class="text-sm mt-4 text-ink-primary font-medium">准备开始冒险</p>
          <p class="text-xs mt-1 text-ink-muted/60">{{ characterStore.currentCharacter?.name || '冒险者' }} · {{ characterStore.currentCharacter?.race }} {{ characterStore.currentCharacter?.class }}</p>
          <button
            class="mt-6 px-8 py-2.5 rounded-lg bg-[#5A5550] text-[#F5F0E8] text-sm tracking-wider hover:bg-[#4A4540] transition-all shadow-md"
            :disabled="openingNarrationDone"
            @click="generateOpeningNarrationIfNeeded()"
          >
            {{ openingNarrationDone ? '生成中...' : '开始游戏' }}
          </button>
        </div>
        <!-- 空消息提示（游戏已开始但无消息） -->
        <div v-if="gameStarted && chatStore.messages.length === 0 && !aiStreaming" class="flex flex-col items-center justify-center h-full text-ink-muted">
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

        <!-- 选项按钮 — 引导模式下从AI回复中解析可点击选项 -->
        <div v-if="gameMode === 'guided'" class="flex justify-start">
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
          <input
            v-model="userInput"
            class="input-parchment flex-1 text-sm transition-colors"
            :class="pendingCheck && !checkResponded ? '!border-amber-400 !bg-amber-50' : ''"
            :placeholder="pendingCheck && !checkResponded ? '⚡ 请进行检定 (输入 .yes 接受 / .no 放弃)' : '输入消息... (.d20 投骰)'"
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
      <!-- 背包栏（输入框下方） -->
      <InventoryBar
        v-if="characterStore.currentCharacterId"
        ref="inventoryRef"
        :session-id="sessionStore.currentSessionId"
        :character-id="characterStore.currentCharacterId"
      />

      <!-- 回到底部按钮（聊天窗内悬浮） -->
      <Transition name="fade">
        <button
          v-if="showScrollBtn"
          class="absolute bottom-20 right-5 w-10 h-10 rounded-full bg-[#5A5550]/90 text-[#F5F0E8] flex items-center justify-center shadow-lg hover:bg-[#4A4540] transition-all z-10"
          title="回到底部"
          @click="scrollToBottom"
        >↓</button>
      </Transition>
    </CardWrapper>

    <!-- 移动端骰子切换按钮 -->
    <button class="md:hidden text-xs text-ink-muted text-center py-1" @click="showDiceMobile = !showDiceMobile">
      {{ showDiceMobile ? '隐藏' : '🎲' }} 骰子面板
    </button>
    <!-- ===== 右侧：骰子面板 ===== -->
    <div class="w-full md:w-[320px] flex-shrink-0 flex-col gap-4" :class="[pendingCheck && !checkResponded ? 'animate-pulse' : '', showDiceMobile ? 'flex' : 'hidden md:flex']">
      <!-- d20 数值面板 -->
      <CardWrapper class="p-4" :class="pendingCheck && !checkResponded ? 'ring-2 ring-amber-400/50 !border-amber-300' : ''">
        <div class="flex items-center justify-between mb-4">
          <h4 class="text-sm font-medium tracking-wide" :class="pendingCheck && !checkResponded ? 'text-amber-600' : 'text-ink-secondary'">
            {{ pendingCheck && !checkResponded ? '⚡ 检定中' : 'd20 投骰' }}
          </h4>
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
          <button
            class="w-full py-3 rounded-lg text-sm border transition-colors"
            :class="!canRoll
              ? 'border-[#E8E2D8] bg-[#F5F0E8]/50 text-ink-muted/30 cursor-not-allowed'
              : 'border-[#D8D2C8] hover:bg-[#F5F0E8]'"
            :disabled="isRolling || !canRoll"
            @click="handleDiceRoll('d20')"
          >
            {{ !canRoll ? '🔒 骰子已锁定' : '🎲 投掷 d20 (自动加权)' }}
          </button>
          <p class="text-[9px] text-ink-muted/60 text-center">
            {{ !canRoll
              ? 'AI 未发起检定请求，骰子面板已锁定'
              : '⚡ AI 请求检定 — 投掷骰子自动计算加权结果' }}
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
          <div v-else class="rounded-lg p-6 text-center transition-colors"
            :class="canRoll
              ? 'bg-amber-50 border-2 border-amber-300 animate-pulse'
              : 'bg-[#F5F0E8]'">
            <DiceIcon :size="40" class="mx-auto" :class="canRoll ? 'opacity-80' : 'opacity-20'" />
            <p class="text-xs font-medium mt-2" :class="canRoll ? 'text-amber-700' : 'text-ink-muted'">
              {{ canRoll ? '⚡ AI 请求检定 — 投掷骰子自动计算加权结果' : '骰子已锁定，等待 AI 发起检定' }}
            </p>
            <p class="text-[10px] text-ink-muted/60 mt-1">检定结果自动加权计算并返回</p>
          </div>
        </div>

        <!-- 自定义骰子 -->
        <div v-if="diceTab === 'custom'" class="space-y-3">
          <div class="flex gap-2 flex-wrap">
            <button
              v-for="expr in ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', '2d6', '3d6', '4d6k3']"
              :key="expr"
              class="text-xs px-3 py-1.5 rounded-lg border transition-colors"
              :class="!canRoll
                ? 'border-[#E8E2D8] bg-[#F5F0E8]/30 text-ink-muted/30 cursor-not-allowed'
                : 'border-[#D8D2C8] hover:bg-[#F5F0E8]'"
              :disabled="!canRoll"
              @click="handleDiceRoll(expr)"
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

      <!-- 角色状态卡片 -->
      <CardWrapper class="p-4 flex-1 overflow-y-auto">
        <h4 class="text-sm text-ink-secondary tracking-wide mb-3">角色状态</h4>
        <div v-if="characterStore.currentCharacter" class="space-y-3">
          <!-- 基本信息 -->
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm flex-shrink-0" :style="{ backgroundColor: charColor(characterStore.currentCharacter.name) }">
              {{ characterStore.currentCharacter.name?.charAt(0) }}
            </div>
            <div class="min-w-0">
              <p class="text-xs font-medium text-ink-primary truncate">{{ characterStore.currentCharacter.name }}</p>
              <p class="text-[9px] text-ink-muted">{{ characterStore.currentCharacter.race }} · {{ characterStore.currentCharacter.class }} Lv.{{ characterStore.currentCharacter.level || 1 }}</p>
            </div>
          </div>
          <!-- HP 条 -->
          <div class="space-y-1">
            <div class="flex justify-between text-[9px]">
              <span class="text-ink-muted">HP</span>
              <span class="text-ink-primary font-medium">{{ characterStore.currentCharacter.hp ?? characterStore.currentCharacter.maxHp ?? 10 }}/{{ characterStore.currentCharacter.maxHp ?? 10 }}</span>
            </div>
            <ProgressBar :value="characterStore.currentCharacter.hp ?? 10" :max="characterStore.currentCharacter.maxHp ?? 10" color="#8B6A6A" :show-value="false" />
          </div>
          <!-- 属性列表（自适应D&D/LOTM/COC） -->
          <div class="grid grid-cols-2 gap-1.5">
            <div v-for="(val, key) in currentCharAttrs" :key="key" class="flex justify-between items-center text-[10px] bg-[#F5F0E8] rounded px-2 py-1">
              <span class="text-ink-muted">{{ attrLabel(key) }}</span>
              <span class="text-ink-primary font-medium">{{ val }} <span class="text-[8px] text-ink-muted">({{ val >= 10 ? '+' : '' }}{{ Math.floor((val - 10) / 2) }})</span></span>
            </div>
          </div>
          <!-- 背景 + 特殊姓氏 -->
          <div v-if="characterStore.currentCharacter.background || characterStore.currentCharacter.surnameMeaning" class="space-y-1 text-[9px]">
            <p v-if="characterStore.currentCharacter.background" class="text-ink-muted leading-relaxed">📖 {{ characterStore.currentCharacter.background }}</p>
            <p v-if="characterStore.currentCharacter.surnameMeaning" class="text-[#8B6A5A] leading-relaxed">🛡️ {{ characterStore.currentCharacter.surnameMeaning }}</p>
          </div>
        </div>
        <div v-else class="text-xs text-ink-muted text-center py-4">选择角色以查看状态</div>
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

    <!-- 数据面板（底部展开） -->
    <div v-if="showStats" class="fade-in border-t border-[#E8E2D8] bg-[#FAF7F2]">
      <div class="max-w-5xl mx-auto p-4 space-y-4">
        <div class="flex gap-3">
          <button
            v-for="tab in ['角色', '技能', '成长', '战斗']"
            :key="tab"
            class="text-xs px-3 py-1 rounded-full"
            :class="dataTab === tab ? 'bg-[#5A5550] text-[#F5F0E8]' : 'text-ink-muted hover:bg-[#E8E2D8]'"
            @click="dataTab = tab"
          >{{ tab }}</button>
        </div>

        <!-- 角色面板 -->
        <div v-if="dataTab === '角色'" class="grid grid-cols-3 gap-3">
          <div v-for="c in characterStore.characters" :key="c.id" class="bg-white rounded-lg p-3 border border-[#E8E2D8]">
            <div class="flex items-center gap-2 mb-2">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs" :style="{ backgroundColor: `hsl(${c.name?.charCodeAt(0)||0 % 360},25%,50%)` }">{{ c.name?.charAt(0) }}</div>
              <div>
                <p class="text-xs font-medium text-ink-primary">{{ c.name }}</p>
                <p class="text-[9px] text-ink-muted">{{ c.race }} {{ c.class }} Lv.{{ c.level }}</p>
              </div>
            </div>
            <div class="grid grid-cols-3 gap-1 text-[9px]">
              <span>HP {{ c.hp }}/{{ c.maxHp }}</span>
              <span>力 {{ c.str }}</span><span>敏 {{ c.dex }}</span>
              <span>体 {{ c.con }}</span><span>智 {{ c.int }}</span>
              <span>感 {{ c.wis }}</span><span>魅 {{ c.cha }}</span>
              <span v-if="c.status !== '正常'" class="text-red-500 col-span-3">{{ c.status }}</span>
            </div>
          </div>
        </div>

        <!-- 技能面板 -->
        <div v-if="dataTab === '技能' && characterStore.currentCharacter" class="grid grid-cols-4 gap-2">
          <div v-for="(skill, key) in (characterStore.currentCharacter.skillSheet || {})" :key="key" class="bg-white rounded p-2 border border-[#E8E2D8] text-[9px]">
            <div class="flex justify-between">
              <span class="font-medium text-ink-primary">{{ skill.name }}</span>
              <span class="text-ink-muted">{{ skill.attr?.toUpperCase() }}</span>
            </div>
            <div class="flex justify-between mt-1">
              <span class="text-[8px] px-1 rounded" :class="skill.level === 'master' ? 'bg-amber-100 text-amber-700' : skill.level === 'expert' ? 'bg-blue-50 text-blue-600' : skill.level === 'proficient' ? 'bg-green-50 text-green-600' : 'text-ink-muted/50'">{{ {untrained:'未受训',proficient:'熟练',expert:'专精',master:'大师'}[skill.level] }}</span>
              <span class="text-ink-primary font-medium">{{ (Math.floor((characterStore.currentCharacter[skill.attr]-10)/2) + (characterStore.currentCharacter.level ? Math.floor((characterStore.currentCharacter.level+3)/4) : 0) + ({untrained:0,proficient:2,expert:4,master:6}[skill.level]||0)) >= 0 ? '+' : '' }}{{ Math.floor((characterStore.currentCharacter[skill.attr]-10)/2) + (characterStore.currentCharacter.level ? Math.floor((characterStore.currentCharacter.level+3)/4) : 0) + ({untrained:0,proficient:2,expert:4,master:6}[skill.level]||0) }}</span>
            </div>
          </div>
        </div>

        <!-- 成长面板 -->
        <div v-if="dataTab === '成长' && characterStore.currentCharacter" class="space-y-3">
          <div class="bg-white rounded-lg p-3 border border-[#E8E2D8]">
            <div class="flex justify-between text-xs mb-1">
              <span>等级 {{ characterStore.currentCharacter.growth?.level || characterStore.currentCharacter.level || 1 }}</span>
              <span>XP {{ characterStore.currentCharacter.growth?.xp || 0 }} / 下一级</span>
            </div>
            <ProgressBar :value="characterStore.currentCharacter.growth?.xp || 0" :max="300 * Math.pow(1.5, (characterStore.currentCharacter.level||1)-1)" :color="'#5A7A5A'" :show-value="false" />
            <p class="text-[9px] text-ink-muted mt-2">可用技能点: <strong>{{ characterStore.currentCharacter.growth?.skillPoints || 0 }}</strong>（升级获得，可提升属性或技能熟练度）</p>
          </div>
        </div>

        <!-- 战斗面板 -->
        <div v-if="dataTab === '战斗'" class="space-y-2">
          <div v-if="!combatState?.isActive" class="bg-white rounded-lg p-4 text-center border border-[#E8E2D8]">
            <p class="text-xs text-ink-muted">暂无进行中的战斗</p>
            <p class="text-[10px] text-ink-muted/50 mt-1">由 AI GM 发起战斗后，战斗状态将在此显示</p>
          </div>
          <div v-else class="space-y-2">
            <div class="bg-white rounded-lg p-3 border border-[#E8E2D8] text-xs">
              <div class="flex justify-between mb-1"><span>回合 {{ combatState.round }}</span><span>{{ combatState.isActive ? '进行中' : '已结束' }}</span></div>
              <div v-for="p in combatState.participants" :key="p.id" class="flex justify-between py-1 border-b border-[#E8E2D8]/50 last:border-0">
                <span>{{ p.type === 'player' ? '🧑' : '👹' }} {{ p.name }}</span>
                <span :class="p.hp <= p.maxHp/2 ? 'text-red-500' : ''">HP {{ p.hp }}/{{ p.maxHp }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 导出对话框 -->
    <ExportDialog
      v-if="showExport"
      :session-id="sessionStore.currentSessionId"
      :session-name="sessionStore.currentSession?.name"
      @close="showExport = false"
    />

    <!-- 手动存档弹窗 -->
    <SaveSlotDialog
      v-if="showSaveDialog"
      :session-id="sessionStore.currentSessionId"
      :character-id="characterStore.currentCharacterId"
      :module-name="moduleCtxStore.moduleName || ''"
      :character-name="characterStore.currentCharacter?.name || ''"
      :day-count="dayCycle.dayCount"
      @saved="showSaveDialog = false"
      @close="showSaveDialog = false"
    />

    <!-- 右下角浮动结束游戏按钮 -->
    <div class="fixed bottom-6 right-6 z-40">
      <template v-if="!showResetConfirm">
        <button
          class="text-xs bg-white/80 backdrop-blur border border-red-200 text-red-400 px-3 py-1.5 rounded-full shadow-sm hover:bg-red-50 hover:border-red-300 transition-all"
          @click="showResetConfirm = true"
        >结束游戏</button>
      </template>
      <template v-else>
        <div class="flex items-center gap-2 bg-white/90 backdrop-blur border border-red-200 rounded-full px-3 py-1.5 shadow-sm">
          <span class="text-[10px] text-red-500">确定结束？</span>
          <button class="text-[10px] bg-red-400 text-white px-2 py-0.5 rounded-full" @click="endGame">确认</button>
          <button class="text-[10px] text-ink-muted hover:text-ink-primary px-1" @click="showResetConfirm = false">取消</button>
        </div>
      </template>
    </div>
  </div>
</template>
