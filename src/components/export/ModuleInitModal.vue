<script setup>
// 模组初始化弹窗 - 完整的模组启动流程
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useSessionStore } from '../../stores/session.js'
import { useCharacterStore } from '../../stores/character.js'
import { useChatStore } from '../../stores/chat.js'
import { useWorldStore } from '../../stores/world.js'
import { useUIStore } from '../../stores/ui.js'
import { streamChat, getApiKey } from '../../services/deepseek.js'
import { buildSystemPrompt } from '../../services/memory.js'
import { useModuleContextStore } from '../../stores/moduleContext.js'
import { useDayCycleStore } from '../../stores/dayCycle.js'
import { useCustomAttrsStore } from '../../stores/customAttrs.js'
import CardWrapper from '../common/CardWrapper.vue'
import CompassLogo from '../common/CompassLogo.vue'
import ProgressBar from '../common/ProgressBar.vue'
import DiceIcon from '../common/DiceIcon.vue'
import MiniRadar from '../common/MiniRadar.vue'

// 模块加载函数 - 动态导入以避免与 HomePage 的静态导入冲突
let _moduleApi = null
async function getModuleApi() {
  if (!_moduleApi) {
    _moduleApi = await import('../../../modules/index.js')
  }
  return _moduleApi
}

const props = defineProps({
  module: { type: Object, required: true }
})
const emit = defineEmits(['close', 'complete'])

const sessionStore = useSessionStore()
const characterStore = useCharacterStore()
const chatStore = useChatStore()
const worldStore = useWorldStore()
const ui = useUIStore()

// 流程阶段: 'init' | 'ai_generating' | 'ai_done' | 'character_select' | 'ready'
const phase = ref('init')
const phaseMessages = {
  init: '准备初始化...',
  ai_generating: 'AI 正在生成冒险开场...',
  ai_done: '开场叙述已生成',
  character_select: '选择冒险角色',
  ready: '一切就绪，可以开始冒险！'
}

// AI 生成的初始化内容
const aiNarration = ref('')
const aiErrorMsg = ref('')
const initProgress = ref('正在连接 DeepSeek API...')

// 角色选择状态
const selectedCharIds = ref(new Set())
const showCreateForm = ref(false)

// 从模组数据读取角色创建选项
const charCreation = computed(() => props.module?.charCreation || {
  classes: ['战士', '法师', '牧师', '游荡者'],
  races: ['人类', '精灵', '矮人', '半精灵'],
  backgrounds: ['士兵', '学者', '侍僧', '平民英雄'],
  statLabel: '等级', statRange: [1, 20], defaultLevel: 1,
  hideLevelSelector: false, fixedLevel: null,
  classToPathway: null, totalAttrPoints: 60,
  attributes: [{key:'str',label:'力量',default:10},{key:'dex',label:'敏捷',default:10},{key:'con',label:'体质',default:10},{key:'int',label:'智力',default:10},{key:'wis',label:'感知',default:10},{key:'cha',label:'魅力',default:10}],
  classWeights: {}, raceWeights: {}, namePool: {first:[],last:[]}
})
const statLabel = computed(() => charCreation.value.statLabel || '等级')
const statMin = computed(() => charCreation.value.statRange?.[0] ?? 1)
const statMax = computed(() => charCreation.value.statRange?.[1] ?? 20)
const hideLevelSelector = computed(() => charCreation.value.hideLevelSelector === true)
const classToPathway = computed(() => charCreation.value.classToPathway || null)
const attributes = computed(() => charCreation.value.attributes || [])
const totalAttrPoints = computed(() => charCreation.value.totalAttrPoints || 60)
function createDefaultForm() {
  const cc = charCreation.value
  const level = cc.fixedLevel ?? cc.defaultLevel ?? 1
  const cls = cc.classes?.[0] || '战士'
  const race = cc.races?.[0] || '人类'
  const base = cc.attrBase || 3
  // 直接使用模块默认修饰值，不依赖 later-defined computed
  const clsMod = cc.classMods?.[cls] || {}
  const raceMod = cc.raceMods?.[race] || {}

  const form = { name: '', class: cls, race: race, level: level, hp: 10, maxHp: 10 }
  for (const attr of (cc.attributes || [])) {
    form[attr.key] = Math.max(0, base + (clsMod[attr.key] || 0) + (raceMod[attr.key] || 0))
  }
  if (classToPathway.value) { form.pathway = classToPathway.value[form.class] || '' }
  return form
}

const newCharForm = ref(createDefaultForm())

/** 随机角色生成 — 仅随机名/职业/种族，属性由修饰值决定 */
function randomizeCharacter() {
  const cc = charCreation.value
  if (!cc) return
  const classes = cc.classes || []
  const races = cc.races || []
  if (!classes.length) return
  const pickedClass = classes[Math.floor(Math.random() * classes.length)]
  const pickedRace = races.length ? races[Math.floor(Math.random() * races.length)] : '人类'

  const firsts = cc.namePool?.first || ['冒险者']
  const lasts = cc.namePool?.last || ['']
  const name = firsts[Math.floor(Math.random() * firsts.length)] + '·' + lasts[Math.floor(Math.random() * lasts.length)]

  const base = cc.attrBase || 3
  const clsMod = cc.classMods?.[pickedClass] || {}
  const raceMod = cc.raceMods?.[pickedRace] || {}
  const attrs = cc.attributes || []
  const level = cc.fixedLevel ?? cc.defaultLevel ?? 1

  const form = { name, class: pickedClass, race: pickedRace, level: level, hp: 10, maxHp: 10 }
  for (const attr of attrs) {
    form[attr.key] = Math.max(0, base + (clsMod[attr.key] || 0) + (raceMod[attr.key] || 0))
  }
  if (cc.classToPathway) { form.pathway = cc.classToPathway[pickedClass] || '' }
  newCharForm.value = form
}

// 加载中的预置角色列表
const presetChars = computed(() => (props.module?.premadeCharacters || []))

onMounted(() => {
  startInitialization().catch(err => {
    console.error('ModuleInitModal init error:', err)
    aiErrorMsg.value = '初始化失败: ' + (err.message || err)
    phase.value = 'character_select' // 允许用户在错误后继续
  })
})

/** 完整初始化流程 */
async function startInitialization() {
  phase.value = 'init'

  // Step 1: 创建会话（绑定模组ID）
  const modApi = await getModuleApi()
  const params = modApi.moduleToSessionParams(props.module)
  params.moduleId = props.module.id
  initProgress.value = '正在创建冒险会话...'
  await sessionStore.createSession(params)
  const sessionId = sessionStore.currentSessionId

  if (!sessionId) {
    aiErrorMsg.value = '创建会话失败，请重试'
    return
  }

  // Step 2: 导入世界观条目
  const loreEntries = modApi.getModuleWorldLore(props.module)
  console.log('[ModuleInit] 导入世界观条目:', loreEntries.length, '条, sessionId:', sessionId)
  if (loreEntries.length > 0) {
    initProgress.value = '正在导入世界观设定...'
    for (const entry of loreEntries) {
      try {
        await worldStore.addEntry(sessionId, entry)
        console.log('[ModuleInit] 已导入:', entry.title, '→', entry.category)
      } catch (e) {
        console.error('[ModuleInit] 导入条目失败:', entry.title, e)
      }
    }
    // 导入完成后强制刷新 worldStore
    await worldStore.loadWorldData(sessionId)
    console.log('[ModuleInit] 世界观导入完成, 当前条目数:', worldStore.entries.length)
  }

  // Step 3: 添加系统消息
  initProgress.value = '正在构建游戏上下文...'
  await chatStore.addMessage({
    sessionId,
    role: 'system',
    content: `[模组] ${props.module.name} · ${props.module.system}\n背景：${props.module.background}\n设定：${props.module.setting}`,
    type: 'system'
  })

  // Step 4: 调用 AI 生成开场叙述
  phase.value = 'ai_generating'

  const hasApiKey = !!getApiKey()
  if (!hasApiKey) {
    // 无 API Key 时使用本地生成的默认开场
    initProgress.value = '未检测到 API Key，使用本地默认开场...'
    await simulateLocalNarration()
  } else {
    // 有 API Key，调用流式 API
    initProgress.value = 'AI 正在构思冒险开场...'
    await generateAINarration(sessionId)
  }

  // Step 5: 进入角色选择阶段
  phase.value = 'character_select'

  // 自动加载已有角色
  await characterStore.loadCharacters(sessionId)

  // 如果没有角色且有预置角色，自动导入预置角色
  if (characterStore.characters.length === 0 && presetChars.value.length > 0) {
    for (const charData of presetChars.value) {
      await characterStore.createCharacter(sessionId, charData)
    }
    await characterStore.loadCharacters(sessionId)
  }
}

/** 本地模拟开场叙述（无 API Key 时使用，现因已内置API Key通常不会被调用） */
async function simulateLocalNarration() {
  const mod = props.module
  const lines = [
    `《${mod.name}》`,
    `${mod.system} · ${mod.levelRange}`,
    '',
    `${mod.background}`,
    '',
    `冒险的舞台：${mod.setting}。`,
    '',
    `你环顾四周，空气中弥漫着冒险的气息。`,
    `远处有什么在召唤着你——`,
    `也许是命运，也许是危险，也许是宝藏。`,
    '',
    '---',
    '',
    '现在，选择你的冒险者角色。然后点击「开始冒险」，',
    'AI 将作为你的 DM，引领你进入这个等待探索的世界。',
    '',
    '你的故事即将开始。准备好了吗？'
  ]

  for (const line of lines) {
    aiNarration.value += line + '\n'
    await new Promise(r => setTimeout(r, 25))
    await nextTick()
  }

  await chatStore.addMessage({
    sessionId: sessionStore.currentSessionId,
    role: 'assistant',
    content: aiNarration.value,
    type: 'chat'
  })

  phase.value = 'ai_done'
}

/** 调用 DeepSeek API 生成 AI 开场叙述 */
async function generateAINarration(sessionId) {
  aiErrorMsg.value = ''
  const mod = props.module

  // 构建 NPC 列表文本
  const npcText = (mod.npcs || []).slice(0, 6).map(n =>
    `- ${n.name}：${n.race} ${n.class}，${n.role}。${n.traits}。${n.notes || ''}`
  ).join('\n')

  const systemPrompt = `你是一位经验丰富的 TRPG 游戏主持人 (DM/GM)。
你的 DM 风格：沉浸式叙述、主动引导玩家、营造戏剧张力、适时引入挑战。

你正在主持一场《${mod.name}》的跑团冒险。

# 模组信息
- 系统：${mod.system}
- 等级范围：${mod.levelRange}
- 背景：${mod.background}
- 场景：${mod.setting}
- 主题：${(mod.themes || []).join('、')}
- 预估时长：${mod.estimatedSessions || '多场会话'}

# 主要NPC
${npcText || '无预设NPC'}

# 重要地点
${(mod.locations || []).slice(0, 4).map(l => `- ${l.name}：${l.description}`).join('\n')}

# 你的任务
为玩家们写一段精彩的冒险开场叙述。要求：
1. 以第二人称「你」直接称呼玩家，营造代入感
2. 用生动的感官细节描绘当前场景——玩家看到什么、听到什么、闻到什么
3. 迅速建立故事冲突或悬念——不要平铺直叙
4. 引入至少一个NPC或事件来驱动故事
5. **最重要**：结尾必须给玩家一个明确的选择或行动提示，如「你要怎么做？」「你选择哪条路？」「你注意到___，你想调查吗？」

语气要有画面感和戏剧张力。使用中文。控制在400-600字。`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请开始《${mod.name}》的冒险开场。用第二人称直接引导玩家进入故事。` }
  ]

  let abortController = new AbortController()

  await streamChat(messages, {
    onToken: (token) => {
      aiNarration.value += token
    },
    onDone: async () => {
      phase.value = 'ai_done'
      // 保存 AI 开场到聊天记录
      await chatStore.addMessage({
        sessionId,
        role: 'assistant',
        content: aiNarration.value,
        type: 'chat'
      })
    },
    onError: async (err) => {
      aiErrorMsg.value = `AI 生成失败: ${err.message}，使用默认开场`
      await simulateLocalNarration()
    },
    signal: abortController.signal
  })
}

/** 切换角色选中 */
function toggleCharacter(charId) {
  const s = new Set(selectedCharIds.value)
  if (s.has(charId)) {
    s.delete(charId)
  } else {
    s.add(charId)
  }
  selectedCharIds.value = s
}

/** 快速创建新角色 */
async function createNewCharacter() {
  if (!newCharForm.value.name.trim()) return
  // 使用当前计算出的属性值（职业+种族+自定义覆盖）
  const cc = charCreation.value
  const base = cc.attrBase || 3
  for (const attr of (cc.attributes || [])) {
    newCharForm.value[attr.key] = currentCombinedAttrs.value[attr.key] ?? (attr.default || base)
  }
  if (classToPathway.value && newCharForm.value.class) {
    newCharForm.value.pathway = classToPathway.value[newCharForm.value.class] || ''
  }
  if (cc.fixedLevel != null) {
    newCharForm.value.level = cc.fixedLevel
  }
  await characterStore.createCharacter(sessionStore.currentSessionId, newCharForm.value)
  await characterStore.loadCharacters(sessionStore.currentSessionId)

  // 自动选中新创建的角色
  const newChar = characterStore.characters[characterStore.characters.length - 1]
  if (newChar) {
    const s = new Set(selectedCharIds.value)
    s.add(newChar.id)
    selectedCharIds.value = s
  }

  newCharForm.value = createDefaultForm()
  showCreateForm.value = false
}

// 悬停预览状态
const hoverType = ref(null) // 'class' | 'race'
const hoverValue = ref(null)
const customAttrsStore = useCustomAttrsStore()

/** 获取合并后的模组修饰（默认+自定义覆盖） */
const effectiveClassMods = computed(() =>
  customAttrsStore.getClassMods(props.module?.id, charCreation.value?.classMods || {}))
const effectiveRaceMods = computed(() =>
  customAttrsStore.getRaceMods(props.module?.id, charCreation.value?.raceMods || {}))

/** 雷达预览：悬停职业只显示职业加成，悬停种族只显示种族加成，无悬停显示组合 */
const previewAttrs = computed(() => {
  const cc = charCreation.value
  const base = cc.attrBase || 3
  const attrs = {}
  for (const a of cc.attributes || []) attrs[a.key] = base

  if (hoverType.value === 'class') {
    // 仅显示悬停职业的加成
    const clsMod = effectiveClassMods.value[hoverValue.value] || {}
    for (const [k, v] of Object.entries(clsMod)) attrs[k] = (attrs[k] || base) + v
  } else if (hoverType.value === 'race') {
    // 仅显示悬停种族的加成
    const raceMod = effectiveRaceMods.value[hoverValue.value] || {}
    for (const [k, v] of Object.entries(raceMod)) attrs[k] = (attrs[k] || base) + v
  }
  // 无悬停时不返回预览
  for (const k of Object.keys(attrs)) attrs[k] = Math.max(0, attrs[k])
  return attrs
})

/** 当前选中组合的属性（用于无悬停时的雷达显示） */
const currentCombinedAttrs = computed(() => {
  const cc = charCreation.value
  const base = cc.attrBase || 3
  const attrs = {}
  for (const a of cc.attributes || []) attrs[a.key] = base
  const clsMod = effectiveClassMods.value[newCharForm.value.class] || {}
  const raceMod = effectiveRaceMods.value[newCharForm.value.race] || {}
  for (const [k, v] of Object.entries(clsMod)) attrs[k] = (attrs[k] || base) + v
  for (const [k, v] of Object.entries(raceMod)) attrs[k] = (attrs[k] || base) + v
  for (const k of Object.keys(attrs)) attrs[k] = Math.max(0, attrs[k])
  return attrs
})

function onHoverClass(cls) { hoverType.value = 'class'; hoverValue.value = cls }
function onHoverRace(race) { hoverType.value = 'race'; hoverValue.value = race }
function onHoverEnd() { hoverType.value = null; hoverValue.value = null }

/** 打开创建表单 */
function openCreateForm() {
  newCharForm.value = createDefaultForm()
  showCreateForm.value = true
}

/** 完成初始化，开始冒险 */
async function startAdventure() {
  try {
  const sessionId = sessionStore.currentSessionId

  // 添加角色加入的系统消息
  const selectedChars = characterStore.characters.filter(c => selectedCharIds.value.has(c.id))
  const charNames = selectedChars.map(c => `${c.name}(${c.race} ${c.class})`).join('、')

  if (charNames) {
    await chatStore.addMessage({
      sessionId,
      role: 'system',
      content: `冒险者队伍：${charNames}，准备踏上冒险之旅。`,
      type: 'system'
    })
  }

  // 如果有 API Key，让 AI 基于选中的角色给出进一步的引导
  const hasApiKey = !!getApiKey()
  if (hasApiKey && charNames) {
    phase.value = 'ai_generating'
    initProgress.value = 'AI 正在根据你的队伍生成定制化引导...'

    const guideMessages = [
      { role: 'system', content: `你的玩家选择了以下角色：${charNames}。请针对这些角色的特点和能力，给出接下来具体的冒险指引和初始行动选项。控制在150字以内。` },
      { role: 'user', content: `我选择的队伍是：${charNames}。请引导我们开始冒险。` }
    ]

    let guideText = ''
    let abortController = new AbortController()

    await streamChat(guideMessages, {
      onToken: (token) => { guideText += token },
      onDone: async () => {
        if (guideText.trim()) {
          await chatStore.addMessage({
            sessionId,
            role: 'assistant',
            content: guideText,
            type: 'chat'
          })
        }
      },
      onError: () => { /* 静默处理 */ },
      signal: abortController.signal
    })
  }

  // 绑定模组上下文 — 激活模块隔离
  const moduleCtxStore = useModuleContextStore()
  moduleCtxStore.bindModule(props.module)

  // 初始化游戏日期（仅首次，随机起始）
  const dayCycle = useDayCycleStore()
  if (dayCycle.dayCount === 0) {
    dayCycle.randomizeStartDate()
    await chatStore.addMessage({
      sessionId,
      role: 'system',
      content: `📅 **冒险开始** — ${dayCycle.dateString}\n天空中的星辰预示着一段传奇的序幕。`,
      type: 'system'
    })
  }

  // 激活游戏
  await sessionStore.activateGame(sessionId)

  // 跳转到游戏页面
  ui.setPage('game')
  emit('complete')
  } catch (e) {
    console.error('startAdventure error:', e)
    aiErrorMsg.value = '启动冒险失败: ' + (e.message || e)
  }
}

/** 跳过着色创建，直接开始 */
function skipCharacterSelect() {
  // 如果没有选中任何角色，默认全选
  if (selectedCharIds.value.size === 0) {
    const s = new Set()
    characterStore.characters.forEach(c => s.add(c.id))
    selectedCharIds.value = s
  }
  startAdventure()
}

// 属性选项
const statKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const statLabels = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }

// 获取角色头像色
function charColor(name) {
  let hash = 0
  for (const c of name || '?') hash = ((hash << 5) - hash) + c.charCodeAt(0)
  return `hsl(${Math.abs(hash) % 360}, 20%, 55%)`
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" @click.self="emit('close')">
      <CardWrapper class="w-[720px] max-h-[85vh] overflow-y-auto p-0 flex flex-col">
        <!-- 顶部标题栏 -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-[#E8E2D8]">
          <div class="flex items-center gap-3">
            <CompassLogo />
            <div>
              <h2 class="text-lg text-ink-primary font-medium">{{ module.name }}</h2>
              <p class="text-[10px] text-ink-muted">{{ module.system }} · {{ module.levelRange }}</p>
            </div>
          </div>
          <!-- 进度指示 -->
          <div class="flex items-center gap-3">
            <div class="flex gap-1.5">
              <span
                v-for="(label, key) in phaseMessages"
                :key="key"
                class="w-2 h-2 rounded-full transition-colors"
                :class="{
                  'bg-[#5A5550]': phase === key,
                  'bg-[#D8D2C8]': phase !== key && phase !== Object.keys(phaseMessages)[Object.keys(phaseMessages).indexOf(phase)] ,
                  'bg-[#E8E2D8]': false
                }"
                :style="{ backgroundColor: Object.keys(phaseMessages).indexOf(key) <= Object.keys(phaseMessages).indexOf(phase) ? '#5A5550' : '#E8E2D8' }"
              />
            </div>
            <span class="text-[10px] text-ink-muted">{{ phaseMessages[phase] }}</span>
          </div>
        </div>

        <!-- 主体内容区 -->
        <div class="flex-1 overflow-y-auto p-6 space-y-4">
          <!-- 初始化进度 + AI 叙述 -->
          <div v-if="phase === 'init' || phase === 'ai_generating'" class="space-y-4">
            <div class="flex items-center gap-3 text-sm text-ink-secondary">
              <DiceIcon :size="20" :rolling="phase === 'ai_generating'" />
              <span>{{ initProgress }}</span>
            </div>

            <!-- AI 流式输出区 -->
            <div
              v-if="aiNarration"
              class="bg-[#F5F0E8] rounded-lg p-4 max-h-[300px] overflow-y-auto"
            >
              <div class="text-[10px] text-ink-muted mb-2">DM 开场叙述</div>
              <div class="text-sm text-ink-primary leading-relaxed whitespace-pre-wrap">
                {{ aiNarration }}
                <span v-if="phase === 'ai_generating'" class="cursor-blink" />
              </div>
            </div>

            <!-- 错误提示 -->
            <div v-if="aiErrorMsg" class="bg-red-50 text-red-500 text-xs p-3 rounded-lg">
              {{ aiErrorMsg }}
            </div>

            <!-- 等待中 -->
            <div v-if="!aiNarration && phase === 'ai_generating'" class="flex flex-col items-center py-8 text-ink-muted">
              <DiceIcon :size="48" :rolling="true" class="opacity-30 mb-3" />
              <p class="text-sm">AI 正在创作冒险开场...</p>
              <p class="text-xs mt-1">这可能需要几秒钟</p>
            </div>
          </div>

          <!-- 角色选择 -->
          <div v-if="phase === 'character_select' || phase === 'ai_done' || phase === 'ready'">
            <!-- AI 开场叙事预览（可折叠） -->
            <details v-if="aiNarration" class="mb-4" open>
              <summary class="text-sm text-ink-secondary cursor-pointer tracking-wide">
                DM 开场叙述 {{ phase === 'character_select' ? '(已生成)' : '' }}
              </summary>
              <div class="bg-[#F5F0E8] rounded-lg p-4 mt-2 max-h-[200px] overflow-y-auto">
                <div class="text-sm text-ink-primary leading-relaxed whitespace-pre-wrap">{{ aiNarration }}</div>
              </div>
            </details>

            <h3 class="text-sm text-ink-secondary tracking-wide">
              选择冒险者角色
              <span class="text-xs text-ink-muted ml-2">
                (已选 {{ selectedCharIds.size }} 人)
              </span>
            </h3>

            <!-- 预置角色 / 已有角色 列表 -->
            <div class="grid grid-cols-2 gap-3 mt-3">
              <div
                v-for="char in characterStore.characters"
                :key="char.id"
                class="p-3 rounded-lg border cursor-pointer transition-all"
                :class="selectedCharIds.has(char.id)
                  ? 'border-[#5A5550] bg-[#F5F0E8] ring-1 ring-[#5A5550]/20'
                  : 'border-[#D8D2C8] hover:bg-[#FAF7F2]'"
                @click="toggleCharacter(char.id)"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-10 h-10 rounded-full flex items-center justify-center text-[#FAF7F2] text-sm flex-shrink-0"
                    :style="{ backgroundColor: charColor(char.name) }"
                  >
                    {{ char.name.charAt(0) }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1">
                      <span class="text-sm text-ink-primary font-medium">{{ char.name }}</span>
                      <span
                        v-if="selectedCharIds.has(char.id)"
                        class="text-[10px] text-[#5A7A5A]"
                      >✓ 已选</span>
                    </div>
                    <p class="text-[10px] text-ink-muted">
                      {{ char.race }} · {{ char.class }}
                      <span v-if="char.pathway"> · {{ char.pathway }}</span>
                      · Lv.{{ char.level || char.sequence9 ? '序列' : '' }}{{ char.level }}
                    </p>
                    <!-- 属性缩略 -->
                    <div class="flex gap-2 mt-1">
                      <span class="text-[9px] text-ink-muted" v-if="char.str">力{{ char.str }}</span>
                      <span class="text-[9px] text-ink-muted" v-if="char.dex">敏{{ char.dex }}</span>
                      <span class="text-[9px] text-ink-muted" v-if="char.int">智{{ char.int }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 空状态 -->
              <div v-if="characterStore.characters.length === 0" class="col-span-2 text-center py-6 text-xs text-ink-muted">
                暂无角色，请创建或等待预置角色加载
              </div>
            </div>

            <!-- 新建角色按钮 / 折叠表单 -->
            <div class="mt-3">
              <button
                v-if="!showCreateForm"
                class="text-xs text-ink-muted hover:text-ink-primary transition-colors"
                @click="openCreateForm"
              >
                + 创建新角色
              </button>

              <div v-if="showCreateForm" class="bg-[#F5F0E8] rounded-lg p-4 mt-2 space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-[10px] text-ink-muted">创建角色</span>
                  <button class="text-[10px] text-ink-muted hover:text-ink-primary border border-[#D8D2C8] px-2 py-0.5 rounded" @click="randomizeCharacter">
                    🎲 随机生成
                  </button>
                </div>

                <!-- 雷达图 + 表单 -->
                <div class="flex gap-4">
                  <!-- 属性雷达图 -->
                  <div class="flex-shrink-0 flex flex-col items-center">
                    <MiniRadar
                      :attributes="attributes"
                      :values="currentCombinedAttrs"
                      :preview-values="hoverType ? previewAttrs : null"
                      :show-preview="!!hoverType"
                      :size="150"
                    />
                    <p class="text-[9px] mt-1"
                      :class="hoverType ? 'text-[#5A7A5A]' : 'text-ink-muted/50'"
                    >
                      <template v-if="hoverType === 'class'">仅{{ hoverValue }}加成</template>
                      <template v-else-if="hoverType === 'race'">仅{{ hoverValue }}加成</template>
                      <template v-else>职业+种族合计</template>
                      <span class="text-ink-muted/30">· 总{{ totalAttrPoints }}</span>
                    </p>
                  </div>

                  <!-- 表单字段 -->
                  <div class="flex-1 space-y-2">
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <label class="text-[10px] text-ink-muted">名称</label>
                        <input v-model="newCharForm.name" class="input-parchment w-full text-xs" placeholder="角色名" />
                      </div>
                      <div>
                        <label class="text-[10px] text-ink-muted">{{ hideLevelSelector ? '序列9魔药' : '职业' }}</label>
                        <select
                          v-model="newCharForm.class"
                          class="input-parchment w-full text-xs"
                          @mouseenter="onHoverClass($event.target.value)"
                          @mouseleave="onHoverEnd"
                        >
                          <option v-for="c in charCreation.classes" :key="c" :value="c">{{ c }}</option>
                        </select>
                      </div>
                      <div>
                        <label class="text-[10px] text-ink-muted">种族</label>
                        <select
                          v-model="newCharForm.race"
                          class="input-parchment w-full text-xs"
                          @mouseenter="onHoverRace($event.target.value)"
                          @mouseleave="onHoverEnd"
                        >
                          <option v-for="r in charCreation.races" :key="r" :value="r">{{ r }}</option>
                        </select>
                      </div>
                      <div v-if="!hideLevelSelector">
                        <label class="text-[10px] text-ink-muted">{{ statLabel }}</label>
                        <input v-model.number="newCharForm.level" type="number" :min="statMin" :max="statMax" class="input-parchment w-full text-xs" />
                      </div>
                      <div v-else>
                        <label class="text-[10px] text-ink-muted">初始序列</label>
                        <div class="text-xs text-ink-primary py-1.5">序列{{ charCreation.fixedLevel }}</div>
                      </div>
                      <div v-if="classToPathway && newCharForm.class">
                        <label class="text-[10px] text-ink-muted">神之途径</label>
                        <div class="text-xs text-ink-primary py-1.5">{{ classToPathway[newCharForm.class] || '—' }}</div>
                      </div>
                    </div>

                    <!-- 属性数值（只读参考） -->
                    <div class="border-t border-[#D8D2C8] pt-2">
                      <p class="text-[9px] text-ink-muted/50 mb-1">初始属性（由职业+种族决定，不可手动更改）</p>
                      <div class="grid grid-cols-3 gap-x-2 gap-y-1">
                        <div v-for="attr in attributes" :key="attr.key" class="flex items-center gap-1">
                          <span class="text-[9px] text-ink-muted w-8" :title="attr.desc">{{ attr.label }}</span>
                          <span class="text-xs text-ink-primary font-medium w-full text-center py-0.5 bg-[#FAF7F2] rounded">{{ currentCombinedAttrs[attr.key] ?? 0 }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- 特殊技能/天赋提示 -->
                    <div v-if="charCreation.specialSkills?.[newCharForm.class]" class="text-[9px] text-ink-muted">
                      ⚡ {{ charCreation.specialSkills[newCharForm.class][0] }}
                    </div>
                    <div v-if="charCreation.specialTalents?.[newCharForm.race]" class="text-[9px] text-ink-muted">
                      ✦ {{ charCreation.specialTalents[newCharForm.race][0] }}
                    </div>
                  </div>
                </div>

                <p class="text-[9px] text-ink-muted">
                  「{{ props.module.name }}」· 职业和种族决定属性分配，悬停选项预览雷达图
                </p>
                <button class="btn-primary text-xs w-full" @click="createNewCharacter">创建并选中</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部操作栏 -->
        <div class="px-6 py-4 border-t border-[#E8E2D8] flex justify-between items-center">
          <div>
            <span v-if="phase === 'ai_generating'" class="text-xs text-ink-muted">
              {{ getApiKey() ? 'AI 正在生成内容...' : '使用本地默认开场...' }}
            </span>
          </div>
          <div class="flex gap-3">
            <button class="btn-ghost text-sm" @click="emit('close')">
              {{ phase === 'character_select' || phase === 'ready' ? '返回' : '取消' }}
            </button>
            <button
              v-if="phase === 'character_select' || phase === 'ai_done' || phase === 'ready'"
              class="btn-primary text-sm tracking-wider"
              @click="startAdventure"
            >
              开始冒险！
            </button>
            <button
              v-if="phase === 'character_select' && characterStore.characters.length === 0"
              class="btn-ghost text-xs"
              @click="skipCharacterSelect"
            >
              跳过，直接开始
            </button>
          </div>
        </div>
      </CardWrapper>
    </div>
  </Teleport>
</template>
