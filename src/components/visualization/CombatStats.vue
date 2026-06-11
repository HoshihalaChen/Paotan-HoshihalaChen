<script setup>
/**
 * 战斗属性可视化组件
 *
 * 实时显示角色和敌人的 HP、状态、属性变化。
 * 当属性值变化时自动高亮动画。
 */
import { ref, computed, watch } from 'vue'
import CardWrapper from '../common/CardWrapper.vue'
import ProgressBar from '../common/ProgressBar.vue'
import { statLabels, statColor } from '../../utils/format.js'

const props = defineProps({
  characters: { type: Array, default: () => [] },
  /** 敌人/对手列表 { name, hp, maxHp, ac, conditions[], stats? } */
  enemies: { type: Array, default: () => [] },
  /** 是否显示面板 */
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'update:enemies'])

// 追踪变化以便动画
const changedStats = ref({})

/** 检测属性变化并记录 */
watch(() => props.characters, (newChars, oldChars) => {
  if (!oldChars) return
  const changes = {}
  for (const nc of newChars) {
    const oc = oldChars.find(c => c.id === nc.id)
    if (!oc) continue
    for (const stat of ['hp', 'maxHp', 'mp', 'maxMp', 'str', 'dex', 'con', 'int', 'wis', 'cha']) {
      if (nc[stat] !== oc[stat]) {
        changes[`${nc.id}-${stat}`] = { old: oc[stat], new: nc[stat] }
      }
    }
  }
  if (Object.keys(changes).length > 0) {
    changedStats.value = changes
    setTimeout(() => { changedStats.value = {} }, 2000)
  }
}, { deep: true })

/** 敌人 HP 调整 */
function damageEnemy(index, amount) {
  const enemies = [...props.enemies]
  if (enemies[index]) {
    enemies[index] = {
      ...enemies[index],
      hp: Math.max(0, (enemies[index].hp || 0) + amount)
    }
  }
  emit('update:enemies', enemies)
}

/** 调整角色 HP */
function healChar(char, amount) {
  // 通过事件向上传递
}

const statKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha']

function isChanged(charId, stat) {
  return !!changedStats.value[`${charId}-${stat}`]
}

function hpColor(hp, maxHp) {
  const ratio = hp / maxHp
  if (ratio <= 0.25) return '#8B3A3A'
  if (ratio <= 0.5) return '#9B7A3A'
  if (ratio <= 0.75) return '#7A8B3A'
  return '#5A7A5A'
}
</script>

<template>
  <CardWrapper v-if="visible" class="p-4 fade-in">
    <div class="flex items-center justify-between mb-3">
      <h4 class="text-sm text-ink-secondary tracking-wide">⚔️ 战斗状态</h4>
      <button class="text-xs text-ink-muted hover:text-ink-primary" @click="emit('close')">收起</button>
    </div>

    <div class="grid gap-4" :class="enemies.length > 0 ? 'grid-cols-2' : 'grid-cols-1'">
      <!-- 我方角色 -->
      <div>
        <h5 class="text-xs text-ink-muted mb-2 tracking-wide">我方</h5>
        <div v-for="char in characters" :key="char.id" class="mb-3">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs text-ink-primary font-medium">{{ char.name }}</span>
            <span
              class="text-xs font-medium transition-all duration-500"
              :class="isChanged(char.id, 'hp') ? 'text-red-400 scale-110' : 'text-ink-secondary'"
            >
              HP {{ char.hp }}/{{ char.maxHp }}
              <span v-if="isChanged(char.id, 'hp')" class="text-[10px]">
                ({{ changedStats[char.id + '-hp']?.old }} → {{ changedStats[char.id + '-hp']?.new }})
              </span>
            </span>
          </div>
          <ProgressBar
            :value="char.hp"
            :max="char.maxHp"
            :color="hpColor(char.hp, char.maxHp)"
            :show-value="false"
          />
          <!-- 属性摘要（一行小字） -->
          <div class="flex gap-2 mt-1 flex-wrap">
            <span
              v-for="stat in statKeys"
              :key="stat"
              class="text-[9px] transition-all duration-300"
              :class="isChanged(char.id, stat)
                ? 'text-ink-primary font-medium scale-110'
                : 'text-ink-muted'"
            >
              {{ statLabels[stat] }} {{ char[stat] }}
              <span v-if="isChanged(char.id, stat)" class="text-[#5A7A5A]">
                ↑
              </span>
            </span>
          </div>
          <p v-if="char.status && char.status !== '正常'" class="text-[9px] text-red-400 mt-0.5">
            {{ char.status }}
          </p>
        </div>
        <div v-if="characters.length === 0" class="text-xs text-ink-muted py-2">
          暂无角色数据
        </div>
      </div>

      <!-- 敌方 -->
      <div v-if="enemies.length > 0">
        <h5 class="text-xs text-ink-muted mb-2 tracking-wide">敌方</h5>
        <div v-for="(enemy, i) in enemies" :key="i" class="mb-3">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs text-ink-primary font-medium">{{ enemy.name }}</span>
            <span class="text-xs text-ink-secondary">AC {{ enemy.ac || '?' }} · HP {{ enemy.hp }}/{{ enemy.maxHp }}</span>
          </div>
          <ProgressBar
            :value="enemy.hp"
            :max="enemy.maxHp"
            :color="hpColor(enemy.hp, enemy.maxHp)"
            :show-value="false"
          />
          <div v-if="enemy.conditions?.length" class="flex gap-1 mt-1">
            <span
              v-for="cond in enemy.conditions"
              :key="cond"
              class="text-[8px] bg-red-50 text-red-400 px-1.5 py-0.5 rounded"
            >
              {{ cond }}
            </span>
          </div>
          <!-- 快速伤害/治疗按钮 -->
          <div class="flex gap-1 mt-1">
            <button
              v-for="dmg in [-5, -10, -20]"
              :key="dmg"
              class="text-[8px] px-1.5 py-0.5 rounded border border-[#D8D2C8] hover:bg-red-50 text-red-400"
              @click="damageEnemy(i, dmg)"
            >
              {{ dmg }}
            </button>
            <span class="text-[8px] text-ink-muted self-center">伤害</span>
          </div>
        </div>
      </div>
    </div>
  </CardWrapper>
</template>
