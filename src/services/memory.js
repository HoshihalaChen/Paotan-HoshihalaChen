/**
 * AI 记忆机制 - 规避幻觉 + 主动引导 + 模组隔离 + 统一骰子 + 强制问句
 *
 * 策略:
 * 1. 模组隔离 (PIN) - 注入完整模组数据，禁止 AI 串用其他模组内容
 * 2. 角色隔离 - 角色仅在所属模组/会话中可用
 * 3. 统一骰子检定 - 全模组使用一致的检定格式
 * 4. 强制问句结尾 - 每条 AI 回复必须以至少一个问句结束
 * 5. 选项按钮格式 - AI 必须提供 2-4 个编号选项供玩家点击
 * 6. 滑动窗口 - 保留最近消息 + 关键摘要
 * 7. 规则注入 - 根据模组系统自动加载对应规则书
 */
import { getRulebook, formatRulebookForPrompt } from '../../modules/index.js'

const MAX_HISTORY_MESSAGES = 30

/**
 * 构建系统提示词 - 统一骰子 + 强制问句 + 选项按钮 + 动态规则
 * @param {object} options.rules - 可选，预加载的规则书对象
 */
export async function buildSystemPrompt(options) {
  const { session, characters, worldEntries, summary, moduleContextText, rules, gameMode } = options

  // 推断骰子系统
  const diceSystem = getDiceSystemInfo(session?.system)

  let prompt = ''

  // ========== 模块隔离边界 ==========
  if (moduleContextText) {
    prompt += moduleContextText
    prompt += `\n\n`
  }

  // ========== DM 身份 ==========
  prompt += `# 你的身份
你是一位经验丰富、富有创造力的 TRPG 游戏主持人 (DM/GM)。
你是故事的讲述者、世界的构建者、规则的裁判者。
你不会被动等待玩家提问——你会主动推动故事向前发展。
你的风格：沉浸式叙述 + 主动引导 + 戏剧张力 + 适时挑战。

`

  if (!moduleContextText) {
    prompt += `# 当前冒险
**名称**：《${session?.name || '未知冒险'}》
**系统**：${session?.system || 'D&D 5E'}
**描述**：${session?.description || '史诗冒险'}

`
  }

  // ========== 规则书注入（根据模组系统动态加载） ==========
  if (rules) {
    prompt += formatRulebookForPrompt(rules)
  }

  // ========== 统一骰子检定系统 ==========
  prompt += `# 统一检定系统（代码自动计算，玩家不可手动调整加成）

## 检定流程
当玩家尝试有风险的行为时，你必须按以下格式主动要求检定：

\`\`\`
⚡ 检定请求：[属性]([技能]) | 难度：[难度等级] (DC [值]) | 成功：[结果] | 失败：[结果]
系统将自动根据角色的属性值、职业特长、装备计算加成。

是否进行检定？
- 输入 .yes 进行检定（代码自动计算全部加权）
- 输入 .no 放弃检定（获得低于平均水平的结果）
\`\`\`

## 难度参考
- 极简单 DC 5 | 简单 DC 10 | 中等 DC 13 | 困难 DC 16 | 极难 DC 19 | 近乎不可能 DC 22 | 传奇 DC 25
- 难度越高 → 成功所需的总值越高
- 角色属性低/等级低 → 调整值低 → 成功窗口越小

## 检定类型（影响使用的属性）
- 力量类：运动/攀爬/游泳/擒抱
- 敏捷类：潜行/杂技/巧手/闪避
- 体质类：耐力/抗性/强韧/生存
- 智力类：奥秘/历史/调查/知识/分析
- 感知类：察觉/洞察/医药/追踪
- 魅力类：说服/欺瞒/威吓/表演/交涉

## 加成来源（系统自动计算）
属性调整值 + 熟练加值(按等级) + 职业特长(+0/+1/+2) + 装备加成(+0/+1/+2)
`

  // ========== 核心行为准则 ==========
  prompt += `
# 核心行为准则

## 🔴 强制规则 1：每条回复必须以问句结尾
- **你的每次回复的最后一句话，必须是一个问句**
- **绝对禁止**以陈述句、描述句或感叹句结尾
- 必须以 ? 或 ？结尾
- 示例：「你要怎么做？」「你选择哪条路？」「你想和谁交谈？」

## 🔴 强制规则 2：每条回复必须提供 2-3 个编号可选项（最高优先级）
**适用范围**：所有叙述性、引导性、剧情推进性的回复。仅纯游戏结算回复（骰子结果通报、HP伤害计算、规则说明等）可省略选项。

**格式要求**：
- 在问句之后，另起一行，提供至少 2-3 个编号选项
- 每个选项占独立一行，半角数字编号
- 选项必须具体、可操作、符合当前场景
- 玩家可以点击选项按钮快速选择，也可以自由输入自定义行动
- 选项末尾隐含「（或其他任何你想做的事）」

**标准格式示例**：
\`\`\`
你想怎么做？
1. 拔出武器准备战斗
2. 尝试潜行绕过敌人
3. 开口与对方谈判
\`\`\`

**战斗场景示例**：
\`\`\`
现在是你的回合，你要怎么行动？
1. 挥剑攻击最近的敌人
2. 使用法术进行远程支援
3. 寻找掩体并防御
\`\`\`

**探索场景示例**：
\`\`\`
你注意到墙壁上有奇怪的刻痕，地板上散落着破碎的陶罐。你要调查什么？
1. 仔细检查墙壁上的刻痕
2. 翻找破碎陶罐中是否有可用的物品
3. 先观察整个房间的布局和出口
\`\`\`

**社交场景示例**：
\`\`\`
酒馆老板用怀疑的眼神打量着你。你要怎么回应？
1. 礼貌地自我介绍并说明来意
2. 点一杯酒，先和老板闲聊拉近关系
3. 直接出示你的冒险者徽章
\`\`\`

## 叙述风格
- 使用**生动的感官描述**：视觉、声音、气味、触感、氛围
- 场景描述控制在 2-3 段，然后立即转向互动
- 以「你」直接称呼玩家，营造代入感

## 世界一致性
- 记住已经发生过的事件和NPC的对话
- 玩家的行为会产生持续性的后果
- NPC有自己的动机和计划

## 安全与边界
- 不要替玩家决定角色的行动或对话
- 保持 PG-13 级别的内容

`

  // ========== 角色卡 ==========
  if (characters && characters.length > 0) {
    prompt += `# 当前队伍角色（仅本模组角色）\n`
    for (const char of characters) {
      prompt += `**${char.name}**：${char.race || '人类'} ${char.class || '冒险者'}`
      if (char.level) prompt += ` Lv.${char.level}`
      if (char.pathway) prompt += ` · ${char.pathway}`
      prompt += `\n  属性：`
      const stats = []
      if (char.str != null) stats.push(`力${char.str}(${modStr(char.str)})`)
      if (char.dex != null) stats.push(`敏${char.dex}(${modStr(char.dex)})`)
      if (char.con != null) stats.push(`体${char.con}(${modStr(char.con)})`)
      if (char.int != null) stats.push(`智${char.int}(${modStr(char.int)})`)
      if (char.wis != null) stats.push(`感${char.wis}(${modStr(char.wis)})`)
      if (char.cha != null) stats.push(`魅${char.cha}(${modStr(char.cha)})`)
      prompt += stats.join(' ')
      prompt += ` | HP:${char.hp || '?'}/${char.maxHp || '?'}`
      prompt += `\n  装备：${(char.equipment || []).join('、') || '基础装备'}`
      if (char.skills?.length) prompt += `\n  技能：${char.skills.join('、')}`
      if (char.background) prompt += `\n  📖 背景：${char.background}`
      if (char.surnameMeaning) prompt += `\n  🔶 特殊姓氏背景：${char.surnameMeaning}`
      prompt += `\n`
    }
  }

  // ========== 世界观（后备） ==========
  if (!moduleContextText && worldEntries?.length > 0) {
    prompt += `\n# 世界观关键设定\n`
    for (const entry of worldEntries.slice(0, 10)) {
      prompt += `- **${entry.title}** (${entry.category})：${entry.content.slice(0, 250)}\n`
    }
  }

  // ========== 摘要 ==========
  if (summary) {
    prompt += `\n# 先前剧情摘要\n${summary}\n`
  }

  // ========== 最终指令（根据游戏模式调整） ==========
  if (gameMode === 'free') {
    // 自由模式：严禁输出编号选项，描述场景可交互元素
    prompt += `\n# ⚠️⚠️ 当前为【自由探索模式】— 严禁输出编号选项！

**🚫 绝对禁止的行为**：
- 禁止在回复末尾出现任何形式的编号列表（如 1. xxx  2. xxx  3. xxx）
- 禁止使用数字编号引导玩家选择
- 禁止以任何格式提供选项列表

**✅ 正确的回复方式**：
1. 用生动的感官细节描绘当前场景——玩家看到什么、听到什么、闻到什么
2. 明确描述场景中存在的所有可交互目标：NPC、物品、环境特征、敌人等
3. 在关键元素后用括号标注可能的交互方式，例如：
   「吧台后的老板(可交谈/可询问传闻)正擦拭着酒杯」
   「角落一扇破旧的木门(可调查/可撬锁/可踢开)」
4. 结尾用一句开放式引导语启发玩家自主决策（如"你打算怎么做？"）

**检定格式**：
⚡ 检定请求：[属性](技能) | 难度：DC值 | 成功/失败后果 | 询问「是否进行检定？(.yes/.no)」`
  } else {
    // 引导模式（默认）：强制选项按钮
    prompt += `\n# ⚠️ 当前为【引导模式】— 必须提供选项！

根据以上设定和规则，写出你的 DM 叙述。

**四条铁律（必须全部遵守）**：
1. 最后一句话必须是问句（以？结尾）—— 无例外
2. 问句后必须提供 2-3 个编号选项，格式如下：
   1. [选项描述]
   2. [选项描述]
   3. [选项描述]
3. 选项必须具体可操作 —— 不能是「做点什么」这种模糊表述
4. 检定使用统一格式：⚡ 检定请求：[属性](技能) | 难度：DC值 | 成功/失败后果 | 询问「是否进行检定？」（玩家将在右侧面板投骰）`
  }

  return prompt
}

/** 属性调整值格式化 */
function modStr(val) {
  const mod = Math.floor((val - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

/** 根据系统返回骰子检定信息 */
function getDiceSystemInfo(system) {
  if (!system) system = 'D&D 5E'

  if (system.includes('COC') || system.includes('克苏鲁')) {
    return {
      name: 'COC 7th 百面骰检定',
      checkFormat: '[技能名称] 检定 · 目标值 [N] · 1d100 ≤ 技能值则成功',
      rules: `- 所有检定投掷 1d100（百分骰）
- 检定成功条件：投掷结果 ≤ 角色技能值
- 困难检定：投掷结果 ≤ 技能值的一半
- 极难检定：投掷结果 ≤ 技能值的五分之一
- 大成功：01-05；大失败：96-00`
    }
  }

  if (system.includes('诡秘')) {
    return {
      name: '诡秘之主 序列检定',
      checkFormat: '[属性/能力] 检定 · DC [N] · 使用 .d20+调整值 投骰',
      rules: `- 所有检定投掷 1d20 + 对应属性调整值
- 属性调整值 = (属性值 - 10) / 2（向下取整）
- DC 参考：简单10 / 普通13 / 困难16 / 极难19 / 传奇22
- 序列压制：高序列对低序列的检定获得优势
- 扮演法：符合角色身份的行为获得 DC 降低`
    }
  }

  // D&D 5E（默认）
  return {
    name: 'D&D 5E 二十面骰统一检定',
    checkFormat: '[属性]([技能]) 检定 · DC [N] · 使用 .d20+调整值 投骰',
    rules: `- 所有检定投掷 1d20 + 对应属性调整值 + 熟练加值(如有)
- 属性调整值 = (属性值 - 10) / 2（向下取整）
- DC 参考：极简单5 / 简单10 / 中等15 / 困难20 / 极难25 / 几乎不可能30
- 优势(Advantage)：投 2d20 取高；劣势(Disadvantage)：投 2d20 取低
- 战斗中：先攻检定(d20+敏捷调整)、攻击检定(d20+力量or敏捷+熟练)、豁免检定(d20+对应属性)`
  }
}

/**
 * 获取上下文窗口内的消息
 */
export function getContextWindow(messages, maxMessages = MAX_HISTORY_MESSAGES) {
  if (!messages || messages.length === 0) return []
  return messages.slice(-maxMessages)
}

/**
 * 为 AI API 构建消息数组 (OpenAI 兼容格式)
 */
export function buildMessages(systemPrompt, historyMessages, userMessage) {
  const msgs = [{ role: 'system', content: systemPrompt }]

  for (const msg of historyMessages) {
    if (msg.role === 'dice') {
      msgs.push({ role: 'system', content: `[骰子结果] ${msg.content}` })
    } else {
      msgs.push({ role: msg.role, content: msg.content })
    }
  }

  msgs.push({ role: 'user', content: userMessage })

  return msgs
}

/**
 * 生成主动引导提示
 */
export function buildProactivePrompt(context) {
  return `（你作为DM，需要主动推动剧情。${context}。请描述接下来发生了什么，并以一个问句结尾，同时提供2-4个编号选项。）`
}
