<script setup>
/**
 * 选项按钮组件
 *
 * 自动解析 AI 回复中的编号选项，渲染为可点击按钮。
 * 点击按钮自动发送对应选项文本，同时保留自由输入能力。
 *
 * 支持以下选项格式：
 * - 数字编号: "1. 调查声音  2. 去酒馆  3. 检查装备"
 * - 中文编号: "一、调查  二、离开  三、等待"
 * - 字母编号: "A. 攻击  B. 逃跑  C. 谈判"
 * - 箭头引导: "→ 向前走  → 回头  → 躲起来"
 */

import { ref, computed, watch } from 'vue'

const props = defineProps({
  // AI 消息文本
  text: { type: String, default: '' },
  // 是否正在流式输出中
  isStreaming: { type: Boolean, default: false },
  // 是否禁用按钮
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['select'])

/**
 * 解析 AI 文本中的选项
 * 返回 { pattern: string, choices: [{label, text}] }
 */
const parsedChoices = computed(() => {
  if (!props.text || props.isStreaming) return []

  // 优先匹配数字编号: "1. xxx  2. xxx  3. xxx"
  const numbered = props.text.match(/(?:^|\n)\s*(\d+)[\.\、\)）]\s*(.+?)(?=\s*\n\s*\d+[\.\、\)）]|\s*$)/gm)
  if (numbered && numbered.length >= 2) {
    const choices = []
    const regex = /\s*(\d+)[\.\、\)）]\s*(.+?)(?=\s*\n\s*\d+[\.\、\)）]|\s*$)/g
    let match
    const textBlock = numbered.join('\n')
    while ((match = regex.exec(textBlock)) !== null) {
      choices.push({ label: match[1], text: match[2].trim() })
    }
    // 使用整个文本的最后一段来匹配，避免遗漏
    const lastSection = props.text.split('\n\n').pop() || props.text
    const lines = lastSection.split('\n').filter(l => /^\s*\d+[\.\、\)）]/.test(l.trim()))
    if (lines.length >= 2) {
      const result = []
      for (const line of lines) {
        const m = line.trim().match(/^\s*(\d+)[\.\、\)）]\s*(.+)/)
        if (m) result.push({ label: m[1], text: m[2].trim() })
      }
      if (result.length >= 2) return result
    }
  }

  // 匹配中文编号: "一、xxx  二、xxx"
  const cnNums = ['一', '二', '三', '四', '五', '六']
  const cnLines = []
  for (const line of (props.text.split('\n'))) {
    for (const cn of cnNums) {
      if (line.trim().startsWith(cn + '、') || line.trim().startsWith(cn + '．') || line.trim().startsWith(cn + '.')) {
        cnLines.push(line.trim())
      }
    }
  }
  if (cnLines.length >= 2) {
    return cnLines.map(line => {
      const m = line.match(/^([一二三四五六])[、．.]\s*(.+)/)
      return m ? { label: m[1], text: m[2].trim() } : null
    }).filter(Boolean)
  }

  // 匹配字母编号: "A. xxx  B. xxx"
  const letterLines = []
  for (const line of (props.text.split('\n'))) {
    if (/^[A-C][\.\、\)）]\s/.test(line.trim())) {
      letterLines.push(line.trim())
    }
  }
  if (letterLines.length >= 2) {
    return letterLines.map(line => {
      const m = line.match(/^([A-C])[\.\、\)）]\s*(.+)/)
      return m ? { label: m[1], text: m[2].trim() } : null
    }).filter(Boolean)
  }

  // 匹配箭头引导: "→ xxx  → xxx"
  const arrowLines = []
  for (const line of (props.text.split('\n'))) {
    if (line.trim().startsWith('→') || line.trim().startsWith('➤') || line.trim().startsWith('▸')) {
      arrowLines.push(line.trim())
    }
  }
  if (arrowLines.length >= 2) {
    return arrowLines.map((line, i) => {
      const text = line.replace(/^[→➤▸]\s*/, '').trim()
      return { label: String(i + 1), text }
    })
  }

  return []
})

/** 点击选项 */
function selectChoice(choice) {
  if (props.disabled) return
  emit('select', choice.text)
}
</script>

<template>
  <div
    v-if="parsedChoices.length >= 2 && !isStreaming && !disabled"
    class="mt-3 fade-in"
  >
    <div class="flex flex-wrap gap-2 mb-1">
      <button
        v-for="(choice, i) in parsedChoices"
        :key="i"
        class="text-sm text-left px-4 py-2 rounded-lg border transition-all duration-200
               bg-[#FAF7F2] border-[#D8D2C8] text-ink-primary
               hover:bg-[#5A5550] hover:text-[#F5F0E8] hover:border-[#5A5550]
               active:scale-[0.97] cursor-pointer"
        @click="selectChoice(choice)"
      >
        <span class="text-[10px] text-ink-muted mr-1.5">{{ choice.label }}</span>
        {{ choice.text }}
      </button>
    </div>
    <p class="text-[9px] text-ink-muted/50 mt-1">点击上方选项快速选择，或在输入框中自由输入自定义行动</p>
  </div>
</template>
