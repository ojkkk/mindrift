<p align="center">
  <h1 align="center">🧠 Mindrift（心流）</h1>
  <p align="center"><strong>AI 编程助手的开源可观测性仪表盘。<br/>零侵入。实时监控每一个思维、Token 和工具调用。</strong></p>
  <p align="center">
    <a href="README.md"><img src="https://img.shields.io/badge/lang-EN-red" alt="English"></a>
    <a href="README.zh-CN.md"><img src="https://img.shields.io/badge/lang-中文-blue" alt="Chinese"></a>
    <img src="https://img.shields.io/badge/status-active-brightgreen" alt="Status">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
    <img src="https://img.shields.io/badge/platform-Codex%20%7C%20Claude%20Code%20%7C%20Cursor-cyan" alt="Platform">
  </p>
</p>

---

> **“给 AI 装上心电监护仪。可以 Debug，可以优化，也可以当屏保看。”**

Mindrift 读取本地 Agent 会话日志，构建实时可视化仪表盘——Token 消耗、工具调用瀑布流、计划跟踪、效率评分、异常检测、费用估算——完全不需要修改任何 Agent 代码。

## ✨ 功能特性

### 实时监控
- **Token 追踪** — 每轮对话的输入/输出/推理/缓存 Token，WebSocket 实时推送（~300ms）
- **工具调用瀑布流** — 每次函数调用的耗时、参数、输出预览，按工具类型分组，自动检测模式
- **计划跟踪** — `update_plan` 决策树实时渲染
- **Turn 时间线** — 每轮对话的按时间排序的事件流

### 分析与洞察
- **四维效率评分** — Token ROI、工具成功率、浪费率、上下文余量，逐 Turn 和逐会话计算
- **会话分类** — 自动归类：对话型、工具型、高效型、浪费型、均衡型
- **异常检测** — 标记高 Token、多工具、长会话、上下文压力等异常
- **趋势图表** — 最近 30 个会话的 Token/轮次/工具趋势，Recharts 交互式，点击数据点跳转对应会话
- **会话对比** — 任意两个会话并排对比指标
- **多会话选择器** — 自由勾选任意会话组合，所有指标自动重算

### 实用工具
- **费用估算** — 内置 OpenAI、Anthropic、DeepSeek、GLM、Kimi、Qwen、MiniMax 及自定义定价
- **数据导出** — CSV / JSON 格式下载全部会话数据
- **分享卡片** — 一键生成会话摘要卡片（PNG），纯本地生成
- **思维分析** — Agent 推理模式检测：目标聚焦、重试循环、自我纠正、顶点时刻
- **自定义告警** — 可配置日均 Token、单轮 Token、工具调用数阈值
- **Webhooks** — 会话事件的 POST 通知，支持模板变量
- **书签收藏** — 星标重要会话快速访问

### 用户体验
- **暗色/亮色主题** — 一键切换，偏好保存
- **平台切换** — 一键切换 Codex / Claude Code / Cursor 仪表盘模式
- **键盘导航** — ↑↓ / jk 浏览 Turn，Esc 关闭面板
## 🚀 一键启动

### Windows — 双击 `start.bat`

> 就这一步。不用终端，不用命令，双击即可。

脚本自动完成：
1. 检查 Node.js（没装会提示下载）
2. 安装所有依赖（仅首次运行）
3. 构建前端（仅首次运行）
4. 在 3344 端口启动服务
5. 自动打开浏览器进入仪表盘

**第二次运行秒开**—依赖和构建已缓存，直接跳过。

> 💡 **小技巧**：把 `start.bat` 固定到任务栏或桌面，每天双击即用。

### 备用：终端方式
```powershell
# Windows（PowerShell）
powershell -ExecutionPolicy Bypass -File setup.ps1
```

```bash
# macOS / Linux
bash setup.sh
```

### Codex 自动启动

在 `AGENTS.md` 中添加以下代码，每次 Codex 启动时自动运行 Mindrift：

```powershell
if (-not (netstat -ano 2>$null | Select-String ":3344.*LISTENING")) {
  Start-Process cmd -ArgumentList "/c cd /d \\"D:\\path\\to\\mindrift\\server\\" && npx tsx index.ts" -WindowStyle Hidden
}
Start-Process "http://localhost:3344"
```

也可使用自带的 `daemon.ps1`—它监视 `Codex.exe` 进程，自动启停 Mindrift。放在 Windows 启动目录即可开机自启。

### 环境要求
- **Node.js 18+** — [下载地址](https://nodejs.org)（推荐 LTS 版本）
- 无需其他依赖，不用装 Python，不用 Docker

## 🔧 手动安装

```bash
git clone https://github.com/ojkkk/mindrift.git
cd mindrift

# 安装依赖
cd client && npm install && cd ../server && npm install && cd ..

# 构建前端
cd client && npx vite build && cd ..

# 启动服务
cd server && npx tsx index.ts
```

浏览器打开 **http://localhost:3344**。

## 🏗 架构

```
 ~/.codex/sessions/    ~/.claude/projects/     ~/.cursor-tutor/
        |                      |                      |
        +----------------------+----------------------+
                               |
                        +------v------+
                        |  Mindrift    |
                        |  Server      |
                        |  (Express +  |
                        |   WebSocket) |
                        +------+------+
                               |
                  +------------+------------+
                  |            |            |
            +-----v-----+ +---v----+ +-----v-----+
            |  /api/*    | | Server | |   /ws     |
            +-----+------+ +---+----+ +-----+-----+
                  |            |            |
                  +------------+------------+
                               |
                        +------v------+
                        |  React SPA  |
                        |  Dashboard  |
                        +-------------+
```

### 工作原理
- **日志解析** — 每个平台的会话日志格式（Codex JSONL、Claude Code JSONL、Cursor JSON/JSONL）均有专属解析器。解析器提取 Turn、Token、工具调用、计划步骤和异常标记。
- **会话扫描** — 启动时，`scanAllSessions()` 遍历所有配置平台的会话目录，提取每个会话的元数据。
- **实时更新** — `chokidar` 监听活跃会话文件。文件变化时解析器重新解析，新状态约 300ms 通过 WebSocket 推送到浏览器。
- **Token 计算** — 每 Turn Token 从 `last_token_usage` 事件增量计算，而非累积总量。浪费 Token 通过完整解析 aborted/compacted Turn 精确计算。

### 多平台解析器架构

```
server/parsers/
  ├── index.ts          ← 自动检测 + 路由
  ├── claude.ts         ← Claude Code 解析器
  └── cursor.ts         ← Cursor Agent 解析器
```

Codex 主解析器内联在 `server/index.ts`。新平台解析器只需遵循 `ParsedSession` 接口，新增文件并在 `index.ts` 中注册即可。

## 📊 仪表盘指南

### 顶部信息栏
| 统计 | 含义 |
|------|------|
| **今日** | 今日活动的 Token + 会话数 |
| **本月** | 本月累计 Token + 会话数 |
| **模型** | 检测到的模型供应商（如 deepseek、openai、anthropic） |
| **估算费用** | 基于选定定价模型的估算费用 |

### 会话侧边栏
- 每张卡片：会话名、Turn 数、Token 总量、分类标签
- 来源标签（Codex/Claude/Cursor）
- 星标收藏按钮
- 搜索/过滤栏：按名称、Token 范围、工具数、异常、收藏

### Turn 侧边栏
- 每轮卡片：Turn 编号、用户消息预览、Token 数（in/out）、工具调用数
- 状态指示：绿点 = 已完成，青色脉冲 = 进行中，红色 X = 已中断
- `ctxXX%` = 上下文窗口占用率
- `effXX%` = Turn 级效率评分
- 浪费 Token 标记（红色闪电图标）

### 详情面板（右侧）
- **Overview**：Turn 摘要、Agent 回复、工具调用瀑布流
- **Timeline**：选中 Turn 的按时间排序的事件日志
- **Tools**：按类型分组的工具调用树，自动检测模式（重复调用、慢调用、失败）
- **Thinking**：Agent 推理分析：目标聚焦、重试检测、自我纠正、顶点时刻
- **All Turns**：每 Turn Token 柱状图（输入/缓存/输出/推理）
- **Insights**：效率评分、会话类型分布、异常标记、多会话选择器、并排对比
- **Trends**：三张交互式图表（Token、Turn、工具），数据点可点击跳转会话
- **Plan**：`update_plan` 步骤进度及完成状态
- **Raw**：原始会话日志查看器

## ⚙ 配置说明

编辑 `mindrift.config.json` 或使用界面内 **Setup** 菜单（用户图标 → Setup）：

```json
{
  "port": 3344,
  "theme": "dark",
  "costModel": "custom",
  "sources": [
    { "type": "codex", "path": "" },
    { "type": "claude-code", "path": "" }
  ],
  "alerts": {
    "enabled": true,
    "dailyTokenLimit": 1000000,
    "singleTurnTokenLimit": 50000,
    "toolCallLimitPerTurn": 30
  },
  "webhooks": [
    {
      "event": "session_start",
      "url": "https://your-webhook.example.com/mindrift",
      "payload": { "text": "新会话：{{session.name}}" }
    }
  ]
}
```

### 费用模型
| 模型 | 输入（每百万） | 输出（每百万） |
|------|--------------|--------------|
| GPT-5 | $1.25 | $10.00 |
| GPT-5 Mini | $0.15 | $0.60 |
| GPT-4o | $2.50 | $10.00 |
| Claude Sonnet 4 | $3.00 | $15.00 |
| Claude Opus 4 | $15.00 | $75.00 |
| DeepSeek V4 Pro | $0.55 | $2.19 |
| GLM-5.1 | $1.40 | $4.40 |
| Kimi K2.6 | $0.95 | $4.00 |
| Qwen 3.7 Max | $2.50 | $7.50 |
| MiniMax M3 | $0.30 | $1.20 |
| 自动检测 | $0.50 | $2.00 |

## 🖨 支持平台

| 平台 | 状态 | 数据路径 | 备注 |
|------|------|---------|------|
| **Codex** | ✅ 生产可用 | `~/.codex/sessions/` | 全部功能已测试 |
| **Claude Code** | ✅ 生产可用 | `~/.claude/projects/` | 解析器已完成，实测验证 |
| **Cursor** | 🧪 实验性 | `~/.cursor-tutor/`、`.cursor/agent/`、`%APPDATA%/Cursor/agent_logs/` | 日志格式因版本而异 |

## ⌨ 键盘快捷键

| 按键 | 操作 |
|------|------|
| ↑ / k | 上一个 Turn |
| ↓ / j | 下一个 Turn |
| Esc | 关闭详情视图 / 关闭 Setup |

## 🔒 数据隐私

- **100% 本地** — 所有数据留在你的电脑上
- **零遥测** — 不向外部服务发送任何网络请求（可选 Webhooks 除外）
- **不上云** — 无账号、无数据库、无第三方服务器
- **只读** — Mindrift 永远不会写入你的会话文件
- **开源** — 每一行代码都可审计

## 😓 技术栈

| 层 | 技术 |
|----|------|
| **运行时** | Node.js 18+ |
| **服务端** | Express、ws（WebSocket）、chokidar、tsx |
| **客户端** | React 19、Vite 6、Tailwind CSS v4 |
| **图表** | Recharts 3 |
| **图标** | Lucide React |
| **导出** | CSV + JSON（`/api/export/*`） |
| **图片** | html-to-image（分享卡片） |

## 🗺 路线图

- [ ] 团队仪表盘 — 团队聚合统计（本地隐私模型）
- [ ] 每轮费用明细
- [ ] 自定义仪表盘布局
- [ ] 移动端适配
- [ ] 插件系统支持自定义数据源

## ❓ 常见问题

**Q: 会影响 Agent 速度吗？**
A: 不会。Mindrift 只读取已在写入的日志文件，零额外开销。

**Q: 能读历史会话吗？**
A: 能。所有会话目录中的历史会话启动时自动扫描。

**Q: 支持自定义 API 供应商吗？**
A: 支持。模型名称从会话日志自动检测，也可手动设置费用模型。

**Q: 隐私怎么保证？**
A: 一切在本地运行。Mindrift 不会把你的数据发送到任何地方。

**Q: 能换端口吗？**
A: 能。在 `mindrift.config.json` 中修改 `port`，或设置 `PORT` 环境变量。

## 📄 许可证

MIT — 随便用。为 AI Agent 社区用 ❤ 打造。
