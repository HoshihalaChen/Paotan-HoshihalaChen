<script setup>
// 角色详情页 - 头像、六维属性进度条、装备清单、NPC好感
import { ref, computed, onMounted, watch } from 'vue'
import { useSessionStore } from '../stores/session.js'
import { useCharacterStore } from '../stores/character.js'
import { useExport } from '../composables/useExport.js'
import CardWrapper from '../components/common/CardWrapper.vue'
import ProgressBar from '../components/common/ProgressBar.vue'
import { statLabels, statColor, formatDate } from '../utils/format.js'

const sessionStore = useSessionStore()
const characterStore = useCharacterStore()
const { exportCharacter } = useExport()

// 新建/编辑模式
const showForm = ref(false)
const editingChar = ref(null)

// 表单数据
const formData = ref({
  name: '', class: '战士', race: '人类', level: 1,
  str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
  hp: 10, maxHp: 10, mp: 5, maxMp: 5,
  equipment: [], skills: [], npcAffinity: {}
})

const newEquipment = ref('')
const newSkill = ref('')
const newNPC = ref('')
const npcAffinityValue = ref(50)

onMounted(async () => {
  if (sessionStore.currentSessionId) {
    await characterStore.loadCharacters(sessionStore.currentSessionId)
  }
})

watch(() => sessionStore.currentSessionId, async (id) => {
  if (id) await characterStore.loadCharacters(id)
})

/** 打开新建表单 */
function openCreate() {
  formData.value = {
    name: '', class: '战士', race: '人类', level: 1,
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    hp: 10, maxHp: 10, mp: 5, maxMp: 5,
    equipment: [], skills: [], npcAffinity: {}
  }
  editingChar.value = null
  showForm.value = true
}

/** 打开编辑表单 */
function openEdit(char) {
  formData.value = {
    name: char.name, class: char.class, race: char.race, level: char.level,
    str: char.str, dex: char.dex, con: char.con, int: char.int, wis: char.wis, cha: char.cha,
    hp: char.hp, maxHp: char.maxHp, mp: char.mp, maxMp: char.maxMp,
    equipment: [...(char.equipment || [])],
    skills: [...(char.skills || [])],
    npcAffinity: { ...(char.npcAffinity || {}) }
  }
  editingChar.value = char
  showForm.value = true
}

/** 保存角色 */
async function saveCharacter() {
  if (!sessionStore.currentSessionId || !formData.value.name.trim()) return
  const data = {
    ...formData.value,
    equipment: formData.value.equipment,
    skills: formData.value.skills,
    npcAffinity: formData.value.npcAffinity,
    avatar: ''
  }
  if (editingChar.value) {
    await characterStore.updateCharacter(editingChar.value.id, data)
  } else {
    await characterStore.createCharacter(sessionStore.currentSessionId, data)
  }
  showForm.value = false
}

/** 添加装备 */
function addEquipment() {
  if (newEquipment.value.trim()) {
    formData.value.equipment.push(newEquipment.value.trim())
    newEquipment.value = ''
  }
}

/** 移除装备 */
function removeEquipment(index) {
  formData.value.equipment.splice(index, 1)
}

/** 添加技能 */
function addSkill() {
  if (newSkill.value.trim()) {
    formData.value.skills.push(newSkill.value.trim())
    newSkill.value = ''
  }
}

/** 添加 NPC 好感 */
function addNPCAffinity() {
  if (newNPC.value.trim()) {
    formData.value.npcAffinity[newNPC.value.trim()] = npcAffinityValue.value
    newNPC.value = ''
    npcAffinityValue.value = 50
  }
}

/** 删除角色 */
async function deleteChar(id) {
  await characterStore.deleteCharacter(id)
}

// 六个属性的键列表
const statKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha']

/** 头像占位颜色 */
function charColor(name) {
  let hash = 0
  for (const c of name || '?') hash = ((hash << 5) - hash) + c.charCodeAt(0)
  const h = Math.abs(hash) % 360
  return `hsl(${h}, 20%, 55%)`
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- 页面标题 -->
    <div class="flex justify-between items-center">
      <div>
        <h2 class="text-xl text-ink-primary tracking-wider">角色管理</h2>
        <p class="text-xs text-ink-muted tracking-wide">{{ sessionStore.currentSession?.name }}</p>
      </div>
      <button class="btn-primary text-sm" @click="openCreate">+ 新建角色</button>
    </div>

    <!-- 角色列表 -->
    <div class="grid grid-cols-2 gap-4">
      <CardWrapper
        v-for="char in characterStore.characters"
        :key="char.id"
        class="p-5 cursor-pointer transition-all"
        :class="{ 'ring-1 ring-[#B5AFA5]': characterStore.currentCharacterId === char.id }"
        @click="characterStore.selectCharacter(char.id)"
      >
        <div class="flex gap-4">
          <!-- 头像区 - 自定义接口 -->
          <div class="flex-shrink-0">
            <div
              v-if="char.avatar"
              class="w-16 h-16 rounded-full overflow-hidden border-2 border-[#D8D2C8]"
            >
              <img :src="char.avatar" class="w-full h-full object-cover" />
            </div>
            <div
              v-else
              class="w-16 h-16 rounded-full flex items-center justify-center text-[#FAF7F2] text-lg font-medium"
              :style="{ backgroundColor: charColor(char.name) }"
            >
              {{ char.name.charAt(0) }}
            </div>
          </div>

          <!-- 角色信息 -->
          <div class="flex-1 min-w-0">
            <div class="flex justify-between items-start">
              <div>
                <h3 class="text-sm text-ink-primary font-medium">{{ char.name }}</h3>
                <p class="text-[10px] text-ink-muted">{{ char.race }} · {{ char.class }} · Lv.{{ char.level }}</p>
              </div>
              <div class="flex gap-1">
                <button class="text-[10px] text-ink-muted hover:text-ink-primary px-1" @click.stop="openEdit(char)">编辑</button>
                <button class="text-[10px] text-red-400 hover:text-red-600 px-1" @click.stop="deleteChar(char.id)">删除</button>
                <button class="text-[10px] text-ink-muted hover:text-ink-primary px-1" @click.stop="exportCharacter(char)">导出</button>
              </div>
            </div>
            <!-- 缩略属性条 -->
            <div class="grid grid-cols-3 gap-x-3 gap-y-1 mt-2">
              <div v-for="stat in statKeys" :key="stat" class="flex items-center gap-1">
                <span class="text-[9px] text-ink-muted w-6">{{ statLabels[stat] }}</span>
                <div class="flex-1 h-1.5 bg-[#E8E2D8] rounded-full overflow-hidden">
                  <div class="progress-fill h-full rounded-full" :style="{ width: (char[stat]/20*100)+'%', backgroundColor: statColor(char[stat]) }" />
                </div>
                <span class="text-[9px] text-ink-primary w-4 text-right">{{ char[stat] }}</span>
              </div>
            </div>
            <!-- HP/MP -->
            <div class="flex gap-4 mt-2">
              <span class="text-[10px] text-ink-secondary">HP {{ char.hp }}/{{ char.maxHp }}</span>
              <span class="text-[10px] text-ink-secondary">MP {{ char.mp }}/{{ char.maxMp }}</span>
              <span class="text-[10px]" :class="char.status === '正常' ? 'text-green-600' : 'text-red-400'">{{ char.status }}</span>
            </div>
          </div>
        </div>
      </CardWrapper>

      <!-- 空状态 -->
      <CardWrapper v-if="characterStore.characters.length === 0" class="col-span-2 p-12 text-center">
        <p class="text-sm text-ink-muted">暂无角色，点击上方按钮创建一个吧</p>
      </CardWrapper>
    </div>

    <!-- 角色详情卡片 -->
    <CardWrapper v-if="characterStore.currentCharacter" class="p-6 fade-in">
      <div class="flex gap-6">
        <!-- 左栏：头像 + 基础信息 -->
        <div class="w-48 flex-shrink-0">
          <!-- 自定义头像上传接口 -->
          <label class="block w-32 h-32 mx-auto rounded-full overflow-hidden border-2 border-[#D8D2C8] cursor-pointer hover:opacity-80 transition-opacity bg-[#E8E2D8]">
            <input
              type="file"
              accept="image/*"
              class="hidden"
              @change="e => {
                const file = e.target.files[0]
                if (file) {
                  const reader = new FileReader()
                  reader.onload = ev => characterStore.updateCharacter(characterStore.currentCharacter.id, { avatar: ev.target.result })
                  reader.readAsDataURL(file)
                }
              }"
            />
            <img
              v-if="characterStore.currentCharacter.avatar"
              :src="characterStore.currentCharacter.avatar"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex flex-col items-center justify-center text-ink-muted">
              <span class="text-2xl">{{ characterStore.currentCharacter.name.charAt(0) }}</span>
              <span class="text-[9px] mt-1">点击上传</span>
            </div>
          </label>
          <div class="text-center mt-3">
            <h3 class="text-base text-ink-primary font-medium">{{ characterStore.currentCharacter.name }}</h3>
            <p class="text-xs text-ink-muted">{{ characterStore.currentCharacter.race }} {{ characterStore.currentCharacter.class }}</p>
            <p class="text-xs text-ink-muted">Lv.{{ characterStore.currentCharacter.level }}</p>
          </div>
        </div>

        <!-- 中栏：六维属性 + HP/MP -->
        <div class="flex-1 space-y-3">
          <h4 class="text-sm text-ink-secondary tracking-wide">属性数值</h4>
          <div class="grid grid-cols-2 gap-x-6 gap-y-2">
            <div v-for="stat in statKeys" :key="stat">
              <ProgressBar
                :label="statLabels[stat]"
                :value="characterStore.currentCharacter[stat]"
                :max="20"
                :color="statColor(characterStore.currentCharacter[stat])"
              />
            </div>
          </div>
          <!-- HP / MP 进度条 -->
          <div class="grid grid-cols-2 gap-x-6 gap-y-2 pt-2 border-t border-[#E8E2D8]">
            <ProgressBar
              label="生命值 HP"
              :value="characterStore.currentCharacter.hp"
              :max="characterStore.currentCharacter.maxHp"
              color="#8B6A6A"
            />
            <ProgressBar
              label="魔力值 MP"
              :value="characterStore.currentCharacter.mp"
              :max="characterStore.currentCharacter.maxMp"
              color="#6A7A8B"
            />
          </div>
        </div>

        <!-- 右栏：装备 + 技能 -->
        <div class="w-56 flex-shrink-0 space-y-4">
          <!-- 装备清单 -->
          <div>
            <h4 class="text-sm text-ink-secondary tracking-wide mb-2">装备物品</h4>
            <div v-if="characterStore.currentCharacter.equipment?.length" class="space-y-1">
              <div
                v-for="(item, i) in characterStore.currentCharacter.equipment"
                :key="i"
                class="text-xs text-ink-primary bg-[#F5F0E8] px-3 py-1 rounded"
              >
                {{ item }}
              </div>
            </div>
            <p v-else class="text-xs text-ink-muted">暂无装备</p>
          </div>
          <!-- 技能 -->
          <div>
            <h4 class="text-sm text-ink-secondary tracking-wide mb-2">技能</h4>
            <div v-if="characterStore.currentCharacter.skills?.length" class="space-y-1">
              <div
                v-for="(skill, i) in characterStore.currentCharacter.skills"
                :key="i"
                class="text-xs text-ink-primary bg-[#F5F0E8] px-3 py-1 rounded"
              >
                {{ skill }}
              </div>
            </div>
            <p v-else class="text-xs text-ink-muted">暂无技能</p>
          </div>
        </div>
      </div>

      <!-- NPC 好感度 -->
      <div class="mt-6 pt-4 border-t border-[#E8E2D8]">
        <h4 class="text-sm text-ink-secondary tracking-wide mb-3">NPC 好感度</h4>
        <div v-if="characterStore.currentCharacter.npcAffinity && Object.keys(characterStore.currentCharacter.npcAffinity).length" class="grid grid-cols-3 gap-3">
          <div
            v-for="(value, npc) in characterStore.currentCharacter.npcAffinity"
            :key="npc"
          >
            <ProgressBar
              :label="npc"
              :value="value"
              :max="100"
              color="#5A7A5A"
            />
          </div>
        </div>
        <p v-else class="text-xs text-ink-muted">暂无 NPC 关系记录</p>
      </div>
    </CardWrapper>

    <!-- 创建/编辑表单模态 -->
    <Teleport to="body">
      <div
        v-if="showForm"
        class="fixed inset-0 bg-black/20 z-50 flex items-center justify-center"
        @click.self="showForm = false"
      >
        <CardWrapper class="w-[600px] max-h-[80vh] overflow-y-auto p-6">
          <h3 class="text-lg text-ink-primary mb-4">
            {{ editingChar ? '编辑角色' : '新建角色' }}
          </h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs text-ink-muted mb-1">名称</label>
              <input v-model="formData.name" class="input-parchment w-full" />
            </div>
            <div>
              <label class="block text-xs text-ink-muted mb-1">职业</label>
              <select v-model="formData.class" class="input-parchment w-full">
                <option>战士</option><option>法师</option><option>牧师</option>
                <option>游荡者</option><option>游侠</option><option>德鲁伊</option>
                <option>术士</option><option>野蛮人</option><option>吟游诗人</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-ink-muted mb-1">种族</label>
              <select v-model="formData.race" class="input-parchment w-full">
                <option>人类</option><option>精灵</option><option>矮人</option>
                <option>半精灵</option><option>半身人</option><option>龙裔</option>
                <option>提夫林</option><option>侏儒</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-ink-muted mb-1">等级</label>
              <input v-model.number="formData.level" type="number" min="1" max="20" class="input-parchment w-full" />
            </div>
            <!-- 六维属性 -->
            <div v-for="stat in statKeys" :key="stat">
              <label class="block text-xs text-ink-muted mb-1">{{ statLabels[stat] }}</label>
              <input v-model.number="formData[stat]" type="number" min="1" max="20" class="input-parchment w-full" />
            </div>
            <div>
              <label class="block text-xs text-ink-muted mb-1">最大 HP</label>
              <input v-model.number="formData.maxHp" type="number" min="1" class="input-parchment w-full" />
            </div>
            <div>
              <label class="block text-xs text-ink-muted mb-1">最大 MP</label>
              <input v-model.number="formData.maxMp" type="number" min="0" class="input-parchment w-full" />
            </div>
          </div>
          <!-- 装备编辑 -->
          <div class="mt-4">
            <label class="block text-xs text-ink-muted mb-1">装备</label>
            <div class="flex gap-2 mb-2">
              <input v-model="newEquipment" class="input-parchment flex-1 text-xs" placeholder="添加装备..." @keyup.enter="addEquipment" />
              <button class="btn-primary text-xs" @click="addEquipment">添加</button>
            </div>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="(item, i) in formData.equipment"
                :key="i"
                class="text-xs bg-[#F5F0E8] px-2 py-0.5 rounded flex items-center gap-1"
              >
                {{ item }}
                <button class="text-ink-muted hover:text-red-400" @click="removeEquipment(i)">×</button>
              </span>
            </div>
          </div>
          <!-- 技能 -->
          <div class="mt-4">
            <label class="block text-xs text-ink-muted mb-1">技能</label>
            <div class="flex gap-2 mb-2">
              <input v-model="newSkill" class="input-parchment flex-1 text-xs" placeholder="添加技能..." @keyup.enter="addSkill" />
              <button class="btn-primary text-xs" @click="addSkill">添加</button>
            </div>
            <div class="flex flex-wrap gap-1">
              <span v-for="(s, i) in formData.skills" :key="i" class="text-xs bg-[#F5F0E8] px-2 py-0.5 rounded">{{ s }}</span>
            </div>
          </div>
          <!-- NPC 好感 -->
          <div class="mt-4">
            <label class="block text-xs text-ink-muted mb-1">NPC 好感度</label>
            <div class="flex gap-2 mb-2">
              <input v-model="newNPC" class="input-parchment flex-1 text-xs" placeholder="NPC名称" />
              <input v-model.number="npcAffinityValue" type="range" min="0" max="100" class="w-24" />
              <span class="text-xs text-ink-muted w-8">{{ npcAffinityValue }}</span>
              <button class="btn-primary text-xs" @click="addNPCAffinity">添加</button>
            </div>
            <div v-for="(value, npc) in formData.npcAffinity" :key="npc" class="flex items-center gap-2 text-xs mb-1">
              <span class="w-20 text-ink-secondary">{{ npc }}</span>
              <ProgressBar :value="value" :max="100" color="#5A7A5A" :show-value="true" class="flex-1" />
            </div>
          </div>
          <div class="flex justify-end gap-3 mt-6">
            <button class="btn-ghost text-sm" @click="showForm = false">取消</button>
            <button class="btn-primary text-sm" @click="saveCharacter">
              {{ editingChar ? '保存修改' : '创建角色' }}
            </button>
          </div>
        </CardWrapper>
      </div>
    </Teleport>
  </div>
</template>
