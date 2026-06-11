# 跑团助手 (TRPG Manager)

桌面端 TRPG 跑团后台管理系统，基于 Web 技术栈构建的课程作品。

## 功能概述

- **AI 主持人对话**：接入 DeepSeek V4 PRO API，流式打字机回复，内置记忆机制规避幻觉
- **骰子检定系统**：支持 d4/d6/d8/d10/d12/d20/d100 及自定义表达式，优势/劣势投掷
- **角色管理**：六维属性、装备清单、技能、NPC 好感度，头像上传
- **世界观情报**：分类管理世界设定，作为 AI 判定的世界观锚定
- **冒险日志**：任务记录、关联人物、标签分类
- **地图系统**：地图生成器接口预留，季节/日期控件，图层管理
- **数据可视化**：投骰统计柱状图、角色属性雷达图、冒险流程时间线
- **数据导出**：聊天记录 Markdown 导出、完整数据 JSON 导出
- **本地持久化**：IndexedDB 存储，支持多会话、离线使用

## 技术栈

| 技术 | 用途 |
|------|------|
| Vue 3 (script setup) | 前端框架 |
| Vite | 构建工具 |
| Tailwind CSS | 样式框架 |
| Pinia | 状态管理 |
| Dexie.js | IndexedDB 数据库 |
| Chart.js | 数据可视化 |
| DeepSeek API | AI 对话 |

## 快速开始

### 环境要求

- Node.js 18+
- npm 或 pnpm

### 安装

```bash
cd paotuan-app
npm install
```

### 开发

```bash
npm run dev
```

浏览器访问 `http://localhost:5173`

### 构建

```bash
npm run build
npm run preview
```

## 项目结构

```
paotuan-app/
├── index.html                 # 入口 HTML
├── package.json
├── vite.config.js
├── tailwind.config.js
├── README.md
├── src/
│   ├── main.js                # 应用入口
│   ├── App.vue                # 根组件
│   ├── style.css              # 全局样式 + Tailwind
│   ├── db/
│   │   └── index.js           # Dexie.js 数据库定义
│   ├── stores/                # Pinia 状态管理
│   │   ├── session.js         # 跑团会话
│   │   ├── character.js       # 角色管理
│   │   ├── chat.js            # 聊天消息
│   │   ├── world.js           # 世界观情报
│   │   ├── log.js             # 冒险日志
│   │   ├── map.js             # 地图
│   │   └── ui.js              # UI 状态
│   ├── services/              # 业务服务
│   │   ├── deepseek.js        # DeepSeek API 流式调用
│   │   ├── dice.js            # 骰子指令服务
│   │   └── memory.js          # AI 记忆机制
│   ├── composables/           # Vue Composables
│   │   ├── useDice.js
│   │   ├── useStreaming.js
│   │   └── useExport.js
│   ├── components/            # UI 组件
│   │   ├── layout/            # 布局组件
│   │   ├── common/            # 通用组件
│   │   ├── chat/              # 聊天组件
│   │   ├── dice/              # 骰子组件
│   │   ├── character/         # 角色组件
│   │   ├── visualization/     # 可视化组件
│   │   └── export/            # 导出组件
│   ├── pages/                 # 7 个功能页面
│   │   ├── HomePage.vue       # 主页 - 新建冒险
│   │   ├── GamePage.vue       # 游戏页 - 聊天+骰子
│   │   ├── CharacterPage.vue  # 角色详情页
│   │   ├── MapPage.vue        # 地图页
│   │   ├── WorldPage.vue      # 世界观情报页
│   │   ├── LogPage.vue        # 冒险日志页
│   │   └── SettingsPage.vue   # 设置页
│   └── utils/                 # 工具函数
│       ├── dice.js            # 骰子表达式解析
│       └── format.js          # 格式化工具
```

## AI 记忆机制

为避免 AI 幻觉，系统采用多层记忆策略：

1. **角色卡上下文注入**：发送消息时自动附带当前队伍角色属性
2. **世界观锚定**：世界设定条目作为 System Prompt 注入
3. **会话摘要链**：定期生成剧情摘要维持长会话连贯性
4. **滑动窗口**：保留最近 20 条消息作为对话上下文

## 骰子指令

| 指令 | 说明 |
|------|------|
| `.d20` | d20 检定 |
| `.d20+5` | d20 检定 +5 调整 |
| `.2d6` | 2 个 d6 |
| `.3d8+2` | 3 个 d8 + 2 |
| `.4d6k3` | 4d6 取最高的 3 个 |
| `.d100` | d100 |
| `.adv` | d20 优势 (取高) |
| `.dis` | d20 劣势 (取低) |

## 许可证

课程作品 · 仅供学习使用
