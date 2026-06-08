<p align="center">
  <h1 align="center">🧠 Mindrift</h1>
  <p align="center"><strong>Monitor every thought, token, and tool call. Zero instrumentation.</strong></p>
  <p align="center">
    <a href="README.md"><img src="https://img.shields.io/badge/lang-EN-red" alt="English"></a>
    <a href="README.zh-CN.md"><img src="https://img.shields.io/badge/lang-中文-blue" alt="Chinese"></a>
    <img src="https://img.shields.io/badge/status-active-brightgreen" alt="Status">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
    <img src="https://img.shields.io/badge/platform-Codex%20|%20Claude%20Code%20|%20Cursor-cyan" alt="Platform">
  </p>
</p>

---

Mindrift is a real-time observability dashboard for AI coding agents. It reads your local session logs and visualizes everything your agent is doing — token consumption, tool call waterfalls, decision plans, efficiency metrics — without modifying a single line of agent code.

> **"Like a heart-rate monitor for your AI agent. Debug, optimize, or just watch it think."**

## Table of Contents

- [Features](#features)
- [Quick Start (One Command)](#quick-start-one-command)
- [Manual Setup](#manual-setup)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Dashboard Guide](#dashboard-guide)
- [Configuration](#configuration)
- [Supported Platforms](#supported-platforms)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Data Privacy](#data-privacy)
- [Tech Stack](#tech-stack)
- [Roadmap](#roadmap)
- [FAQ](#faq)
- [License](#license)

## Features

### Core Monitoring
- **Real-time Token Tracking** — Input, output, and reasoning tokens per turn, updated via WebSocket
- **Tool Call Waterfall** — Every function call visualized with duration, arguments, and output previews
- **Agent Plan Tracking** — `update_plan` decision tree shown in real time
- **Turn Timeline** — Chronological event flow per conversation turn

### Analysis & Insights
- **Efficiency Scoring** — 4-factor score: Token ROI, Tool Success, Waste Ratio, Context Headroom
- **Session Categorization** — Auto-classifies sessions as chat-heavy, tool-heavy, efficient, wasteful, or balanced
- **Anomaly Detection** — Flags high-token, many-tools, long-session, and context-pressure sessions
- **Trend Charts** — Token consumption, turn counts, and tool call trends across 30 most recent sessions
- **Multi-Session Insights Selector** — Pick any combination of sessions to recalculate all metrics

### Practical Tools
- **Cost Estimation** — Built-in pricing for OpenAI, Anthropic, DeepSeek, and custom models
- **Data Export** — Download all session data as CSV or JSON
- **Share Card** — Generate a shareable summary card for any session
- **Custom Alerts** — Configurable thresholds for daily tokens, turn tokens, and tool calls
- **Webhooks** — POST notifications on session events
- **Bookmarks** — Star important sessions for quick access

### UX
- **Dark/Light Theme** — Toggle with one click, preference saved
- **Platform Switching** — One-click switch between Codex, Claude Code, and Cursor dashboards
- **Keyboard Navigation** — `↑↓` / `jk` to navigate turns, `Esc` to close views
- **MCP Server** — Standalone MCP server with 3 tools and 2 resources for AI-to-AI communication

## Quick Start (One Click)

### Windows — Double-click `start.bat`

> **That's it.** No terminal. No commands. Just double-click.

The script automatically:
1. Checks for Node.js (prompts you to install if missing)
2. Installs all dependencies (first run only)
3. Builds the frontend (first run only)
4. Starts the server on port 3344
5. Opens your browser to the dashboard

**Subsequent runs are instant** — dependencies and build are skipped if already done.

> 💡 **Pro tip**: Pin `start.bat` to your taskbar or desktop for one-click daily use.

### Alternative: Terminal
```powershell
# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File setup.ps1
```

```bash
# macOS / Linux
bash setup.sh
```

### Requirements
- **Node.js 18+** — [Download](https://nodejs.org) (LTS version recommended)
- No other dependencies. No Python. No Docker.

### Auto-start with Codex

To have Mindrift start automatically with each Codex session, add this to your `AGENTS.md`:

```powershell
# At the START of each turn: auto-start Mindrift
if (-not (netstat -ano 2>$null | Select-String ":3344.*LISTENING")) {
  Start-Process cmd -ArgumentList "/c cd /d `"D:\path\to\mindrift\server`" && npx tsx index.ts" -WindowStyle Hidden
}
Start-Process "http://localhost:3344"
```

## Manual Setup

```bash
# 1. Clone
git clone https://github.com/ojkkk/mindrift.git
cd mindrift

# 2. Install
cd client && npm install && cd ../server && npm install && cd ..

# 3. Build
cd client && npx vite build && cd ..

# 4. Start
cd server && npx tsx index.ts
```

Open **http://localhost:3344**.

## Architecture

```
                       ┌─────────────────────────┐
                       │   ~/.codex/sessions/     │
                       │   ~/.claude/projects/    │
                       │   ~/.cursor-tutor/       │
                       └───────────┬─────────────┘
                                   │
                          chokidar (file watcher)
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

### Data Flow
1. **File Watcher** — `chokidar` polls session files every 300ms for changes
2. **Parser** — `parseSession()` deserializes JSONL lines into typed structures
3. **Broadcast** — WebSocket pushes `full_state` to all connected clients
4. **Render** — React components subscribe to WebSocket messages and re-render

## How It Works

### 0% Instrumentation
Mindrift reads the same JSONL session logs that Codex/Claude/Cursor already write to disk. It does not inject hooks, modify configs, or intercept API calls. This means:

- **Zero performance impact** on your agent
- **Zero risk** of breaking agent updates
- **Works retroactively** — all past sessions are instantly available

### Session Scanning
On startup, `scanAllSessions()` walks `~/.codex/sessions/` (and equivalent paths for Claude/Cursor), reads the JSONL files, and extracts:
- Session metadata (ID, timestamp, model, CWD)
- Turn counts and token totals
- Tool call counts and success rates
- Anomaly flags and efficiency categories
- Model provider detection

### Live Updates
When a session file changes (new turn, new tool call, plan update), the watcher triggers a re-parse. The new state is pushed to all browsers via WebSocket within ~300ms.

### Token Calculation
Per-turn tokens are computed from `last_token_usage` events (per-step deltas) rather than cumulative totals. This gives accurate per-turn breakdowns. Wasted tokens are calculated from aborted and context-compacted turns using full session parsing.

## Dashboard Guide

### Top Bar
| Stat | Meaning |
|------|---------|
| **Today** | Tokens + sessions with activity today |
| **Month** | Tokens + sessions this calendar month |
| **API** | Detected model provider (e.g., deepseek, openai) |
| **Est. Cost** | Estimated cost based on your selected pricing model |

### Sessions Sidebar
- Each card shows: session name, turn count, token count, category badge
- Source badge (Codex/Claude/Cursor)
- Star icon to bookmark sessions
- Search/filter bar to find specific sessions

### Turns Sidebar
- Per-turn cards with: turn number, user message preview, token counts (in/out), tool count
- Status indicators: green dot = done, cyan pulse = active, red X = aborted
- `ctxXX%` = context window fill percentage
- `effXX%` = turn-level efficiency score
- Wasted token badge (red lightning icon) when applicable

### Detail Panel (Right)
- **Overview**: Turn summary, agent messages, tool call waterfall
- **Insights**: Efficiency scores, session types, anomaly detection, category distribution, session comparison, per-session selector
- **Trends**: 3 interactive charts (tokens, turns, tools) with clickable data points
- **Plan**: Agent's `update_plan` steps and progress
- **Timeline**: Chronological event log for the selected turn

## Configuration

Edit `mindrift.config.json` or use the in-app **Setup** menu (user icon → Setup):

```json
{
  "port": 3344,
  "theme": "dark",
  "costModel": "custom",
  "sources": [
    { "type": "codex", "path": "" },
    { "type": "claude-code", "path": "" },
    { "type": "cursor", "path": "" }
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
      "payload": { "text": "New session: {{session.name}}" }
    }
  ]
}
```

### Cost Models
| Model | Input (per 1M) | Output (per 1M) |
|-------|---------------|-----------------|
| GPT-5 | $1.25 | $10.00 |
| GPT-5 Mini | $0.15 | $0.60 |
| GPT-4o | $2.50 | $10.00 |
| Claude Sonnet 4 | $3.00 | $15.00 |
| Claude Opus 4 | $15.00 | $75.00 |
| DeepSeek V4 Pro | $0.55 | $2.19 |
| Custom (autodetect) | $0.50 | $2.00 |

## Supported Platforms

| Platform | Status | Source Path | Notes |
|----------|--------|------------|-------|
| **Codex** | ✅ Production | `~/.codex/sessions/` | Full support, all features tested |
| **Claude Code** | ⚠️ Beta | `~/.claude/projects/` | Parser written, needs real-world testing |
| **Cursor** | 🧪 Experimental | `~/.cursor-tutor/` | Log format varies by version |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` / `k` | Previous turn |
| `↓` / `j` | Next turn |
| `Esc` | Close detail view / close setup |

## Data Privacy

- **100% Local** — All data stays on your machine
- **No Telemetry** — Zero network calls to external services (except optional webhooks)
- **No Cloud** — No accounts, no databases, no third-party servers
- **Read-Only** — Mindrift never writes to your session files
- **Open Source** — Every line of code is auditable

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 22+ |
| **Server** | Express, ws (WebSocket), chokidar, tsx |
| **Client** | React 19, Vite 6, Tailwind CSS v4 |
| **Charts** | Recharts |
| **Icons** | Lucide React |
| **Export** | CSV + JSON via `/api/export/*` |
| **Images** | html-to-image (share cards) |
| **MCP** | Standalone MCP server (`server/mcp.ts`) |

## Roadmap

- [ ] Team Dashboard — aggregated stats across a team (local privacy model)
- [ ] Claude Code parser validation
- [ ] Cursor parser stabilization
- [ ] Per-turn cost breakdown
- [ ] Custom dashboard layouts
- [ ] Mobile-responsive design
- [ ] Plugin system for custom data sources

## FAQ

**Q: Does this slow down my agent?**
A: No. Mindrift reads log files that are already being written. It adds zero overhead.

**Q: Can it read old sessions?**
A: Yes. All past sessions in `~/.codex/sessions/` are scanned on startup.

**Q: Does it work with custom API providers?**
A: Yes. The model name is auto-detected from session logs. You can also set a custom pricing model.

**Q: What about privacy?**
A: Everything is local. Mindrift never sends your data anywhere.

**Q: Can I run it on a different port?**
A: Yes. Change `port` in `mindrift.config.json` or set `PORT` env var.

## License

MIT — do whatever you want. Built with ❤️ for the AI agent community.
