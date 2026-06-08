# 🔬 Mindrift — AI Agent 可观测性仪表盘

> Monitor every thought, token, and tool call.

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/English-EN-blue?style=flat-square" /></a>
  <a href="README.zh-CN.md"><img src="https://img.shields.io/badge/中文-中文-red?style=flat-square" /></a>
</p>
<p align="center">
  <img src="https://img.shields.io/badge/平台-Codex-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/协议-MIT-green?style=flat-square" />
  <img src="https://img.shields.io/badge/侵入性-零-brightgreen?style=flat-square" />
  <img src="https://img.shields.io/badge/隐私-100%25本地-orange?style=flat-square" />
  <img src="https://img.shields.io/badge/框架-React_19-61dafb?style=flat-square" />
  <img src="https://img.shields.io/badge/运行时-Node.js-339933?style=flat-square" />
</p>

> **像心电监护仪一样实时观测你的 AI Agent。** 零侵入、纯本地、无需任何 API Key。

---

## 🎯 这是什么？

Mindrift 是一个**实时可视化仪表盘**，用于观测 Codex AI Agent 的内部运行状态。

如果你曾经好奇过：
- 🤔 "AI 卡住了吗？它到底在想什么？"
- 💸 "这次对话烧了多少 token？"
- 🔧 "它刚才执行了什么命令？"
- ⚠️ "上下文窗口快满了吗？"
- 📊 "比起上个月，我的 token 用量是升了还是降了？"

Mindrift 就是为你准备的。

---

## ✨ 核心功能

### 📊 实时仪表盘
| 模块 | 说明 |
|------|------|
| **Token 监控** | 输入/输出/推理 token 分开展示，环形图直观呈现比例 |
| **工具调用瀑布流** | 每个命令、补丁、搜索按时间轴可视化，点击展开完整详情 |
| **时间线回放** | 按时序回放每轮对话：用户消息 → 思考过程 → 工具调用 → AI 回复 |
| **上下文压力表** | 直观展示每轮对话距离上下文窗口上限的百分比 |
| **Agent 健康评分** | 多维度加权评分：错误数、压缩次数、中断次数、浪费 token |
| **Plan Steps 追踪** | 自动解析 `update_plan` 调用，追踪 Agent 工作计划的实际进度 |
| **思维模式分析** | 统计 thinking 中的模式（规划、反思、搜索、纠错等） |

### 📂 Session 管理
| 模块 | 说明 |
|------|------|
| **Session 浏览器** | 浏览所有历史对话，快速切换 |
| **搜索与筛选** | 按关键词、token 范围、工具数、异常状态筛选 |
| **会话命名** | 自动提取每个 session 的第一句有意义对话作为名称 |
| **今日/本月统计** | 顶栏实时展示今日 Token、本月 Token、Session 数量 |

### 🎨 用户体验
| 功能 | 说明 |
|------|------|
| **暗色/亮色主题** | 一键切换，偏好自动保存到 localStorage |
| **实时更新** | WebSocket 推送，文件变更 300ms 内反映到界面 |
| **响应式布局** | 适配不同屏幕尺寸 |
| **Setup 引导** | 右上角 Setup 按钮，新手引导弹窗 |

---

## 🎯 零侵入设计（Zero Instrumentation）

Mindrift **不修改 Codex 的任何代码**，不需要插件，不需要 API Key。

```
Codex 桌面端                 Mindrift
    │                            │
    │  写入 JSONL session 日志    │
    ▼                            │
~/.codex/sessions/               │
YYYY/MM/DD/rollout-*.jsonl ──────► chokidar 监听 (300ms 轮询)
                                 │
                                 ▼
                          Node.js 服务端
                          :3344 (Express + WebSocket)
                                 │
                                 ▼
                          React 前端仪表盘
                          http://localhost:3344
```

**工作原理：** Codex 在本地 `~/.codex/sessions/` 目录下以 JSONL 格式记录所有 session 活动。Mindrift 用 chokidar 监听这个目录，解析 JSONL 文件，提取结构化数据，通过 WebSocket 推送到前端。

---

## 🚀 快速开始

### 方式一：一键部署（推荐）

**Windows：**
```powershell
.\setup.bat
```

**macOS / Linux：**
```bash
chmod +x setup.sh && ./setup.sh
```

脚本会自动完成：安装依赖 → 构建前端 → 启动服务 → 打开浏览器。

### 方式二：手动安装

```bash
# 1. 安装后端依赖
cd mindrift/server && npm install

# 2. 安装前端依赖并构建
cd ../client && npm install && npx vite build

# 3. 启动服务
cd ../server && node index.js

# 4. 打开浏览器访问
# → http://localhost:3344
```

### 开机自启（可选）

将以下命令加入系统启动项：
```powershell
node "D:
ew idea\mindrift\server\index.js"
```

---

## 📊 架构详解

### 数据流
```
Session 文件 (JSONL)
    │
    ▼
parseSession()         ← 解析 JSONL 为结构化数据
    │
    ├── sessionMeta    ← 会话元信息（模型、时间、工作目录）
    ├── turns[]        ← 每轮对话（用户消息、AI 回复、token、工具调用）
    ├── toolCalls[]    ← 所有工具调用（命令、补丁、搜索）
    ├── planSteps[]    ← Agent 工作计划步骤
    └── tokenMetrics   ← Token 消耗汇总
    │
    ▼
computeStats()         ← 聚合统计（今日/本月/全部）
    │
    ▼
WebSocket 广播         ← 实时推送到所有连接的客户端
    │
    ▼
React 组件渲染         ← useMindrift hook 管理状态
```

### 数据溯源表

屏幕上每一个数字都能追溯到 JSONL 中的具体事件：

| 界面显示 | JSONL 数据源 | 字段路径 |
|---------|-------------|----------|
| Session 名称 | `event_msg.user_message` | 第一个有意义的用户消息 |
| Turn 数量 | `turn_context` | 按 turn_id 去重计数 |
| Token 用量 | `event_msg.token_count` | `total_token_usage.{input,cached_input,output,reasoning_output}_tokens` |
| 工具调用 | `response_item.function_call` | name, arguments, timestamp |
| 工具输出 | `function_call_output` | output, duration |
| Plan 步骤 | `response_item` (name="update_plan") | arguments 中的 steps 数组 |
| Agent 消息 | `event_msg.agent_message` | message 文本 |
| 思考过程 | `event_msg.agent_reasoning` | text 全文 |
| 上下文窗口 | `event_msg.token_count` | `model_context_window` |
| 会话开始 | `session_meta` | id, cwd, model_provider, timestamp |
| 会话结束 | `turn_context.finished` | finishedAt |

---

## 🛠 技术栈

| 层 | 技术 | 用途 |
|----|------|------|
| 后端 | Node.js 18+ | 运行环境 |
| Web 框架 | Express 4 | HTTP API + 静态文件服务 |
| 实时通信 | WebSocket (ws) | 双向实时推送 |
| 文件监听 | chokidar | 监听 session 文件变更 |
| 前端框架 | React 19 | UI 组件 |
| 构建工具 | Vite 6 | 开发 & 生产构建 |
| CSS 框架 | Tailwind CSS v4 | 原子化样式 |
| 图标 | Lucide React | SVG 图标库 |
| 图表 | 纯 SVG | Token 环形图、柱状图（无第三方图表库） |

---

## 📁 项目结构

```
mindrift/
├── server/
│   ├── index.js              # 核心：Express + WS + 解析 + 统计
│   └── package.json
├── client/
│   ├── src/
│   │   ├── App.jsx           # 主布局 + 顶栏统计 + 主题切换 + Setup 弹窗
│   │   ├── main.jsx          # React 入口
│   │   ├── index.css         # CSS 变量 + 主题（暗色/亮色）
│   │   ├── hooks/
│   │   │   └── useMindrift.js  # WebSocket 状态管理 hook
│   │   └── components/
│   │       ├── SessionBar.jsx    # Session 卡片浏览器
│   │       ├── SessionFilter.jsx # 搜索 + 筛选面板
│   │       ├── TurnSidebar.jsx   # Turn 列表侧边栏
│   │       ├── TurnDetail.jsx    # 主内容区（6 个视图 Tab）
│   │       ├── Timeline.jsx      # 时序事件时间线
│   │       ├── ToolCallTree.jsx  # 工具调用统计 & 详情
│   │       ├── ThinkingAnalysis.jsx # 思维模式分析
│   │       ├── TokenDonut.jsx    # Token 组成环形图
│   │       ├── TurnTokenChart.jsx # 每轮 Token 柱状图
│   │       └── RawLogViewer.jsx  # 原始 JSONL 查看器
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── setup.bat                 # Windows 一键部署脚本
├── setup.sh                  # macOS/Linux 一键部署脚本
├── README.md                 # 英文文档
├── README.zh-CN.md           # 中文文档（本文件）
└── LICENSE                   # MIT 开源协议
```

---

## 🔒 隐私 & 安全

- ✅ **100% 本地运行** — 不连接任何外部服务器
- ✅ **零遥测** — 无埋点、无统计、无崩溃报告、无数据收集
- ✅ **只读模式** — 仅读取 Codex session 日志文件，绝不写入
- ✅ **无需 API Key** — 不需要任何第三方凭证或 token
- ✅ **开源可审计** — MIT 协议，代码完全公开，欢迎审查

---

## ❓ FAQ

**Q: Mindrift 和 Codex 是什么关系？**
A: Mindrift 是一个独立的第三方工具，与 OpenAI / Codex 官方无关联。它只是读取 Codex 本地存储的 session 日志文件，不做任何修改。

**Q: 需要安装什么插件吗？**
A: 不需要。Mindrift 直接读取文件系统上的 JSONL 日志，对 Codex 完全透明。

**Q: 支持 macOS / Linux 吗？**
A: 支持。setup.sh 脚本可用于 macOS 和 Linux，也可以手动安装。

**Q: 会影响 Codex 性能吗？**
A: 几乎不会。Mindrift 是一个独立的 Node.js 进程，只监听文件变更，不做任何代理或拦截。

**Q: 数据可以导出吗？**
A: 当前版本提供 Raw Log 视图（查看原始 JSONL），导出功能计划在后续版本加入。

**Q: 端口冲突怎么办？**
A: 默认使用 3344 端口。可以修改 `server/index.js` 中的 `PORT` 变量。

---

## 📝 开发计划

- [ ] 多 Session 对比视图
- [ ] Token 消耗趋势图（按天/周/月聚合）
- [ ] 数据导出（CSV / JSON）
- [ ] 自定义告警规则
- [ ] 插件系统
- [x] 暗色/亮色主题切换
- [x] Session 搜索与筛选
- [x] 异常检测（anomaly flagging）

---

## 📄 许可证

MIT © 2026

---

<p align="center">
  <sub>为 Codex 社区构建 · 与 OpenAI 无关联 · 用爱发电 ❤️</sub>
</p>
