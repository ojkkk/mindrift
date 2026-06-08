# Mindrift — AI Agent Observability Dashboard

> **Monitor every thought, token, and tool call. Zero instrumentation.**

Mindrift is a real-time observability dashboard for AI coding agents (Codex, Claude Code, Cursor). It reads local session logs, visualizes token consumption, tool call waterfalls, decision plans, and efficiency metrics — all without touching your AI agent's code.

![Mindrift](https://img.shields.io/badge/status-active-brightgreen)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## Features

- **Real-time Token Monitoring** — Track input/output/reasoning tokens per turn with live WebSocket updates
- **Tool Call Waterfall** — Visualize every tool invocation with duration, arguments, and output
- **Agent Plan Tracking** — See what the AI is planning (`update_plan` calls) in real time
- **Multi-Platform** — Supports **Codex**, **Claude Code**, and **Cursor** (switch in Setup)
- **Efficiency Scoring** — 5-factor composite score: token ROI, tool success, context utilization, waste ratio, overall
- **Session Insights** — Per-session anomaly detection, category classification (chat-heavy, tool-heavy, etc.)
- **Trend Charts** — Token consumption, turn count, and tool call trends across sessions
- **Cost Estimation** — Built-in pricing for OpenAI, Anthropic, DeepSeek, and others
- **Dark/Light Theme** — Toggle with one click
- **100% Local & Private** — Reads `~/.codex/sessions/*.jsonl` directly, no telemetry, no cloud

## Quick Start

```bash
# 1. Clone
git clone https://github.com/ojkkk/mindrift.git
cd mindrift

# 2. Install dependencies
cd client && npm install
cd ../server && npm install
cd ..

# 3. Build frontend
cd client && npx vite build && cd ..

# 4. Start server
cd server && npx tsx index.ts
```

Open **http://localhost:3344** in your browser.

### Auto-start with Codex

Add this to your `AGENTS.md`:

```powershell
# At the START of each turn: auto-start Mindrift if not running
if (-not (netstat -ano 2>$null | Select-String ":3344.*LISTENING")) {
  Start-Process cmd -ArgumentList "/c cd /d `"D:\new idea\mindrift\server`" && npx tsx index.ts" -WindowStyle Hidden
}
```

## Architecture

```
~/.codex/sessions/*.jsonl  ──→  chokidar (file watcher)
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

- **Server**: Node.js + Express + WebSocket + tsx
- **Client**: React 19, Vite 6, Tailwind CSS v4, Recharts, Lucide icons
- **Data Source**: `~/.codex/sessions/*.jsonl` (Codex), `~/.claude/projects/` (Claude), `~/.cursor-tutor/` (Cursor)
- **Config**: `mindrift.config.json` (port, theme, alerts, cost model)

## Configuration

Edit `mindrift.config.json`:

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

Or use the in-app **Setup** menu (click the user icon).

## Supported Platforms

| Platform | Source Path | Parser Status |
|----------|------------|---------------|
| Codex | `~/.codex/sessions/` | ✅ Production |
| Claude Code | `~/.claude/projects/` | ⚠️ Untested |
| Cursor | `~/.cursor-tutor/` | 🧪 Experimental |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` / `k` | Previous turn |
| `↓` / `j` | Next turn |
| `Esc` | Close detail view |

## Tech Stack

- **Backend**: Node.js, Express, WebSocket (ws), chokidar, tsx
- **Frontend**: React 19, Vite 6, Tailwind CSS v4, Recharts, Lucide React
- **Export**: CSV + JSON via `/api/export/*`
- **MCP**: Standalone MCP server (`server/mcp.ts`) with 3 tools + 2 resources
- **Webhooks**: Configurable POST on session events

## License

MIT — do whatever you want, just don't blame us.

---

Built with ❤️ for AI agent developers who want to understand what their agents are *actually* doing.
