<p align="center">
  <h1 align="center">🧠 Mindrift</h1>
  <p align="center"><strong>The open-source observability dashboard for AI coding agents.<br/>Zero instrumentation. Watch every thought, token, and tool call in real time.</strong></p>
  <p align="center">
    <a href="README.md"><img src="https://img.shields.io/badge/lang-EN-red" alt="English"></a>
    <a href="README.zh-CN.md"><img src="https://img.shields.io/badge/lang-中文-blue" alt="Chinese"></a>
    <img src="https://img.shields.io/badge/status-active-brightgreen" alt="Status">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
    <img src="https://img.shields.io/badge/platform-Codex%20%7C%20Claude%20Code%20%7C%20Cursor-cyan" alt="Platform">
  </p>
</p>

---

> **“Like a heart-rate monitor for your AI agent. Debug, optimize, or just watch it think.”**

Mindrift reads your local agent session logs and builds a real-time dashboard — token consumption, tool call waterfalls, plan tracking, efficiency scores, anomaly detection, cost estimation — without modifying a single line of agent code.

## ✨ Features

### Real-Time Monitoring
- **Token Tracking** — Input / output / reasoning / cache tokens per turn, pushed via WebSocket in ~300 ms
- **Tool Call Waterfall** — Duration, arguments, and output for every function call, organized by tool type with pattern detection
- **Plan Tracking** — `update_plan` step tree rendered live as your agent works
- **Turn Timeline** — Chronological event stream for each conversation turn

### Analysis & Insights
- **4-Factor Efficiency Score** — Token ROI, tool success rate, waste ratio, and context headroom, computed per turn and per session
- **Session Categorization** — Auto-classified as chat-heavy, tool-heavy, efficient, wasteful, or balanced
- **Anomaly Detection** — Flags high-token, many-tools, long-session, and context-pressure sessions
- **Trend Charts** — 30-session token / turn / tool trends with Recharts, click any data point to jump to that session
- **Session Comparison** — Side-by-side metrics for any two sessions
- **Multi-Session Selector** — Pick any combination of sessions to recalculate all aggregate metrics on the fly

### Practical Tools
- **Cost Estimation** — Built-in pricing tables for OpenAI, Anthropic, DeepSeek, GLM, Kimi, Qwen, MiniMax, and custom models
- **Data Export** — Download all session data as CSV or JSON
- **Share Card** — One-click PNG summary card for any session (powered by html-to-image)
- **Thinking Analysis** — Pattern detection in agent reasoning: goal focus, retry loops, self-correction, insight moments
- **Custom Alerts** — Configurable thresholds for daily tokens, single-turn tokens, and tool call count
- **Webhooks** — POST notifications on session events with template variables
- **Bookmarks** — Star important sessions for quick access

### User Experience
- **Dark / Light Theme** — Toggle with one click, persisted in localStorage
- **Platform Switching** — One-click Codex / Claude Code / Cursor dashboard mode
- **Keyboard Navigation** — Arrow keys / jk to browse turns, Esc to close panels
## 🚀 Quick Start

### Windows — Double-click `start.bat`

That’s it. No terminal, no commands. The script:
1. Checks for Node.js (prompts you to install if missing)
2. Installs all dependencies (first run only)
3. Builds the frontend (first run only)
4. Starts the server on port 3344
5. Opens your browser to the dashboard

Subsequent launches skip install and build — instant start.

> 💡 **Tip:** Pin `start.bat` to your taskbar for daily one-click access.

### Terminal

```powershell
# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File setup.ps1
```

```bash
# macOS / Linux
bash setup.sh
```

### Auto-start with Codex

Add this to `AGENTS.md` to launch Mindrift automatically with every Codex session:

```powershell
if (-not (netstat -ano 2>$null | Select-String ":3344.*LISTENING")) {
  Start-Process cmd -ArgumentList "/c cd /d \\"D:\\path\\to\\mindrift\\server\\" && npx tsx index.ts" -WindowStyle Hidden
}
Start-Process "http://localhost:3344"
```

Or use the included `daemon.ps1` — it watches for `Codex.exe` and starts/stops Mindrift accordingly. Place it in your Windows Startup folder for auto-launch at login.

### Requirements
- **Node.js 18+** — [Download](https://nodejs.org) (LTS recommended)
- Nothing else. No Python, no Docker, no accounts.

## 🔧 Manual Setup

```bash
git clone https://github.com/ojkkk/mindrift.git
cd mindrift

# Install dependencies
cd client && npm install && cd ../server && npm install && cd ..

# Build frontend
cd client && npx vite build && cd ..

# Start server
cd server && npx tsx index.ts
```

Open **http://localhost:3344**.

## 🏗 Architecture

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

### How It Works
- **Log Parsing** — Each platform’s session log format (Codex JSONL, Claude Code JSONL, Cursor JSON/JSONL) has a dedicated parser. Parsers extract turns, tokens, tool calls, plan steps, and anomalies.
- **Session Scanning** — On startup, `scanAllSessions()` walks the session directories for all configured platforms, extracting metadata for each session.
- **Real-Time Updates** — `chokidar` watches the active session file. On change, the file is re-parsed and new state is broadcast to all browsers via WebSocket within ~300 ms.
- **Token Calculation** — Per-turn tokens are computed from `last_token_usage` event deltas, not cumulative totals. Wasted tokens are calculated from aborted and context-compacted turns.

### Multi-Platform Parser Architecture

```
server/parsers/
  ├── index.ts          ← Auto-detect + router
  ├── claude.ts         ← Claude Code parser
  └── cursor.ts         ← Cursor Agent parser
```

The main Codex parser is inline in `server/index.ts`. New platform parsers follow the same `ParsedSession` interface — just drop in a new file and register it in `index.ts`.

## 📊 Dashboard Guide

### Top Bar
| Stat | Meaning |
|------|---------|
| **Today** | Tokens consumed today + number of active sessions |
| **Month** | Tokens consumed this month + session count |
| **API** | Detected model provider (deepseek, openai, anthropic, etc.) |
| **Est. Cost** | Estimated cost based on your selected pricing model |

### Session Sidebar
- Session card: name, turn count, token total, category badge
- Source badge: Codex / Claude / Cursor
- Star icon for bookmarking
- Search + filter bar (by name, token range, tool count, anomalies, starred)

### Turn Sidebar
- Turn card: number, user message preview, input/output tokens, tool count
- Status indicators: green = done, cyan pulse = active, red X = aborted
- `ctxXX%` = context window fill percentage
- `effXX%` = turn-level efficiency score
- Red lightning badge for wasted tokens

### Detail Panel (right)
- **Overview** — Turn summary, agent messages, tool call waterfall
- **Timeline** — Chronological event log for the selected turn
- **Tools** — Tool call tree grouped by type, with pattern detection (repeated calls, slow calls, failures)
- **Thinking** — Agent reasoning analysis: goal focus, retry detection, self-correction, insight moments
- **All Turns** — Per-turn token bar chart (input / cache / output / reasoning)
- **Insights** — Efficiency scores, session category distribution, anomaly flags, multi-session selector, side-by-side comparison
- **Trends** — Three interactive Recharts line charts (tokens, turns, tools), data points link to sessions
- **Plan** — `update_plan` step progress with completion status
- **Raw** — Raw session log viewer

## ⚙ Configuration

Edit `mindrift.config.json` or use the in-app **Setup** menu (user icon → Setup):

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
| GLM-5.1 | $1.40 | $4.40 |
| Kimi K2.6 | $0.95 | $4.00 |
| Qwen 3.7 Max | $2.50 | $7.50 |
| MiniMax M3 | $0.30 | $1.20 |
| Custom (autodetect) | $0.50 | $2.00 |

## 🖨 Supported Platforms

| Platform | Status | Log Path | Notes |
|----------|--------|----------|-------|
| **Codex** | ✅ Production | `~/.codex/sessions/` | Full support, all features tested |
| **Claude Code** | ✅ Production | `~/.claude/projects/` | Parser complete, tested on real sessions |
| **Cursor** | 🧪 Experimental | `~/.cursor-tutor/`, `.cursor/agent/`, `%APPDATA%/Cursor/agent_logs/` | Log format varies by version |

## ⌨ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| ↑ / k | Previous turn |
| ↓ / j | Next turn |
| Esc | Close detail view / close setup |

## 🔒 Data Privacy

- **100% Local** — All data stays on your machine
- **Zero Telemetry** — No network calls to external services (except optional webhooks you configure)
- **No Cloud** — No accounts, no databases, no third-party servers
- **Read-Only** — Mindrift never writes to your session files
- **Open Source** — Every line of code is auditable

## 😓 Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Server | Express, ws (WebSocket), chokidar, tsx |
| Client | React 19, Vite 6, Tailwind CSS v4 |
| Charts | Recharts 3 |
| Icons | Lucide React |
| Export | CSV + JSON via /api/export/* |
| Share Cards | html-to-image |

## 🗺 Roadmap

- [ ] Team Dashboard — aggregated stats across a team (local privacy model)
- [ ] Per-turn cost breakdown
- [ ] Custom dashboard layouts
- [ ] Mobile-responsive design
- [ ] Plugin system for custom data sources

## ❓ FAQ

**Does this slow down my agent?**
No. Mindrift only reads log files that are already being written. Zero overhead.

**Can it read old sessions?**
Yes. All past sessions in your session directories are scanned on startup.

**Does it work with custom API providers?**
Yes. Model name is auto-detected from session logs. You can also set a custom pricing model.

**What about privacy?**
Everything runs locally. Mindrift never sends your data anywhere.

**Can I run it on a different port?**
Yes. Change `port` in `mindrift.config.json` or set the `PORT` environment variable.

## 📄 License

MIT — use it however you like. Built with ❤ for the AI agent community.
