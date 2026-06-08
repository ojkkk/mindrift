# Mindrift（心流）— AI Agent 可观测性仪表盘

> **监控每一个想法、每一个 Token、每一次工具调用。零侵入。**

Mindrift 是一个为 AI 编程助手（Codex、Claude Code、Cursor）设计的实时可观测性仪表盘。它读取本地会话日志，可视化 Token 消耗、工具调用瀑布流、决策计划和效率指标 — 完全不需要修改你的 AI Agent 代码。

## 功能特性

- **实时 Token 监控** — 通过 WebSocket 实时追踪每轮对话的输入/输出/推理 Token
- **工具调用瀑布流** — 可视化每次工具调用，包含耗时、参数和输出
- **Agent 计划追踪** — 实时查看 AI 的 `update_plan` 决策计划
- **多平台支持** — 支持 **Codex**、**Claude Code**、**Cursor**（Setup 中切换）
- **效率评分** — 五维综合评分：Token ROI、工具成功率、上下文利用率、浪费率、总分
- **会话洞察** — 单会话异常检测、类型分类（对话型/工具型/高效型/浪费型）
- **趋势图表** — 跨会话的 Token 消耗、轮次、工具调用趋势
- **费用估算** — 内置 OpenAI、Anthropic、DeepSeek 等定价表
- **暗色/亮色主题** — 一键切换
- **100% 本地 & 隐私** — 直接读取本地 JSONL 文件，无遥测，不上云

## 快速开始

```bash
# 1. 克隆
git clone https://github.com/ojkkk/mindrift.git
cd mindrift

# 2. 安装依赖
cd client && npm install
cd ../server && npm install
cd ..

# 3. 构建前端
cd client && npx vite build && cd ..

# 4. 启动服务
cd server && npx tsx index.ts
```

浏览器打开 **http://localhost:3344**。

### Codex 自动启动

在你的 `AGENTS.md` 中添加：

```powershell
# 每个 turn 开始时自动启动 Mindrift
if (-not (netstat -ano 2>$null | Select-String ":3344.*LISTENING")) {
  Start-Process cmd -ArgumentList "/c cd /d `"D:\new idea\mindrift\server`" && npx tsx index.ts" -WindowStyle Hidden
}
```

## 架构

```
~/.codex/sessions/*.jsonl  ──→  chokidar（文件监听）
                                      │
                                      ▼
                              parseSession()  ──→  turns, toolCalls, planSteps, tokenMetrics
                                      │
                                      ▼
                              WebSocket (ws://localhost:3344/ws)
                                      │
                                      ▼
                              React 19 + Vite 6 + Tailwind CSS v4 + Recharts
```

- **服务端**: Node.js + Express + WebSocket + tsx
- **客户端**: React 19, Vite 6, Tailwind CSS v4, Recharts, Lucide 图标
- **数据源**: `~/.codex/sessions/*.jsonl`（Codex）, `~/.claude/projects/`（Claude）, `~/.cursor-tutor/`（Cursor）
- **配置**: `mindrift.config.json`（端口、主题、告警、费用模型）

## 支持的平台

| 平台 | 数据路径 | 解析器状态 |
|------|---------|-----------|
| Codex | `~/.codex/sessions/` | ✅ 生产可用 |
| Claude Code | `~/.claude/projects/` | ⚠️ 未测试 |
| Cursor | `~/.cursor-tutor/` | 🧪 实验性 |

## 键盘快捷键

| 按键 | 操作 |
|------|------|
| `↑` / `k` | 上一个 Turn |
| `↓` / `j` | 下一个 Turn |
| `Esc` | 关闭详情视图 |

## 技术栈

- **后端**: Node.js, Express, WebSocket (ws), chokidar, tsx
- **前端**: React 19, Vite 6, Tailwind CSS v4, Recharts, Lucide React
- **导出**: CSV + JSON（`/api/export/*`）
- **MCP**: 独立 MCP 服务器（`server/mcp.ts`），3 个工具 + 2 个资源
- **Webhooks**: 可配置的会话事件 POST 通知

## License

MIT — 随便用，别怪我们就行。

---

为想搞清楚自己 AI Agent 到底在干什么的开发者们，用 ❤️ 打造。
