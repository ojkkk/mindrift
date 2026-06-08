# 🔬 Mindrift

> Monitor every thought, token, and tool call.

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/English-EN-blue?style=flat-square" /></a>
  <a href="README.zh-CN.md"><img src="https://img.shields.io/badge/中文-中文-red?style=flat-square" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Codex-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
  <img src="https://img.shields.io/badge/instrumentation-zero-brightgreen?style=flat-square" />
  <img src="https://img.shields.io/badge/privacy-100%25_local-orange?style=flat-square" />
</p>

**Real-time visualization dashboard for Codex AI agents.** Think of it as a heart-rate monitor for your AI — watch it think, call tools, burn tokens, and navigate context windows. All from your local filesystem, with zero instrumentation.

![Mindrift Dashboard](https://img.shields.io/badge/demo-coming_soon-lightgrey?style=flat-square)

---

## ✨ What It Does

- **Token Pulse** — Real-time token consumption (input / output / reasoning), per-turn breakdown
- **Tool Waterfall** — Every shell command, file patch, web search visualized as a timeline
- **Timeline View** — Chronological replay of each turn: user message → thinking → tool calls → agent response
- **Context Pressure Gauge** — See how close each turn gets to the context window limit
- **Agent Health Score** — Weighted health metric: errors, compacted turns, aborts, wasted tokens
- **Session Browser** — Navigate all past conversations, search, filter by tokens/tools/anomalies
- **Dark & Light Themes** — Toggle with one click, preference saved locally
- **100% Local** — Reads Codex session logs from `~/.codex/sessions/`, never phones home

## 🎯 Zero Instrumentation

Mindrift reads Codex's **native JSONL session logs**. No plugins, no API keys, no config files. If Codex is running, Mindrift already has data.

```
Codex writes sessions → Mindrift watches the files → Dashboard updates in real-time
```

## 🚀 Quick Start

### One-Click (Windows)
```powershell
.\setup.bat
```

### One-Click (macOS / Linux)
```bash
chmod +x setup.sh && ./setup.sh
```

### Manual
```bash
# 1. Install server dependencies
cd mindrift/server && npm install

# 2. Install client dependencies & build
cd ../client && npm install && npx vite build

# 3. Start the server
cd ../server && node index.js

# 4. Open your browser
# → http://localhost:3344
```

## 📊 Architecture

```
Codex Desktop
    │  writes JSONL in real-time
    ▼
~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
    │  chokidar file watcher (300ms poll)
    ▼
Node.js Server (Express + WebSocket, :3344)
    │  parseSession() → turns, tools, plans, tokens
    │  scanAllSessions() → browse all history
    │  computeStats() → today/month aggregates
    ▼
React Frontend (Vite + Tailwind CSS v4)
    │  useMindrift hook → WebSocket state sync
    │  6 views: Overview / Timeline / Tools / Thinking / All Turns / Raw
    ▼
Dashboard UI → http://localhost:3344
```

### Data Source Traceability

Every number on screen traces back to a specific JSONL event:

| Display | JSONL Source |
|---------|-------------|
| Session name | `event_msg.user_message` (first meaningful line) |
| Turn count | `turn_context` events (deduplicated by turn_id) |
| Token usage | `event_msg.token_count` → `total_token_usage.*` |
| Tool calls | `response_item.function_call` + `function_call_output` |
| Plan steps | `response_item.function_call` where `name === "update_plan"` |
| Agent messages | `event_msg.agent_message` (all of them, chronologically) |
| Thinking | `event_msg.agent_reasoning` (full text) |
| Context window | `event_msg.token_count.model_context_window` |

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express, chokidar, WebSocket (ws) |
| Frontend | React 19, Vite 6, Tailwind CSS v4 |
| Icons | Lucide React |
| Charts | Custom SVG (no charting library dependency) |

## 📁 Project Structure

```
mindrift/
├── server/
│   ├── index.js          # Express + WS server, all parsing logic
│   └── package.json
├── client/
│   ├── src/
│   │   ├── App.jsx       # Main layout + header stats
│   │   ├── index.css     # Theme variables + base styles
│   │   ├── hooks/
│   │   │   └── useMindrift.js  # WebSocket state management
│   │   └── components/
│   │       ├── TurnSidebar.jsx    # Turn list panel
│   │       ├── TurnDetail.jsx    # Main content (6 views)
│   │       ├── Timeline.jsx      # Chronological event timeline
│   │       ├── ToolCallTree.jsx  # Tool call analysis
│   │       ├── ThinkingAnalysis.jsx # Reasoning pattern detection
│   │       ├── SessionBar.jsx    # Session card browser
│   │       ├── SessionFilter.jsx # Search & filter
│   │       ├── TokenDonut.jsx    # Token composition ring
│   │       ├── TurnTokenChart.jsx # Per-turn token bars
│   │       └── RawLogViewer.jsx  # Raw JSONL viewer
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── setup.bat             # Windows one-click installer
├── setup.sh              # macOS/Linux one-click installer
└── README.md
```

## 🔒 Privacy

- **100% local** — never connects to the internet
- **No telemetry** — no analytics, no crash reports, no data collection
- **Read-only** — only reads Codex session files, never writes to them
- **No API keys** — doesn't need any credentials or tokens

## 📄 License

MIT © 2026

---

<p align="center">
  <sub>Built for the Codex community. Not affiliated with OpenAI.</sub>
</p>