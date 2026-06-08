import type { SessionMeta, Turn, ToolCall, PlanStep, ParsedSession, SessionInfo, Stats } from "../shared/types";

const express = require("express");
const { createServer } = require("http");
const { WebSocketServer } = require("ws");
const chokidar = require("chokidar");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = 3344;
const CODEX_SESSIONS = path.join(os.homedir(), ".codex", "sessions");
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");

let sessionMeta: SessionMeta | null = null;
let turns: Turn[] = [];
let toolCalls: ToolCall[] = [];
let planSteps: PlanStep[] = [];
let tokenMetrics = {
  total: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 },
  contextWindow: 0,
};
let currentSessionFile: string | null = null;
let currentWatcher: any = null;
let allSessionsCache: SessionInfo[] = [];

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

function isSystemMsg(t: string): boolean {
  if (!t || !t.trim()) return true;
  const s = t.trim();
  if (s.startsWith("# AGENTS.md") || s.startsWith("# RTK") || s.includes("RTK (Rust Token Killer)") || s.includes("Rust Token Killer")) return true;
  if (s.startsWith("<codex_internal_context") || s.startsWith("<turn_aborted>")) return true;
  if (s.startsWith("<INSTRUCTIONS>") || s.startsWith("<!-- headroom")) return true;
  if (s.startsWith("Continue working toward") || s.startsWith("The objective below") || s.startsWith("Continue working on")) return true;
  if (/^Continue working/i.test(s)) return true;
  if (s.includes("Token-Optimized Commands") || s.includes("--- project-doc ---")) return true;
  if (s.startsWith("When running shell") || s.startsWith("In command chains") || s.startsWith("For debugging")) return true;
  if (s.startsWith("<environment_context>") || s.startsWith("<filesystem>") || s.startsWith("<app-context>")) return true;
  if (s.startsWith("<collaboration_mode>") || s.startsWith("<permissions") || s.startsWith("<skills_instructions>")) return true;
  if (s.startsWith("<plugins_instructions>") || s.startsWith("Sandbox mode") || s.startsWith("Approval policy")) return true;
  if (s.startsWith("<current_date>") || s.startsWith("<timezone>")) return true;
  if (/^[A-Za-z]:\\/.test(s) && s.length < 60 && !s.includes(" ")) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
  if (s === "powershell" || s === "bash" || s === "cmd") return true;
  if (/^Asia\/\w+$/.test(s)) return true;
  if (s.includes("AGENTS.md instructions") || s.includes("prefixed with `rtk`")) return true;
  if (/^\*\*/.test(s) && (s.includes("savings") || s.includes("Token-Optimized"))) return true;
  return false;
}

function extractFirstLine(text: string): string {
  if (!text) return "";
  const lines = text.split(/\n/).map((l: string) => l.trim()).filter((l: string) => l && !isSystemMsg(l));
  return lines.length > 0 ? lines[0].slice(0, 80) : "";
}

function extractSessionName(turns: Turn[]): string {
  for (const t of turns) { if (t.userMsg && !t.userMsg.startsWith("[Goal]") && t.userMsg.length > 3) return t.userMsg.slice(0, 80); }
  for (const t of turns) { if (t.userMsg && t.userMsg.length > 3) return t.userMsg.slice(0, 80); }
  for (const t of turns) { if (t.agentSummary && t.agentSummary.length > 3) return t.agentSummary.slice(0, 80); }
  return "";
}

// ===== MAIN PARSER =====
function parseSession(raw: string): ParsedSession {
  const R: ParsedSession = {
    meta: null, turns: [], toolCalls: [], planSteps: [],
    tokenTotal: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 },
    ctxWindow: 0,
  };
  let tn = 0;
  const seenTurnIds = new Set<string>();
  let lastCompactedMsg: string | null = null;
  const lines = raw.split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;
    const evt = safeJson(line);
    if (!evt) continue;
    const { type, payload, timestamp } = evt;

    // session_meta
    if (type === "session_meta") {
      R.meta = { id: payload.id, cwd: payload.cwd, model: payload.model_provider || "custom", cliVersion: payload.cli_version, startedAt: payload.timestamp };
    }
    // compacted
    else if (type === "compacted") {
      lastCompactedMsg = (payload.message || "").slice(0, 500);
      if (R.turns[tn - 1]) { R.turns[tn - 1].compacted = true; R.turns[tn - 1].compactSummary = lastCompactedMsg; }
    }
    // turn_context
    else if (type === "turn_context") {
      const tid: string = payload.turn_id;
      if (seenTurnIds.has(tid)) {
        const ex = R.turns.find((t: Turn) => t.id === tid);
        if (ex) ex.compactRestarts = (ex.compactRestarts || 0) + 1;
        continue;
      }
      seenTurnIds.add(tid);
      tn++;
      R.turns.push({
        id: tid, n: tn, model: payload.model || R.meta?.model || "?",
        startedAt: timestamp, finishedAt: null, tc: 0,
        tokens: { in: 0, out: 0, reason: 0 },
        ctxWindow: 0, userMsg: "", agentMessages: [], agentSummary: "",
        reasoning: "", duration: null, compacted: false, compactRestarts: 0,
        compactSummary: lastCompactedMsg || "", goalObjective: "",
        aborted: false, abortReason: "", taskDone: false,
        wastedTokens: 0, wasteReasons: [],
      });
      lastCompactedMsg = null;
    }
    // event_msg
    else if (type === "event_msg") {
      const cur = R.turns[tn - 1];
      if (!cur) continue;
      const pt = payload.type;

      if (pt === "user_message") {
        const m = extractFirstLine(payload.message || "");
        if (m) cur.userMsg = m.slice(0, 200);
      } else if (pt === "agent_reasoning") {
        cur.reasoning = ((cur.reasoning || "") + (payload.text || "") + "\n").slice(0, 80000);
      } else if (pt === "agent_message") {
        if (payload.message) {
          const t = payload.message.trim();
          if (t) {
            cur.agentMessages.push({ ts: timestamp, text: t.slice(0, 500) });
            if (!cur.agentSummary) cur.agentSummary = t.slice(0, 200);
          }
        }
      } else if (pt === "task_started") {
        cur.goalObjective = payload.objective || "";
      } else if (pt === "task_completed") {
        cur.taskDone = true;
      } else if (pt === "task_aborted") {
        cur.aborted = true;
        cur.abortReason = payload.reason || "interrupted";
      } else if (pt === "token_count") {
        const tu = payload.info?.total_token_usage || payload.total_token_usage;
        if (tu) {
          cur.tokens = {
            in: (tu.input_tokens || 0) + (tu.cached_input_tokens || 0),
            out: tu.output_tokens || 0,
            reason: tu.reasoning_output_tokens || 0,
          };
          cur.ctxWindow = payload.model_context_window || 0;
          R.tokenTotal.input_tokens += tu.input_tokens || 0;
          R.tokenTotal.cached_input_tokens += tu.cached_input_tokens || 0;
          R.tokenTotal.output_tokens += tu.output_tokens || 0;
          R.tokenTotal.reasoning_output_tokens += tu.reasoning_output_tokens || 0;
          R.tokenTotal.total_tokens += tu.total_tokens || 0;
          if (payload.model_context_window) R.ctxWindow = payload.model_context_window;
        }
      } else if (pt === "wasted_tokens") {
        cur.wastedTokens += payload.amount || 0;
        if (payload.reason) cur.wasteReasons.push(payload.reason);
      }
    }
    // response_item
    else if (type === "response_item") {
      const cur = R.turns[tn - 1];
      if (!cur) continue;
      const rt = payload.type;
      if (rt === "function_call") {
        const name = payload.name || "unknown";
        if (name === "update_plan") {
          try {
            const args = typeof payload.arguments === "string" ? JSON.parse(payload.arguments) : payload.arguments;
            if (args && args.plan) {
              for (const ps of args.plan) {
                const step = ps.step || ps.name || ps.description || JSON.stringify(ps);
                const status = ps.status || "";
                const existing = R.planSteps.findIndex((s: PlanStep) => s.step === step);
                if (existing >= 0) {
                  if (status) R.planSteps[existing].status = status;
                } else {
                  R.planSteps.push({ step, status });
                }
              }
            }
          } catch { /* ignore parse errors */ }
        }
        cur.tc++;
        const tc: ToolCall = {
          id: payload.call_id || String(Date.now()),
          name,
          ts: timestamp,
          dur: null,
          done: false,
          args: (typeof payload.arguments === "string" ? payload.arguments : JSON.stringify(payload.arguments || {})).slice(0, 200),
          argsFull: typeof payload.arguments === "string" ? payload.arguments : JSON.stringify(payload.arguments || {}),
          output: "",
          outputFull: "",
          turnN: cur.n,
        };
        R.toolCalls.push(tc);
      } else if (rt === "function_call_output") {
        const callId = payload.call_id;
        const existing = [...R.toolCalls].reverse().find((c: ToolCall) => c.id === callId);
        if (existing) {
          existing.done = true;
          existing.output = (payload.output || "").slice(0, 500);
          existing.outputFull = payload.output || "";
          existing.outputSize = (payload.output || "").length;
          existing.dur = timestamp ? Date.now() - new Date(existing.ts).getTime() : null;
          if (payload.error) existing.error = payload.error;
          if (payload.read_files) existing.readFiles = payload.read_files;
        }
      }
    }
    // turn_finished
    else if (type === "turn_finished") {
      const cur = R.turns[tn - 1];
      if (cur) {
        cur.finishedAt = timestamp;
        if (cur.startedAt) {
          cur.duration = Math.round((new Date(timestamp).getTime() - new Date(cur.startedAt).getTime()) / 1000);
        }
      }
    }
    // turn_aborted
    else if (type === "turn_aborted") {
      const cur = R.turns[tn - 1];
      if (cur) {
        cur.aborted = true;
        cur.abortReason = payload.reason || "aborted";
        cur.finishedAt = timestamp;
      }
    }
  }
  return R;
}

function scanAllSessions(): SessionInfo[] {
  const sessions: SessionInfo[] = [];
  if (!fs.existsSync(CODEX_SESSIONS)) return sessions;
  try {
    const files: string[] = [];
    function walk(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const fp = path.join(dir, e.name);
        if (e.isDirectory()) { walk(fp); }
        else if (e.name.endsWith(".jsonl")) { files.push(fp); }
      }
    }
    walk(CODEX_SESSIONS);
    files.sort((a: string, b: string) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

    for (const fp of files.slice(0, 100)) {
      try {
        const stat = fs.statSync(fp);
        const raw = fs.readFileSync(fp, "utf-8");
        const lines = raw.split("\n").filter((l: string) => l.trim());
        let meta: any = null;
        let name = "";
        let turnCount = 0;
        let toolCallCount = 0;
        let totalTokens = 0;
        const seenTurns = new Set<string>();

        for (const line of lines) {
          const evt = safeJson(line);
          if (!evt) continue;
          const { type, payload } = evt;

          if (type === "session_meta") { meta = payload; }
          if (type === "turn_context" && payload.turn_id) {
            if (!seenTurns.has(payload.turn_id)) { seenTurns.add(payload.turn_id); turnCount++; }
          }
          if (type === "event_msg" && payload.type === "token_count" && (payload.info?.total_token_usage || payload.total_token_usage)) {
            const t = (payload.info?.total_token_usage || payload.total_token_usage).total_tokens || 0; if (t > totalTokens) totalTokens = t;
          }
          if (type === "response_item" && payload.type === "function_call") { toolCallCount++; }
          if (type === "event_msg" && payload.type === "user_message" && !name) {
            name = extractFirstLine(payload.message || "");
          }
        }
        if (turnCount === 0 && meta) continue;

        const anomalies: string[] = [];
        if (turnCount > 0 && totalTokens / turnCount > 50000) anomalies.push("high-tokens");
        if (toolCallCount > 50) anomalies.push("many-tools");
        if (turnCount > 30) anomalies.push("long-session");
        if (totalTokens > 200000) anomalies.push("context-pressure");

        sessions.push({
          id: meta?.id || path.basename(fp, ".jsonl"),
          name: name || meta?.id?.slice(0, 12) || path.basename(fp, ".jsonl").slice(0, 30),
          filePath: fp,
          startedAt: meta?.timestamp || stat.birthtime.toISOString(),
          turnCount,
          totalTokens,
          toolCallCount,
          model: meta?.model_provider || "custom",
          cwd: meta?.cwd || "",
          anomalies,
        });
      } catch { /* skip corrupt files */ }
    }
  } catch { /* skip */ }
  return sessions;
}

function computeStats(sessions: SessionInfo[]): Stats {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let todayTokens = 0, todaySessions = 0, monthTokens = 0, monthSessions = 0;
  let totalAllTokens = 0, totalAllTurns = 0;

  for (const s of sessions) {
    const ts = new Date(s.startedAt).getTime();
    totalAllTokens += s.totalTokens;
    totalAllTurns += s.turnCount;
    if (ts >= todayStart) { todayTokens += s.totalTokens; todaySessions++; }
    if (ts >= monthStart) { monthTokens += s.totalTokens; monthSessions++; }
  }

  return {
    today: { tokens: todayTokens, sessions: todaySessions },
    month: { tokens: monthTokens, sessions: monthSessions },
    all: { tokens: totalAllTokens, turns: totalAllTurns, sessions: sessions.length },
    anomalies: sessions.filter((s: SessionInfo) => s.anomalies && s.anomalies.length > 0).length,
  };
}

function loadSession(p: string): ParsedSession | null {
  try { return parseSession(fs.readFileSync(p, "utf-8")); } catch { return null; }
}

function switchToSession(fp: string) {
  if (currentWatcher) { try { currentWatcher.close(); } catch {} }
  currentWatcher = null;
  currentSessionFile = fp;
  const p = loadSession(fp);
  if (!p) return;
  sessionMeta = p.meta;
  turns = p.turns;
  toolCalls = p.toolCalls;
  planSteps = p.planSteps;
  tokenMetrics = { total: p.tokenTotal, contextWindow: p.ctxWindow };
  broadcastFullState();

  let ls = fs.statSync(fp).size;
  const w = chokidar.watch(fp, { persistent: true, usePolling: true, interval: 300 });
  w.on("change", () => {
    try {
      const cur = fs.statSync(fp).size;
      if (cur <= ls) { ls = cur; return; }
      const raw = fs.readFileSync(fp, "utf-8");
      ls = cur;
      const p = parseSession(raw);
      if (!p || !p.turns) return;
      if (p.meta) sessionMeta = p.meta;
      turns = p.turns;
      toolCalls = p.toolCalls;
      planSteps = p.planSteps;
      tokenMetrics = { total: p.tokenTotal, contextWindow: p.ctxWindow };
      broadcastFullState();
    } catch (e: any) { console.error("watch error:", e.message); }
  });
  currentWatcher = w;
  console.log("watching:", fp.split("\\").pop(), turns.length, "turns");
}

function buildClientTurns(): Turn[] {
  return turns.map((t: Turn) => ({
    ...t,
    tTools: toolCalls.filter((tc: ToolCall) => tc.turnN === t.n).map((c: ToolCall) => ({
      id: c.id, name: c.name, ts: c.ts, dur: c.dur, done: c.done,
      args: c.args, argsFull: c.argsFull, output: c.output, outputFull: c.outputFull,
      error: c.error, outputSize: c.outputSize, readFiles: c.readFiles,
    })),
  })) as Turn[];
}

function buildClientTools(): ToolCall[] {
  return toolCalls.map((c: ToolCall) => ({
    id: c.id, name: c.name, ts: c.ts, dur: c.dur, done: c.done,
    args: c.args, argsFull: c.argsFull, output: c.output, outputFull: c.outputFull,
    turnN: c.turnN, error: c.error,
  }));
}

function broadcastFullState() {
  broadcast("full_state", {
    meta: sessionMeta,
    turns: buildClientTurns(),
    planSteps,
    toolCalls: buildClientTools(),
    stats: computeStats(scanAllSessions()),
  });
}

// ===== Express + WS =====
const app = express();
app.use(cors());

app.get("/api/sessions", (_: any, r: any) => {
  const s = scanAllSessions();
  r.json({ sessions: s, stats: computeStats(s) });
});

app.get("/api/sessions/:id", (req: any, res: any) => {
  const ss = scanAllSessions();
  const s = ss.find((x: SessionInfo) => x.id === req.params.id || x.id.startsWith(req.params.id));
  if (!s) return res.status(404).json({ error: "not found" });
  res.json({ session: s, ...loadSession(s.filePath) });
});

app.get("/api/sessions/:id/raw", (req: any, res: any) => {
  const ss = scanAllSessions();
  const s = ss.find((x: SessionInfo) => x.id === req.params.id || x.id.startsWith(req.params.id));
  if (!s) return res.status(404).json({ error: "not found" });
  try { res.type("text/plain").send(fs.readFileSync(s.filePath, "utf-8")); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get("/api/stats", (_: any, r: any) => { r.json(computeStats(scanAllSessions())); });
app.get("/api/status", (_: any, r: any) => r.json({
  ok: true,
  turns: turns.length,
  toolCalls: toolCalls.length,
  currentFile: currentSessionFile,
  uptime: Math.floor(process.uptime()),
}));

app.use(express.static(CLIENT_DIST));
app.get("*", (_req: any, res: any) => {
  const fp = path.join(CLIENT_DIST, "index.html");
  if (fs.existsSync(fp)) res.sendFile(fp);
  else res.json({ ok: true });
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (ws: any) => {
  const all = scanAllSessions();
  ws.send(JSON.stringify({
    type: "init",
    payload: {
      sessions: all,
      currentSessionId: sessionMeta?.id || all[0]?.id,
      stats: computeStats(all),
      liveSession: { meta: sessionMeta, turns: buildClientTurns(), planSteps },
      liveMetrics: {
        tokens: tokenMetrics,
        toolCalls: toolCalls.length,
        turns: turns.map((t: Turn) => ({ n: t.n, tc: t.tc, tokens: t.tokens, done: !!t.finishedAt, aborted: !!t.aborted, compacted: !!t.compacted })),
      },
    },
  }));

  ws.on("message", (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "load_session") {
        const all = scanAllSessions();
        const s = all.find((x: SessionInfo) => x.id === msg.sessionId || x.id.startsWith(msg.sessionId));
        if (s) {
          const d = loadSession(s.filePath);
          ws.send(JSON.stringify({
            type: "session_loaded",
            payload: {
              session: s,
              meta: d!.meta,
              turns: d!.turns.map((t: Turn) => ({
                ...t,
                tTools: d!.toolCalls.filter((tc: ToolCall) => tc.turnN === t.n).map((c: ToolCall) => ({
                  id: c.id, name: c.name, ts: c.ts, dur: c.dur, done: c.done,
                  args: c.args, argsFull: c.argsFull, output: c.output, outputFull: c.outputFull,
                  error: c.error, outputSize: c.outputSize, readFiles: c.readFiles,
                })),
              })),
              planSteps: d!.planSteps,
            },
          }));
        }
      }
    } catch {}
  });
});

function broadcast(t: string, p: any) {
  const m = JSON.stringify({ type: t, payload: p });
  wss.clients.forEach((c: any) => { if (c.readyState === 1) c.send(m); });
}

setInterval(() => {
  const s = scanAllSessions();
  if (s.length > 0 && s[0].filePath !== currentSessionFile) {
    console.log("switch:", s[0].filePath.split("\\").pop());
    switchToSession(s[0].filePath);
    broadcast("new_session", {});
  }
  broadcast("stats_update", computeStats(s));
}, 5000);

const ses = scanAllSessions();
const sts = computeStats(ses);
console.log(ses.length, "sessions | Today:", (sts.today.tokens / 1000).toFixed(1) + "K", "| Month:", (sts.month.tokens / 1e6).toFixed(1) + "M");
if (ses.length > 0) switchToSession(ses[0].filePath);
httpServer.listen(PORT, () => console.log("Mindrift http://localhost:" + PORT));