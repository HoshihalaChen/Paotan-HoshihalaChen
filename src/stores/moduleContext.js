import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * 模块上下文隔离 Store
 *
 * 核心职责：
 * - 存储当前激活模组的完整数据
 * - 确保 AI 仅使用当前模组的内容
 * - 提供模块数据的统一访问接口
 *
 * 隔离机制 (PIN - Protected Isolation Namespace):
 * - 每轮 AI 调用注入模块唯一标识
 * - System Prompt 明确列出允许的内容边界
 * - 禁止 AI 引用或编造模组数据之外的设定
 */
export const useModuleContextStore = defineStore('moduleContext', () => {
  // 当前激活的模组完整数据
  const activeModule = ref(null)

  // 模组是否已锁定（游戏开始后不可更改）
  const isLocked = ref(false)

  // 模块唯一标识
  const moduleId = computed(() => activeModule.value?.id || null)
  const moduleName = computed(() => activeModule.value?.name || '未绑定')

  /**
   * 绑定模组上下文 — 游戏初始化时调用
   * 将完整模组数据存入 Store，锁定模组选择
   */
  function bindModule(moduleData) {
    if (isLocked.value) {
      console.warn('[ModuleContext] 模组已锁定，无法更换:', moduleName.value)
      return false
    }
    // 深拷贝模组数据，防止外部修改
    activeModule.value = JSON.parse(JSON.stringify(moduleData))
    isLocked.value = true
    console.log('[ModuleContext] 模组已绑定:', activeModule.value.name, '| ID:', activeModule.value.id)
    return true
  }

  /**
   * 解除模组绑定 — 游戏结束/重置时调用
   */
  function unbindModule() {
    console.log('[ModuleContext] 模组已解除绑定:', moduleName.value)
    activeModule.value = null
    isLocked.value = false
  }

  /**
   * 获取注入 AI 的完整模块上下文文本
   * 这是发送给 AI 的「世界设定边界」
   */
  function buildModuleContextText() {
    const mod = activeModule.value
    if (!mod) return ''

    let ctx = `\n# ═══════════════════════════════════════
# 模组隔离边界 (MODULE ISOLATION BOUNDARY)
# ═══════════════════════════════════════

## 当前绑定模组
- **模组ID**：${mod.id}
- **名称**：《${mod.name}》
- **系统**：${mod.system}
- **等级范围**：${mod.levelRange}
- **设定场景**：${mod.setting}

## 模组背景故事
${mod.background}

## ⚠️ 严格隔离规则 (CRITICAL)
你被锁定在《${mod.name}》模组中。你必须严格遵守以下边界：
1. **仅使用以下列出的 NPC、地点、任务、物品和世界设定**
2. **禁止引入其他模组（如施特拉德、龙枪、克苏鲁等）的任何内容**
3. **禁止编造模组背景中不存在的重要设定**
4. **如果你需要引入新元素，必须基于本模组已有的世界观进行合理延伸**
5. **当玩家问及模组外的内容时，礼貌地引导他们回到当前冒险**

`

    // NPC 完整列表
    if (mod.npcs && mod.npcs.length > 0) {
      ctx += `## 本模组 NPC 列表（仅限这些角色）\n`
      for (const npc of mod.npcs) {
        ctx += `- **${npc.name}**：${npc.race || ''} ${npc.class || ''}，${npc.role || ''}。${npc.traits || ''}。${npc.notes || ''}\n`
      }
      ctx += `\n`
    }

    // 地点
    if (mod.locations && mod.locations.length > 0) {
      ctx += `## 本模组地点列表（仅限这些场景）\n`
      for (const loc of mod.locations) {
        ctx += `- **${loc.name}** (${loc.type || '地点'})：${loc.description}\n`
      }
      ctx += `\n`
    }

    // 任务
    if (mod.quests && mod.quests.length > 0) {
      ctx += `## 本模组任务列表\n`
      for (const q of mod.quests) {
        ctx += `- [${q.type || '任务'}] **${q.title}**：${q.description}\n`
      }
      ctx += `\n`
    }

    // 物品
    if (mod.items && mod.items.length > 0) {
      ctx += `## 本模组特殊物品\n`
      for (const item of mod.items) {
        ctx += `- **${item.name}** (${item.type}·${item.rarity || '普通'})：${item.description}\n`
      }
      ctx += `\n`
    }

    // 世界设定（完整的）
    if (mod.worldLore && mod.worldLore.length > 0) {
      ctx += `## 本模组世界观设定（唯一权威来源）\n`
      for (const lore of mod.worldLore) {
        ctx += `### ${lore.title} (${lore.category})\n${lore.content}\n\n`
      }
    }

    // 诡秘之主特有：途径和组织
    if (mod.pathways && mod.pathways.length > 0) {
      ctx += `## 本模组神之途径\n`
      for (const pw of mod.pathways) {
        ctx += `- **${pw.name}**：${pw.description}\n`
        ctx += `  序列：${pw.sequence9}→${pw.sequence8}→${pw.sequence7}→${pw.sequence6}→${pw.sequence5}→${pw.sequence4}→${pw.sequence3}→${pw.sequence2}→${pw.sequence1}→${pw.sequence0}\n`
      }
      ctx += `\n`
    }

    if (mod.organizations && mod.organizations.length > 0) {
      ctx += `## 本模组组织势力\n`
      for (const org of mod.organizations) {
        ctx += `- **${org.name}** (${org.type})：${org.description}\n`
      }
      ctx += `\n`
    }

    ctx += `# ═══════════════════════════════════════
# 隔离边界结束 — 以上是本模组的全部可用内容
# 请严格在此范围内进行游戏主持
# ═══════════════════════════════════════`

    return ctx
  }

  /**
   * 获取模块的简短签名 — 用于日志和调试
   */
  function getModuleSignature() {
    const mod = activeModule.value
    if (!mod) return 'NO_MODULE'
    return `${mod.id}::${mod.name}::${mod.system}`
  }

  return {
    activeModule, isLocked, moduleId, moduleName,
    bindModule, unbindModule, buildModuleContextText, getModuleSignature
  }
})
