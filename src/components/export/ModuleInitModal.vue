<script setup>
// 模组初始化弹窗 - 完整的模组启动流程
import { ref, computed, watch, onMounted } from 'vue'
import { useSessionStore } from '../../stores/session.js'
import { useCharacterStore } from '../../stores/character.js'
import { useChatStore } from '../../stores/chat.js'
import { useWorldStore } from '../../stores/world.js'
import { useUIStore } from '../../stores/ui.js'
import { useModuleContextStore } from '../../stores/moduleContext.js'
import { useDayCycleStore } from '../../stores/dayCycle.js'
import { useCustomAttrsStore } from '../../stores/customAttrs.js'
import { streamChat, getApiKey } from '../../services/deepseek.js'
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

// 流程阶段: 'init' | 'character_select'
const phase = ref('init')
const phaseMessages = {
  init: '准备初始化...',
  character_select: '选择冒险角色'
}

// 初始化状态
const aiErrorMsg = ref('')
const initProgress = ref('正在准备冒险会话...')

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
  const pickedFirst = firsts[Math.floor(Math.random() * firsts.length)]
  const pickedLast = lasts[Math.floor(Math.random() * lasts.length)]
  const name = pickedFirst + '·' + pickedLast

  // 检查是否为特殊姓氏
  const specialSurnames = cc.specialSurnames || {}
  const surnameMeaning = specialSurnames[pickedLast] || null

  const base = cc.attrBase || 3
  const clsMod = cc.classMods?.[pickedClass] || {}
  const raceMod = cc.raceMods?.[pickedRace] || {}
  const attrs = cc.attributes || []
  const level = cc.fixedLevel ?? cc.defaultLevel ?? 1

  const form = { name, class: pickedClass, race: pickedRace, level: level, hp: 10, maxHp: 10 }
  if (surnameMeaning) form.surnameMeaning = surnameMeaning
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

/** 完整初始化流程（开场白延后到进入游戏页面后根据角色生成） */
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
  if (loreEntries.length > 0) {
    initProgress.value = '正在导入世界观设定...'
    for (const entry of loreEntries) {
      try {
        await worldStore.addEntry(sessionId, entry)
      } catch (e) {
        console.error('[ModuleInit] 导入条目失败:', entry.title, e)
      }
    }
    await worldStore.loadWorldData(sessionId)
  }

  // Step 2.5: 导入特殊姓氏为世界观条目
  const specialSurnames = modApi.getModuleSpecialSurnames(props.module)
  if (Object.keys(specialSurnames).length > 0) {
    initProgress.value = '正在记录世家谱系...'
    for (const [surname, meaning] of Object.entries(specialSurnames)) {
      try {
        await worldStore.addEntry(sessionId, {
          category: '家族姓氏',
          title: `「${surname}」家族`,
          content: meaning,
          tags: ['特殊姓氏', '贵族', '家族'],
          icon: '🛡️'
        })
      } catch (e) {
        console.error('[ModuleInit] 导入特殊姓氏失败:', surname, e)
      }
    }
    await worldStore.loadWorldData(sessionId)
  }

  // Step 3: 添加系统消息
  initProgress.value = '正在构建游戏上下文...'
  await chatStore.addMessage({
    sessionId,
    role: 'system',
    content: `[模组] ${props.module.name} · ${props.module.system}\n背景：${props.module.background}\n设定：${props.module.setting}`,
    type: 'system'
  })

  // Step 4: 直接进入角色选择（开场白延后到 GamePage 根据选中角色生成）
  phase.value = 'character_select'

  // 自动加载已有角色
  await characterStore.loadCharacters(sessionId)

  // 如果没有角色且有预置角色，自动导入预置角色（先AI分析再创建）
  if (characterStore.characters.length === 0 && presetChars.value.length > 0) {
    for (const charData of presetChars.value) {
      await enrichCharacterBackground(charData)
      await characterStore.createCharacter(sessionId, charData)
    }
    await characterStore.loadCharacters(sessionId)
  }
}

/** AI 分析角色生成个性化背景故事 */
async function enrichCharacterBackground(charData) {
  const hasApiKey = !!getApiKey()
  if (!hasApiKey) {
    charData.background = `${charData.race} ${charData.class}，踏上冒险之路。`
    return charData
  }
  const mod = props.module
  const surnameInfo = charData.surnameMeaning ? `\n- 特殊家族背景：${charData.surnameMeaning}` : ''
  const prompt = `你是一位 TRPG 角色背景创作助手。请为以下角色创作一句简短的背景设定（30-50字），描述其身份来历和冒险动机：

角色名：${charData.name}
种族：${charData.race}
职业：${charData.class}
${charData.pathway ? '途径：' + charData.pathway : ''}${surnameInfo}
模组：${mod.name}（${mod.system}）

只需返回一句简洁的背景描述（30-50字），不要加引号或额外说明。`
  const messages = [
    { role: 'system', content: '你是 TRPG 角色背景创作助手。只返回一句简短背景描述。' },
    { role: 'user', content: prompt }
  ]
  let result = ''
  try {
    await streamChat(messages, {
      onToken: (token) => { result += token },
      onDone: () => {},
      onError: () => { result = '' }
    })
    charData.background = result.trim() || `${charData.race} ${charData.class}，踏上冒险之路。`
  } catch {
    charData.background = `${charData.race} ${charData.class}，踏上冒险之路。`
  }
  return charData
}

/** 创建角色并直接开始游戏（带表单验证） */
async function createAndStart() {
  aiErrorMsg.value = ''
  const form = newCharForm.value
  const cc = charCreation.value

  // 验证必填字段
  if (!form.name || !form.name.trim()) {
    aiErrorMsg.value = '请输入角色名字'
    return
  }
  if (!form.class) {
    aiErrorMsg.value = '请选择职业'
    return
  }
  if (!form.race) {
    aiErrorMsg.value = '请选择种族'
    return
  }
  // 属性计算和途径设置
  const base = cc.attrBase || 3
  for (const attr of (cc.attributes || [])) {
    form[attr.key] = currentCombinedAttrs.value[attr.key] ?? (attr.default || base)
  }
  if (classToPathway.value && form.class) {
    form.pathway = classToPathway.value[form.class] || ''
  }
  if (cc.fixedLevel != null) {
    form.level = cc.fixedLevel
  }
  // 检查特殊姓氏
  const nameParts = form.name.split('·')
  if (nameParts.length >= 2) {
    const lastName = nameParts[nameParts.length - 1]
    const specialSurnames = cc.specialSurnames || {}
    if (specialSurnames[lastName]) {
      form.surnameMeaning = specialSurnames[lastName]
    }
  }
  // AI 分析角色背景
  aiErrorMsg.value = ''
  try {
    await enrichCharacterBackground(form)
    await characterStore.createCharacter(sessionStore.currentSessionId, form)
    await characterStore.loadCharacters(sessionStore.currentSessionId)
  } catch (e) {
    aiErrorMsg.value = '创建角色失败: ' + (e.message || e)
    return
  }

  // 选中新创建的角色
  const newChar = characterStore.characters[characterStore.characters.length - 1]
  if (newChar) {
    const s = new Set(selectedCharIds.value)
    s.add(newChar.id)
    selectedCharIds.value = s
  }

  newCharForm.value = createDefaultForm()
  showCreateForm.value = false
  // 直接开始冒险
  await startAdventure()
}

/** 选中已有角色并开始游戏 */
async function startWithExistingChar(charId) {
  const s = new Set([charId])
  selectedCharIds.value = s
  await startAdventure()
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
  // 检查手动输入的名字是否包含特殊姓氏
  const nameParts = newCharForm.value.name.split('·')
  if (nameParts.length >= 2) {
    const lastName = nameParts[nameParts.length - 1]
    const specialSurnames = cc.specialSurnames || {}
    if (specialSurnames[lastName]) {
      newCharForm.value.surnameMeaning = specialSurnames[lastName]
    }
  }
  // AI 分析角色背景
  await enrichCharacterBackground(newCharForm.value)
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
  // 禁止无角色进入游戏
  if (characterStore.characters.length === 0) {
    aiErrorMsg.value = '请先创建或选择至少一个角色再开始冒险'
    return
  }
  try {
  const sessionId = sessionStore.currentSessionId
  const mod = props.module

  // Step 1: 展示模组 + 角色基本信息（名字、种族、职业，不含属性）
  const selectedChars = characterStore.characters.filter(c => selectedCharIds.value.has(c.id))
  const charLines = selectedChars.map(c => `- ${c.name}（${c.race} ${c.class}）`).join('\n')

  await chatStore.addMessage({
    sessionId,
    role: 'system',
    content: `[模组] 《${mod.name}》· ${mod.system}\n[冒险者]\n${charLines || '（无角色）'}`,
    type: 'system'
  })

  // 绑定模组上下文 — 激活模块隔离（开场白延后到 GamePage 根据角色生成）
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
            <button v-if="phase === 'character_select'" class="btn-ghost text-xs px-2 py-1 mr-1" @click="emit('close')">← 返回</button>
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
          <!-- 初始化进度 -->
          <div v-if="phase === 'init'" class="space-y-4">
            <div class="flex items-center gap-3 text-sm text-ink-secondary">
              <DiceIcon :size="20" />
              <span>{{ initProgress }}</span>
            </div>

            <!-- 错误提示 -->
            <div v-if="aiErrorMsg" class="bg-red-50 text-red-500 text-xs p-3 rounded-lg">
              {{ aiErrorMsg }}
            </div>
          </div>

          <!-- 角色选择 -->
          <div v-if="phase === 'character_select'">
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
                    <div class="flex gap-2 mt-1 mb-2">
                      <span class="text-[9px] text-ink-muted" v-if="char.str">力{{ char.str }}</span>
                      <span class="text-[9px] text-ink-muted" v-if="char.dex">敏{{ char.dex }}</span>
                      <span class="text-[9px] text-ink-muted" v-if="char.int">智{{ char.int }}</span>
                    </div>
                    <button
                      class="text-[10px] w-full py-1 rounded border border-[#5A5550]/30 text-[#5A5550] hover:bg-[#5A5550] hover:text-[#F5F0E8] transition-colors"
                      @click.stop="startWithExistingChar(char.id)"
                    >加入冒险</button>
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
                        <div v-if="effectiveClassMods[newCharForm.class]" class="flex flex-wrap gap-0.5 mt-0.5">
                          <span v-for="(v, k) in effectiveClassMods[newCharForm.class]" :key="k" class="text-[7px] px-1 rounded" :class="v >= 0 ? 'bg-[#5A7A5A]/10 text-[#5A7A5A]' : 'bg-red-100 text-red-400'">{{ attributes.find(a=>a.key===k)?.label||k }}{{ v>=0?'+':'' }}{{ v }}</span>
                        </div>
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
                        <div v-if="effectiveRaceMods[newCharForm.race]" class="flex flex-wrap gap-0.5 mt-0.5">
                          <span v-for="(v, k) in effectiveRaceMods[newCharForm.race]" :key="k" class="text-[7px] px-1 rounded" :class="v >= 0 ? 'bg-[#5A7A5A]/10 text-[#5A7A5A]' : 'bg-red-100 text-red-400'">{{ attributes.find(a=>a.key===k)?.label||k }}{{ v>=0?'+':'' }}{{ v }}</span>
                        </div>
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

                    <!-- 属性数值（含职业/种族加成明细） -->
                    <div class="border-t border-[#D8D2C8] pt-2">
                      <p class="text-[9px] text-ink-muted/50 mb-2">初始属性 = 基础值 + 职业加成 + 种族加成</p>
                      <div class="space-y-1">
                        <div v-for="attr in attributes" :key="attr.key" class="flex items-center gap-1 text-[9px]">
                          <span class="text-ink-muted w-8" :title="attr.desc">{{ attr.label }}</span>
                          <span class="font-medium w-6 text-center text-ink-primary">{{ currentCombinedAttrs[attr.key] ?? 0 }}</span>
                          <span class="text-ink-muted/40">= {{ charCreation.attrBase || 3 }}</span>
                          <span
                            :class="(effectiveClassMods[newCharForm.class]?.[attr.key] || 0) >= 0 ? 'text-[#5A7A5A]' : 'text-red-400'"
                          >{{ (effectiveClassMods[newCharForm.class]?.[attr.key] || 0) >= 0 ? '+' : '' }}{{ effectiveClassMods[newCharForm.class]?.[attr.key] || 0 }} <span class="text-ink-muted/30">职</span></span>
                          <span
                            :class="(effectiveRaceMods[newCharForm.race]?.[attr.key] || 0) >= 0 ? 'text-[#5A7A5A]' : 'text-red-400'"
                          >{{ (effectiveRaceMods[newCharForm.race]?.[attr.key] || 0) >= 0 ? '+' : '' }}{{ effectiveRaceMods[newCharForm.race]?.[attr.key] || 0 }} <span class="text-ink-muted/30">族</span></span>
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
                <button class="btn-primary text-sm w-full py-2.5 tracking-wider" @click="createAndStart">以此角色加入游戏</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部提示区 -->
        <div v-if="aiErrorMsg" class="px-6 py-3 border-t border-[#E8E2D8]">
          <p class="text-xs text-red-500 text-center">{{ aiErrorMsg }}</p>
        </div>
      </CardWrapper>
    </div>
  </Teleport>
</template>
