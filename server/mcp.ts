// ====== Mindrift MCP Server ======
// Run: npx tsx mcp.ts

const fs = require("fs");
const path = require("path");
const os = require("os");

const CODEX_SESSIONS = path.join(os.homedir(), ".codex", "sessions");

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function scanAllSessions() {
  const sessions = [];
  if (!fs.existsSync(CODEX_SESSIONS)) return sessions;
  try {
    const allFiles = [];
    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const fp = path.join(dir, e.name);
        if (e.isDirectory()) walk(fp);
        else if (e.name.endsWith(".jsonl")) allFiles.push(fp);
      }
    }
    walk(CODEX_SESSIONS);
    allFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

    for (const fp of allFiles.slice(0, 200)) {
      try {
        const stat = fs.statSync(fp);
        const raw = fs.readFileSync(fp, "utf-8");
        const lines = raw.split("\n").filter((l) => l.trim());
        let meta = null, name = "", turnCount = 0, toolCallCount = 0, totalTokens = 0;
        const seenTurns = new Set();

        for (const line of lines) {
          const evt = safeJson(line);
          if (!evt) continue;
          const { type, payload } = evt;
          if (type === "session_meta") meta = payload;
          if (type === "turn_context" && payload.turn_id && !seenTurns.has(payload.turn_id)) {
            seenTurns.add(payload.turn_id); turnCount++;
          }
          if (type === "event_msg" && payload.type === "token_count") {
            const tu = payload.info?.total_token_usage || payload.total_token_usage;
            if (tu) { const t = tu.total_tokens || 0; if (t > totalTokens) totalTokens = t; }
          }
          if (type === "response_item" && payload.type === "function_call") toolCallCount++;
          if (type === "event_msg" && payload.type === "user_message" && !name) {
            name = (payload.message || "").split("\n")[0]?.trim()?.slice(0, 80) || "";
          }
        }
        if (turnCount === 0 && meta) continue;
        sessions.push({
          id: meta?.id || path.basename(fp, ".jsonl"),
          name: name || meta?.id?.slice(0, 12) || "",
          filePath: fp,
          startedAt: meta?.timestamp || stat.birthtime.toISOString(),
          turnCount, totalTokens, toolCallCount,
          model: meta?.model_provider || "custom",
          cwd: meta?.cwd || "",
        });
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return sessions;
}

function computeStats(sessions) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let todayTokens = 0, todaySessions = 0, monthTokens = 0, monthSessions = 0;
  let totalTokens = 0, totalTurns = 0;
  for (const s of sessions) {
    totalTokens += s.totalTokens; totalTurns += s.turnCount;
    const ts = new Date(s.startedAt).getTime();
    if (ts >= todayStart) { todayTokens += s.totalTokens; todaySessions++; }
    if (ts >= monthStart) { monthTokens += s.totalTokens; monthSessions++; }
  }
  return {
    today: { tokens: todayTokens, sessions: todaySessions },
    month: { tokens: monthTokens, sessions: monthSessions },
    all: { tokens: totalTokens, turns: totalTurns, sessions: sessions.length },
    avgTokensPerTurn: totalTurns > 0 ? Math.round(totalTokens / totalTurns / 1000) : 0,
  };
}

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}

// ====== MCP Tools ======
const TOOLS = [
  {
    name: "mindrift_stats",
    description: "Get Mindrift dashboard statistics: today/month/all token consumption, session counts, and average efficiency.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "mindrift_sessions",
    description: "List recent Codex sessions with token usage, turn counts, and tool call stats.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of recent sessions (default: 10, max: 50)" },
        search: { type: "string", description: "Filter sessions by name keyword" },
      },
      required: [],
    },
  },
  {
    name: "mindrift_efficiency",
    description: "Analyze your AI usage efficiency: wasted tokens, tool success rate, and optimization suggestions.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

const RESOURCES = [
  { uri: "mindrift://stats", name: "Current Statistics", description: "Live Mindrift dashboard statistics", mimeType: "application/json" },
  { uri: "mindrift://sessions", name: "Recent Sessions", description: "List of recent Codex sessions", mimeType: "application/json" },
];

async function handleRequest(req) {
  const { method, params, id } = req;
  switch (method) {
    case "tools/list": return { tools: TOOLS };
    case "tools/call": {
      const { name, arguments: args } = params;
      const sessions = scanAllSessions();
      const stats = computeStats(sessions);
      switch (name) {
        case "mindrift_stats":
          return {
            content: [{ type: "text", text: [
              "Mindrift Stats",
              "",
              "Today: " + fmt(stats.today.tokens) + " tokens across " + stats.today.sessions + " sessions",
              "This Month: " + fmt(stats.month.tokens) + " tokens across " + stats.month.sessions + " sessions",
              "All Time: " + fmt(stats.all.tokens) + " tokens across " + stats.all.sessions + " sessions (" + stats.all.turns + " turns)",
              "Avg: " + stats.avgTokensPerTurn + "K tokens per turn",
            ].join("\n") }],
            data: { stats },
          };
        case "mindrift_sessions": {
          const limit = Math.min(args?.limit || 10, 50);
          let filtered = sessions;
          if (args?.search) {
            const q = args.search.toLowerCase();
            filtered = sessions.filter((s) => s.name?.toLowerCase().includes(q));
          }
          const recent = filtered.slice(0, limit);
          const lines = ["Recent Sessions (" + recent.length + " of " + sessions.length + ")", ""];
          for (const s of recent) {
            lines.push("- " + s.id.slice(0, 8) + " " + (s.name || "Untitled").slice(0, 60) + " | " + fmt(s.totalTokens) + " tokens, " + s.turnCount + " turns, " + s.toolCallCount + " tools [" + (s.model || "?") + "]");
          }
          return {
            content: [{ type: "text", text: lines.join("\n") }],
            data: { sessions: recent, total: sessions.length },
          };
        }
        case "mindrift_efficiency": {
          const totalTokens = stats.all.tokens;
          const totalTurns = stats.all.turns;
          const wastedTokens = sessions.reduce((s, x) => s + (x.anomalies?.length > 0 ? Math.round(x.totalTokens * 0.1) : 0), 0);
          const wastedPct = totalTokens > 0 ? Math.round((wastedTokens / totalTokens) * 100) : 0;
          const suggestions = [];
          if (stats.avgTokensPerTurn > 30) suggestions.push("High avg tokens/turn (" + stats.avgTokensPerTurn + "K). Consider breaking tasks into smaller chunks.");
          if (wastedPct > 10) suggestions.push(wastedPct + "% tokens in flagged sessions. Review aborted/compacted sessions.");
          if (sessions.filter((s) => s.toolCallCount > 50).length > 0) suggestions.push("Some sessions have 50+ tool calls. Check for redundant tool usage.");
          if (suggestions.length === 0) suggestions.push("Your AI usage looks efficient! No major issues detected.");
          return {
            content: [{ type: "text", text: [
              "Efficiency Analysis",
              "Avg tokens/turn: " + stats.avgTokensPerTurn + "K",
              "Est. wasted tokens: ~" + fmt(wastedTokens) + " (" + wastedPct + "%)",
              "Total sessions: " + stats.all.sessions,
              "",
              "Suggestions:",
              ...suggestions.map((s) => "- " + s),
            ].join("\n") }],
            data: { avgTokensPerTurn: stats.avgTokensPerTurn, wastedTokens, wastedPct, suggestions },
          };
        }
        default: return { content: [{ type: "text", text: "Unknown tool: " + name }], isError: true };
      }
    }
    case "resources/list": return { resources: RESOURCES };
    case "resources/read": {
      const uri = params?.uri;
      const sessions = scanAllSessions();
      const stats = computeStats(sessions);
      switch (uri) {
        case "mindrift://stats": return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(stats, null, 2) }] };
        case "mindrift://sessions": return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(sessions.slice(0, 20), null, 2) }] };
        default: return { contents: [], isError: true };
      }
    }
    case "initialize":
      return { protocolVersion: "2024-11-05", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "mindrift", version: "1.0.0" } };
    case "notifications/initialized": return {};
    default: return { error: { code: -32601, message: "Method not found: " + method } };
  }
}

// ====== Stdio Transport ======
let buffer = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const req = JSON.parse(trimmed);
      handleRequest(req).then((result) => {
        const response = { jsonrpc: "2.0", id: req.id, result };
        process.stdout.write(JSON.stringify(response) + "\n");
      }).catch((err) => {
        const response = { jsonrpc: "2.0", id: req.id, error: { code: -32603, message: err.message } };
        process.stdout.write(JSON.stringify(response) + "\n");
      });
    } catch { /* skip */ }
  }
});

process.stderr.write("Mindrift MCP Server started\n");
