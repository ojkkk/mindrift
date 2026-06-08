<p align="center">
  <h1 align="center">🧠 Mindrift（心流）</h1>
  <p align="center"><strong>监控每一个想法、每一个 Token、每一次工具调用。零侵入。</strong></p>
  <p align="center">
    <img src="https://img.shields.io/badge/status-active-brightgreen" alt="Status">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
    <img src="https://img.shields.io/badge/platform-Codex%20|%20Claude%20Code%20|%20Cursor-cyan" alt="Platform">
  </p>
</p>

---

Mindrift 是一个 AI 编程助手的实时可观测性仪表盘。它读取本地会话日志，可视化你的 AI 在做什么——Token 消耗、工具调用瀑布流、决策计划、效率指标——完全不需要修改任何一行 Agent 代码。

> **"就像给 AI 装了心电监护仪。可以 Debug，可以优化，也可以当屏保看。"**

## 目录

- [功能特性](#功能特性)
- [一键启动](#一键启动)
- [手动安装](#手动安装)
- [架构](#架构)
- [工作原理](#工作原理)
- [仪表盘指南](#仪表盘指南)
- [配置说明](#配置说明)
- [支持平台](#支持平台)
- [键盘快捷键](#键盘快捷键)
- [数据隐私](#数据隐私)
- [技术栈](#技术栈)
- [路线图](#路线图)
- [常见问题](#常见问题)
- [许可证](#许可证)

## 功能特性

### 核心监控
- **实时 Token 追踪** — 每轮对话的输入、输出、推理 Token，WebSocket 实时更新
- **工具调用瀑布流** — 每次函数调用的耗时、参数、输出预览
- **Agent 计划追踪** — `update_plan` 决策树实时显示
- **Turn 时间线** — 每轮对话的按时间排列的事件流

### 分析与洞察
- **效率评分** — 四维评分：Token ROI、工具成功率、浪费率、上下文余量
- **会话分类** — 自动分类：对话型、工具型、高效型、浪费型、均衡型
- **异常检测** — 标记高 Token、多工具、长会话、上下文压力等异常
- **趋势图表** — 最近 30 个会话的 Token 消耗、轮次、工具调用趋势
- **多会话选择器** — 自由勾选任意会话组合，所有指标自动重算

### 实用工具
- **费用估算** — 内置 OpenAI、Anthropic、DeepSeek 及自定义定价
- **数据导出** — CSV / JSON 格式下载全部会话数据
- **分享卡片** — 为任意会话生成可分享的摘要卡片
- **自定义告警** — 可配置日均 Token、单轮 Token、工具调用数阈值
- **Webhooks** — 会话事件发生时的 POST 通知
- **书签收藏** — 星标重要会话快速访问

### 用户体验
- **暗色/亮色主题** — 一键切换，偏好保存
- **平台切换** — 一键切换 Codex / Claude Code / Cursor 仪表盘
- **键盘导航** — `↑↓` / `jk` 切换 Turn，`Esc` 关闭视图
- **MCP 服务器** — 独立 MCP 服务，3 个工具 + 2 个资源，供 AI 间通信

## 一键启动

### Windows
```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1
```

### macOS / Linux
```bash
bash setup.sh
```

脚本会自动完成：
1. 检查 Node.js 环境
2. 安装所有依赖
3. 构建前端
4. 在 3344 端口启动服务
5. 自动打开浏览器

### Codex 自动启动

在 `AGENTS.md` 中添加以下代码，每次 Codex 启动时自动运行 Mindrift 并打开仪表盘：

```powershell
# 每个 turn 开始时自动启动 Mindrift
if (-not (netstat -ano 2>$null | Select-String ":3344.*LISTENING")) {
  Start-Process cmd -ArgumentList "/c cd /d `"D:\path\to\mindrift\server`" && npx tsx index.ts" -WindowStyle Hidden
}
Start-Process "http://localhost:3344"
```

## 手动安装

```bash
# 1. 克隆仓库
git clone https://github.com/ojkkk/mindrift.git
cd mindrift

# 2. 安装依赖
cd client && npm install && cd ../server && npm install && cd ..

# 3. 构建前端
cd client && npx vite build && cd ..

# 4. 启动服务
cd server && npx tsx index.ts
```

浏览器打开 **http://localhost:3344**。

## 架构

```
                       ┌─────────────────────────┐
                       │   ~/.codex/sessions/     │
                       │   ~/.claude/projects/    │
                       │   ~/.cursor-tutor/       │
                       └───────────┬─────────────┘
                                   │
                          chokidar（文件监听）
                                   │
                                   ▼
                       ┌───────────────────────┐
                       │    parseSession()     │
                       │  ┌─────────────────┐  │
                       │  │ • session_meta   │  │
                       │  │ • turn_context   │  │
                       │  │ • token_count    │  │
                       │  │ • function_call  │  │
                       │  │ • event_msg      │  │
                       │  │ • update_plan    │  │
                       │  └─────────────────┘  │
                       └───────────┬───────────┘
                                   │
                          WebSocket (ws://:3344)
                                   │
                                   ▼
                       ┌───────────────────────┐
                       │   React 19 SPA        │
                       │  ┌─────────────────┐  │
                       │  │ SessionBar       │  │
                       │  │ TurnSidebar      │  │
                       │  │ TurnDetail       │  │
                       │  │ AnomalyInsights  │  │
                       │  │ SessionTrend     │  │
                       │  │ TokenCharts      │  │
                       │  └─────────────────┘  │
                       └───────────────────────┘
```

### 数据流
1. **文件监听** — `chokidar` 每 300ms 轮询会话文件变化
2. **解析器** — `parseSession()` 将 JSONL 行反序列化为类型化结构
3. **广播** — WebSocket 推送 `full_state` 到所有已连接客户端
4. **渲染** — React 组件订阅 WebSocket 消息并重新渲染

## 工作原理

### 零侵入
Mindrift 读取 Codex/Claude/Cursor 本来就写入磁盘的 JSONL 会话日志。不注入 Hook、不修改配置、不拦截 API 调用：

- **零性能影响** — 不影响 Agent 运行速度
- **零风险** — 不会因 Agent 版本更新而崩溃
- **回溯可用** — 所有历史会话立即可见

### 会话扫描
启动时，`scanAllSessions()` 遍历 `~/.codex/sessions/`（及 Claude/Cursor 对应路径），提取：
- 会话元数据（ID、时间戳、模型、工作目录）
- Turn 数量和 Token 总量
- 工具调用计数和成功率
- 异常标记和效率分类
- 模型供应商自动检测

### 实时更新
会话文件变化时（新 Turn、新工具调用、计划更新），监听器触发重新解析。新状态在 ~300ms 内通过 WebSocket 推送到浏览器。

### Token 计算
每 Turn Token 从 `last_token_usage` 事件（每步增量）计算，而非累积总量。浪费 Token 通过完整解析 aborted/compacted Turn 精确计算。

## 仪表盘指南

### 顶部信息栏
| 统计 | 含义 |
|------|------|
| **Today** | 今日活动的 Token + 会话数 |
| **Month** | 本月累计 Token + 会话数 |
| **API** | 检测到的模型供应商（如 deepseek、openai） |
| **Est. Cost** | 基于选定定价模型的估算费用 |

### 会话侧边栏
- 每张卡片：会话名、Turn 数、Token 总量、分类标签
- 来源标签（Codex/Claude/Cursor）
- 星标收藏按钮
- 搜索/过滤栏

### Turn 侧边栏
- 每轮卡片：Turn 编号、用户消息预览、Token 数（in/out）、工具调用数
- 状态指示：绿点 = 已完成，青色脉冲 = 进行中，红色 X = 已中断
- `ctxXX%` = 上下文窗口占用率
- `effXX%` = Turn 级效率评分
- 浪费 Token 标记（红色闪电图标）

### 详情面板（右侧）
- **Overview**：Turn 摘要、Agent 回复、工具调用瀑布流
- **Insights**：效率评分、会话类型、异常检测、分类分布、会话对比、多会话选择器
- **Trends**：3 张交互式图表（Token、Turn、工具），数据点可点击跳转
- **Plan**：Agent 的 `update_plan` 步骤和进度
- **Timeline**：选中 Turn 的按时间排列的事件日志

## 配置说明

编辑 `mindrift.config.json` 或使用界面内 **Setup** 菜单（用户图标 → Setup）：

```json
{
  "port": 3344,
  "theme": "dark",
  "costModel": "custom",
  "alerts": {
    "enabled": true,
    "dailyTokenLimit": 1000000,
    "singleTurnTokenLimit": 50000,
    "toolCallLimitPerTurn": 30
  }
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
| 自动检测 | $0.50 | $2.00 |

## 支持平台

| 平台 | 状态 | 数据路径 | 备注 |
|------|------|---------|------|
| **Codex** | ✅ 生产可用 | `~/.codex/sessions/` | 全部功能已测试 |
| **Claude Code** | ⚠️ 测试版 | `~/.claude/projects/` | 解析器已写，需实测 |
| **Cursor** | 🧪 实验性 | `~/.cursor-tutor/` | 日志格式因版本而异 |

## 键盘快捷键

| 按键 | 操作 |
|------|------|
| `↑` / `k` | 上一个 Turn |
| `↓` / `j` | 下一个 Turn |
| `Esc` | 关闭详情视图 / 关闭 Setup |

## 数据隐私

- **100% 本地** — 所有数据留在你的电脑上
- **零遥测** — 不向外部服务发送任何网络请求（可选 Webhooks 除外）
- **不上云** — 无账号、无数据库、无第三方服务器
- **只读** — Mindrift 永远不会写入你的会话文件
- **开源** — 每一行代码都可审计

## 技术栈

| 层 | 技术 |
|----|------|
| **运行时** | Node.js 22+ |
| **服务端** | Express、ws（WebSocket）、chokidar、tsx |
| **客户端** | React 19、Vite 6、Tailwind CSS v4 |
| **图表** | Recharts |
| **图标** | Lucide React |
| **导出** | CSV + JSON（`/api/export/*`） |
| **图片** | html-to-image（分享卡片） |
| **MCP** | 独立 MCP 服务器（`server/mcp.ts`） |

## 路线图

- [ ] 团队仪表盘 — 团队聚合统计（本地隐私模型）
- [ ] Claude Code 解析器验证
- [ ] Cursor 解析器稳定化
- [ ] 每轮费用明细
- [ ] 自定义仪表盘布局
- [ ] 移动端适配
- [ ] 插件系统支持自定义数据源

## 常见问题

**Q: 会影响 Agent 速度吗？**
A: 不会。Mindrift 只读取已在写入的日志文件，零额外开销。

**Q: 能读历史会话吗？**
A: 能。所有 `~/.codex/sessions/` 中的历史会话启动时自动扫描。

**Q: 支持自定义 API 供应商吗？**
A: 支持。模型名称从会话日志自动检测，也可手动设置费用模型。

**Q: 隐私怎么保证？**
A: 一切在本地运行。Mindrift 不会把你的数据发送到任何地方。

**Q: 能换端口吗？**
A: 能。在 `mindrift.config.json` 中修改 `port`，或设置 `PORT` 环境变量。

## 许可证

MIT — 随便用。为 AI Agent 社区用 ❤️ 打造。
