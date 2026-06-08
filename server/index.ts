import type { SessionMeta, Turn, ToolCall, PlanStep, ParsedSession, SessionInfo, Stats } from "../shared/types";

const express = require("express");
const { createServer } = require("http");
const { WebSocketServer } = require("ws");
const chokidar = require("chokidar");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { scanClaudeSessions, parseClaudeSession } = require("./parsers/claude");
const { scanCursorSessions, parseCursorSession } = require("./parsers/cursor");

// Load config
const CONFIG_PATH = path.join(__dirname, "..", "mindrift.config.json");
let appConfig: any = { port: 3344, sources: [], theme: "dark", webhooks: [] };
try { if (fs.existsSync(CONFIG_PATH)) appConfig = { ...appConfig, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) }; } catch {}
const PORT = appConfig.port || 3344;
const CODEX_SESSIONS = path.join(os.homedir(), ".codex", "sessions");
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");

let sessionMeta: SessionMeta | null = null;
let turns: Turn[] = [];
let toolCalls: ToolCall[] = [];
let planSteps: PlanStep[] = [];
let tokenMetrics: any = {
  total: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 },
  contextWindow: 0,
  planProgress: { completed: 0, total: 0 },
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
  if (s.startsWith("# In app browser") || s.startsWith("- The user has the in-app browser") || s.startsWith("- Current URL:") || s.startsWith("The user has the in-app browser") || s.startsWith("# AGENTS.md") || s.startsWith("# RTK") || s.includes("RTK (Rust Token Killer)") || s.includes("Rust Token Killer")) return true;
  if (s.startsWith("<codex_internal_context") || s.startsWith("<turn_aborted>")) return true;
  if (s.startsWith("<INSTRUCTIONS>") || s.startsWith("<!-- headroom")) return true;
  if (s.startsWith("Continue working toward") || s.startsWith("The objective below") || s.startsWith("Continue working on")) return true;
  if (/^Continue working/i.test(s)) return true;
  if (s.includes("Token-Optimized Commands") || s.includes("--- project-doc ---")) return true;
  if (s.startsWith("## My request for Codex:")) return true;
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
    planProgress: { completed: 0, total: 0 },
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
      // Mark previous turn as finished
      const prev = R.turns[tn - 1];
      if (prev && !prev.finishedAt) {
        prev.finishedAt = timestamp;
        if (prev.startedAt) {
          prev.duration = Math.round((new Date(timestamp).getTime() - new Date(prev.startedAt).getTime()) / 1000);
        }
        // Revert in_progress plan steps from finished turn back to pending
        if (prev.planSteps && prev.planSteps.length > 0) {
          for (const ps of prev.planSteps) {
            if (ps.status === "in_progress") {
              const sp = R.planSteps.find((s: PlanStep) => s.step === ps.step);
              if (sp && sp.status === "in_progress") sp.status = "pending";
            }
          }
          R.planProgress = {
            completed: R.planSteps.filter((s: any) => s.status === "completed").length,
            total: R.planSteps.length
          };
        }
      }
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
        planSteps: [],
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
          if (payload.model_context_window) cur.ctxWindow = payload.model_context_window;
      } else if (pt === "task_completed") {
        cur.taskDone = true;
      } else if (pt === "turn_aborted") {
        cur.aborted = true;
        cur.abortReason = payload.reason || "interrupted";
        cur.finishedAt = timestamp;
      } else if (pt === "task_aborted") {
        cur.aborted = true;
        cur.abortReason = payload.reason || "interrupted";
        cur.finishedAt = timestamp;
      } else if (pt === "token_count") {
        // Accumulate last_token_usage (per-step delta) for per-turn tokens
        const lu = payload.info?.last_token_usage || payload.last_token_usage;
        if (lu) {
          cur.tokens.in += (lu.input_tokens || 0);
          cur.tokens.out += (lu.output_tokens || 0);
          cur.tokens.reason += (lu.reasoning_output_tokens || 0);
        }
        // Context window
        const cw = payload.info?.model_context_window || payload.model_context_window;
        if (cw) {
          cur.ctxWindow = cw;
          if (!R.ctxWindow) R.ctxWindow = cw;
        }
        // Session totals from cumulative (last event wins)
        const tu = payload.info?.total_token_usage || payload.total_token_usage;
        if (tu) {
          R.tokenTotal.input_tokens = tu.input_tokens || 0;
          R.tokenTotal.cached_input_tokens = tu.cached_input_tokens || 0;
          R.tokenTotal.output_tokens = tu.output_tokens || 0;
          R.tokenTotal.reasoning_output_tokens = tu.reasoning_output_tokens || 0;
          R.tokenTotal.total_tokens = tu.total_tokens || 0;
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
                // Per-turn: add to current turn's planSteps
                cur.planSteps = cur.planSteps || [];
                cur.planSteps.push({ step, status, createdTurnN: tn, lastTurnN: tn });
                // Session-wide: merge into current plan with history
                const existing = R.planSteps.findIndex((s: PlanStep) => s.step === step);
                if (existing >= 0) {
                  if (status) {
                    if (R.planSteps[existing].status === "completed" && status !== "completed") {
                      // Step was resurrected: count it again
                    }
                    R.planSteps[existing].status = status;
                    R.planSteps[existing].lastTurnN = tn;
                  }
                } else {
                  R.planSteps.push({ step, status, createdTurnN: tn, lastTurnN: tn });
                }
              }
              // Update progress
              const total = R.planSteps.length;
              const completed = R.planSteps.filter((s: any) => s.status === "completed").length;
              R.planProgress = { completed, total };
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
  // Calculate wasted tokens: aborted + compacted turns
  for (const t of R.turns) {
    if (t.aborted || t.compacted) {
      const tt = (t.tokens.in || 0) + (t.tokens.out || 0) + (t.tokens.reason || 0);
      t.wastedTokens = tt;
      if (t.aborted) t.wasteReasons.push("turn aborted");
      if (t.compacted) t.wasteReasons.push("context compacted (" + (t.compactRestarts || 1) + "x)");
    }
  }
  // Safety net: revert any in_progress steps from finished turns
  for (const t of R.turns) {
    if (t.finishedAt && t.planSteps && t.planSteps.length > 0) {
      for (const ps of t.planSteps) {
        if (ps.status === "in_progress") {
          const sp = R.planSteps.find((s: PlanStep) => s.step === ps.step);
          if (sp && sp.status === "in_progress") sp.status = "pending";
        }
      }
    }
  }
  R.planProgress = {
    completed: R.planSteps.filter((s: any) => s.status === "completed").length,
    total: R.planSteps.length
  };
  // Mark last turn finished and clean up plan steps
  const last = R.turns[tn - 1];
  if (last && !last.finishedAt && last.agentMessages.length > 0) {
    last.finishedAt = last.agentMessages[last.agentMessages.length - 1].ts;
    if (last.startedAt) {
      last.duration = Math.round((new Date(last.finishedAt).getTime() - new Date(last.startedAt).getTime()) / 1000);
    }
    // Revert in_progress plan steps from last turn
    if (last.planSteps && last.planSteps.length > 0) {
      for (const ps of last.planSteps) {
        if (ps.status === "in_progress") {
          const sp = R.planSteps.find((s: PlanStep) => s.step === ps.step);
          if (sp && sp.status === "in_progress") sp.status = "pending";
        }
      }
      R.planProgress = {
        completed: R.planSteps.filter((s: any) => s.status === "completed").length,
        total: R.planSteps.length
      };
    }
  }
  // Calculate per-turn efficiency scores
  for (const t of R.turns) {
    const total = (t.tokens.in || 0) + (t.tokens.out || 0) + (t.tokens.reason || 0);
    const ctxWindow = t.ctxWindow || R.ctxWindow || 128000;
    const doneTools = R.toolCalls.filter((tc: ToolCall) => tc.turnN === t.n && tc.done).length;
    const allTools = R.toolCalls.filter((tc: ToolCall) => tc.turnN === t.n).length;
    const toolSuccess = allTools > 0 ? Math.round((doneTools / allTools) * 100) : 100;
    const contextUtil = ctxWindow > 0 ? Math.min(100, Math.round((total / ctxWindow) * 100)) : 0;
    const wasteRatio = total > 0 ? Math.round(((t.wastedTokens || 0) / total) * 100) : 0;
    const tokenROI = total > 0 ? Math.min(100, Math.round((doneTools / Math.max(1, total / 1000)) * 50)) : 50;
    const overall = Math.round(toolSuccess * 0.4 + (100 - wasteRatio) * 0.3 + Math.min(100, contextUtil * 0.8) * 0.2 + tokenROI * 0.1);
    t.turnEfficiency = { tokenROI, toolSuccess, contextUtil, wasteRatio, overall };
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
          if (type === "response_item" && payload.type === "function_call_output" && !payload.error) { doneToolCount++; }
          if (type === "turn_aborted") { abortedTurnCount++; }
          if (type === "event_msg" && payload.type === "compacted_context") { compactedTurnCount++; }
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
          lastModified: stat.mtime.toISOString(),
          turnCount,
          totalTokens,
          toolCallCount,
          model: meta?.model_provider || "custom",
          cwd: meta?.cwd || "",
          anomalies,
          wastedTokens: 0,
          toolSuccessRate: toolCallCount > 0 ? Math.round((doneToolCount / toolCallCount) * 100) : 100,
          efficiencyScore: 50,
          category: "",
        });
      } catch { /* skip corrupt files */ }
    }
  } catch { /* skip */ }
  // Post-process: categorize each session
  for (const s of sessions) {
    const tpt = s.turnCount > 0 ? s.toolCallCount / s.turnCount : 0;
    if (s.turnCount <= 1 && s.totalTokens < 5000) s.category = "";
    else if (tpt < 2) s.category = "chat-heavy";
    else if (tpt > 8) s.category = "tool-heavy";
    else if (s.toolSuccessRate >= 90 && s.turnCount > 0 && s.totalTokens / s.turnCount < 20000) s.category = "efficient";
    else if (s.anomalies && s.anomalies.length > 0) s.category = "wasteful";
    else s.category = "balanced";
    // Efficiency score
    let eff = 50;
    if (s.turnCount > 0) {
      const tptN = s.toolCallCount / s.turnCount;
      const tptScore = Math.min(100, Math.max(0, 100 - Math.abs(tptN - 4) * 10));
      const successScore = s.toolSuccessRate || 100;
      eff = Math.round(tptScore * 0.2 + successScore * 0.3 + 50 * 0.3 + 50 * 0.2);
    }
    s.efficiencyScore = eff;
  }
  // Merge Claude Code sessions
  try {
    const claude = scanClaudeSessions();
    if (claude && claude.length > 0) {
      for (const cs of claude) {
        if (!sessions.some((s: SessionInfo) => s.id === cs.id)) {
          sessions.push(cs);
        }
      }
      sessions.sort((a: SessionInfo, b: SessionInfo) => 
        new Date(b.lastModified || b.startedAt).getTime() - new Date(a.lastModified || a.startedAt).getTime()
      );
    }
  } catch { /* Claude not available */ }
  // Merge Cursor sessions
  try {
    const cursor = scanCursorSessions();
    if (cursor && cursor.length > 0) {
      for (const cs of cursor) {
        if (!sessions.some((s: SessionInfo) => s.id === cs.id)) {
          sessions.push(cs);
        }
      }
      sessions.sort((a: SessionInfo, b: SessionInfo) => 
        new Date(b.lastModified || b.startedAt).getTime() - new Date(a.lastModified || a.startedAt).getTime()
      );
    }
  } catch { /* Cursor not available */ }
  return sessions;
}

// ====== Model Pricing (USD per 1M tokens, approximate 2026) ======
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.5": { input: 1.25, output: 10 },
  "gpt-5.4": { input: 1.25, output: 10 },
  "gpt-5.4-mini": { input: 0.15, output: 0.60 },
  "gpt-5.3-codex": { input: 0.50, output: 2.00 },
  "gpt-5.1": { input: 2.50, output: 10 },
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-4o": { input: 2.50, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-opus-4-20250514": { input: 15, output: 75 },
  "claude-3.5-sonnet": { input: 3, output: 15 },
  "claude-3.5-haiku": { input: 0.80, output: 4 },
  "claude": { input: 3, output: 15 },
  "custom": { input: 0.50, output: 2 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING["custom"];
  return (inputTokens / 1e6) * pricing.input + (outputTokens / 1e6) * pricing.output;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return "<$0.01";
  if (cost < 1) return "$" + cost.toFixed(2);
  if (cost < 10) return "$" + cost.toFixed(2);
  return "$" + Math.round(cost).toString();
}

function computeStats(sessions: SessionInfo[]): Stats {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let todayTokens = 0, todaySessions = 0, monthTokens = 0, monthSessions = 0;
  let totalAllTokens = 0, totalAllTurns = 0, totalAllTools = 0, totalWasted = 0;
  let totalDoneTools = 0;

  for (const s of sessions) {
    const ts = new Date(s.startedAt).getTime();
    const mod = s.lastModified ? new Date(s.lastModified).getTime() : ts;
    totalAllTokens += s.totalTokens;
    totalAllTurns += s.turnCount;
    totalAllTools += s.toolCallCount;
    totalWasted += s.wastedTokens || 0;
    totalDoneTools += Math.round((s.toolCallCount || 0) * (s.toolSuccessRate || 100) / 100);
    if (mod >= todayStart) { todayTokens += s.totalTokens; todaySessions++; }
    if (ts >= monthStart) { monthTokens += s.totalTokens; monthSessions++; }
  }

  const avgTpt = totalAllTurns > 0 ? Math.round(totalAllTokens / totalAllTurns / 1000) : 0;
  const toolSuccessRate = totalAllTools > 0 ? Math.round((totalDoneTools / totalAllTools) * 100) : 100;
  const wasteRatio = totalAllTokens > 0 ? Math.round((totalWasted / totalAllTokens) * 100) : 0;
  const contextUtil = totalAllTurns > 0 ? Math.min(100, Math.round((totalAllTools * 2000 / Math.max(1, totalAllTokens)) * 50 + 50)) : 50;
  const tokenROI = totalAllTokens > 0 ? Math.min(100, Math.round((totalAllTurns * 1000 / totalAllTokens) * 100)) : 50;
  const overall = Math.round(
    toolSuccessRate * 0.3 + (100 - Math.min(100, wasteRatio)) * 0.25 + contextUtil * 0.25 + Math.min(100, tokenROI) * 0.2
  );

  const catCounts: Record<string, number> = {};
  for (const s of sessions) {
    if (s.category) catCounts[s.category] = (catCounts[s.category] || 0) + 1;
  }

  return {
    today: { tokens: todayTokens, sessions: todaySessions },
    month: { tokens: monthTokens, sessions: monthSessions },
    all: { tokens: totalAllTokens, turns: totalAllTurns, sessions: sessions.length },
    anomalies: sessions.filter((s: SessionInfo) => s.anomalies && s.anomalies.length > 0).length,
    efficiency: avgTpt,
    efficiencyScores: { tokenROI, toolSuccess: toolSuccessRate, contextUtil, wasteRatio, overall },
    categoryCounts: catCounts,
    patternInsights: { totalWasted: totalWasted, avgToolSuccess: toolSuccessRate, topTool: "" },
    estimatedCost: estimateCost(
      sessions[0]?.model || "custom",
      totalAllTokens * 0.7,
      totalAllTokens * 0.3
    ),
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
      tokenMetrics = { total: p.tokenTotal, contextWindow: p.ctxWindow, planProgress: p.planProgress };
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
    planProgress: tokenMetrics.planProgress || { completed: 0, total: 0 },
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
app.get("/api/config", (_: any, r: any) => r.json(appConfig));
app.get("/api/status", (_: any, r: any) => r.json({
  ok: true,
  turns: turns.length,
  toolCalls: toolCalls.length,
  currentFile: currentSessionFile,
  uptime: Math.floor(process.uptime()),
}));

// ===== Export APIs =====
app.get("/api/export/json", (_: any, r: any) => {
  const sessions = scanAllSessions();
  r.setHeader("Content-Disposition", "attachment; filename=mindrift-sessions.json");
  r.json(sessions);
});

app.get("/api/export/csv", (_: any, r: any) => {
  const sessions = scanAllSessions();
  const header = "id,name,source,model,startedAt,turnCount,totalTokens,toolCallCount,category,efficiencyScore,toolSuccessRate";
  const rows = sessions.map((s: any) => [
    s.id, '"' + (s.name || "").replace(/"/g, '""') + '"', s.source || "codex", s.model || "",
    s.startedAt, s.turnCount, s.totalTokens, s.toolCallCount, s.category || "", s.efficiencyScore || 0, s.toolSuccessRate || 100
  ].join(","));
  r.setHeader("Content-Type", "text/csv");
  r.setHeader("Content-Disposition", "attachment; filename=mindrift-sessions.csv");
  r.send(header + "\n" + rows.join("\n"));
});

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
      liveSession: { meta: sessionMeta, turns: buildClientTurns(), planSteps, planProgress: tokenMetrics.planProgress || { completed: 0, total: 0 } },
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
          // Sync global state
          const d = loadSession(s.filePath);
          planSteps = d!.planSteps;
          tokenMetrics.planProgress = d!.planProgress || { completed: 0, total: 0 };
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
              planProgress: d!.planProgress || { completed: 0, total: 0 },
            },
          }));
        }
      }
    } catch {}
  });
});


// ===== Webhook Engine =====
function fireWebhooks(event: string, data: any) {
  if (!appConfig.webhooks || appConfig.webhooks.length === 0) return;
  for (const wh of appConfig.webhooks) {
    if (wh.event !== event) continue;
    try {
      let payload = wh.payload || data;
      // Template replacement
      if (typeof payload === "object") {
        payload = JSON.parse(JSON.stringify(payload).replace(/\{\{([^}]+)\}\}/g, (_: string, key: string) => {
          const keys = key.trim().split(".");
          let v = data;
          for (const k of keys) { v = v?.[k]; }
          return v ?? "";
        }));
      }
      const http = require("http");
      const https = require("https");
      const u = new URL(wh.url);
      const mod = u.protocol === "https:" ? https : http;
      const body = JSON.stringify(payload);
      const req = mod.request(u, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)) },
        timeout: 5000,
      }, (res: any) => {
        console.log("webhook", wh.url, "->", res.statusCode);
      });
      req.on("error", (e: any) => console.error("webhook error:", e.message));
      req.write(body);
      req.end();
    } catch (e: any) { console.error("webhook fail:", e.message); }
  }
}

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