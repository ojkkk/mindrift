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
  let lastCumulativeInput = 0;
  const seenTurnIds = new Set<string>();
  let lastCompactedMsg: string | null = null;
  // Cumulative token snapshots at each turn boundary (for per-turn delta)
  const turnSnapshots: { in: number; cache: number; out: number; reason: number }[] = [{ in: 0, cache: 0, out: 0, reason: 0 }];
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
        tokens: { in: 0, cache: 0, out: 0, reason: 0 },
        ctxWindow: 0, userMsg: "", agentMessages: [], agentSummary: "",
        reasoning: "", duration: null, compacted: false, compactRestarts: 0, model: payload.model || "",
        compactSummary: lastCompactedMsg || "", goalObjective: "",
        aborted: false, abortReason: "", taskDone: false,
        planSteps: [],
        wastedTokens: 0, wasteReasons: [],
        peakTokens: 0,
      });
      lastCompactedMsg = null;
      // Snapshot cumulative tokens at this turn boundary
      turnSnapshots.push({
        in: R.tokenTotal.input_tokens || 0,
        cache: R.tokenTotal.cached_input_tokens || 0,
        out: R.tokenTotal.output_tokens || 0,
        reason: R.tokenTotal.reasoning_output_tokens || 0
      });
      // Reset per-call peak baseline at start of new turn
      lastCumulativeInput = (R.tokenTotal.input_tokens || 0) + (R.tokenTotal.cached_input_tokens || 0);
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
          // Track per-call peak: max single-call context usage within this turn
          
const currentInput = (tu.input_tokens || 0) + (tu.cached_input_tokens || 0);
          
const delta = currentInput - lastCumulativeInput;
          
if (delta > 0 && delta > (cur.peakTokens || 0)) {
          
  cur.peakTokens = delta;
          
}
          
lastCumulativeInput = currentInput;
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
          existing.dur = new Date(timestamp).getTime() - new Date(existing.ts).getTime();
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
      const tt = (t.tokens.in || 0) + (t.tokens.cache || 0) + (t.tokens.out || 0) + (t.tokens.reason || 0);
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
  // Add final snapshot (captures cumulative tokens after all turns)
  turnSnapshots.push({
    in: R.tokenTotal.input_tokens || 0,
    cache: R.tokenTotal.cached_input_tokens || 0,
    out: R.tokenTotal.output_tokens || 0,
    reason: R.tokenTotal.reasoning_output_tokens || 0
  });
  // Compute per-turn tokens from cumulative snapshots (exact match with session total)
  // snapshots[0]=initial, snapshots[1]=turn1 start, snapshots[2]=turn2 start, ..., snapshots[N+1]=final
  // turn i tokens = snapshots[i+2] - snapshots[i+1]
  for (let i = 0; i < R.turns.length; i++) {
    const snap = turnSnapshots[i + 2];
    if (snap) {
      const prev = turnSnapshots[i + 1];
      R.turns[i].tokens.in = snap.in - prev.in;
      R.turns[i].tokens.cache = snap.cache - prev.cache;
      R.turns[i].tokens.out = snap.out - prev.out;
      R.turns[i].tokens.reason = snap.reason - prev.reason;
    }
  }

    // Mark last turn finished ONLY for stale/inactive sessions (file not modified in 60s)
  // Mark last turn as done if AI has finished responding
  const last = R.turns[tn - 1];
  if (last && !last.finishedAt && last.agentMessages.length > 0) {
    // Check if file has stopped being modified (AI is done writing)
    const isStale = currentSessionFile
      ? (Date.now() - fs.statSync(currentSessionFile).mtimeMs > 5000)
      : true;
    // Check if all tool calls for this turn are complete
    const turnTools = R.toolCalls.filter((tc: ToolCall) => tc.turnN === last.n);
    const pendingTools = turnTools.filter((tc: ToolCall) => !tc.done);
    const allToolsDone = turnTools.length === 0 || pendingTools.length === 0;
    // Also check: if last turn has turn_context after it (new turn started), it's done
    const hasNextTurn = R.turns.some((t: Turn) => t.n > last.n);
    if ((isStale && allToolsDone) || hasNextTurn) {
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
    } // closes isStale || hasNextTurn
  }
  // Calculate per-turn efficiency scores
  for (const t of R.turns) {
    const total = (t.tokens.in || 0) + (t.tokens.cache || 0) + (t.tokens.out || 0) + (t.tokens.reason || 0);
    const ctxWindow = t.ctxWindow || R.ctxWindow || 128000;
    const doneTools = R.toolCalls.filter((tc: ToolCall) => tc.turnN === t.n && tc.done).length;
    const allTools = R.toolCalls.filter((tc: ToolCall) => tc.turnN === t.n).length;
    const toolSuccess = allTools > 0 ? Math.round((doneTools / allTools) * 100) : 100;
    const peakCtx = t.peakTokens || ((t.tokens.in || 0) + (t.tokens.cache || 0));
    const contextUtil = ctxWindow > 0 ? Math.min(100, Math.round((peakCtx / ctxWindow) * 100)) : 0;
    const wasteRatio = total > 0 ? Math.round(((t.wastedTokens || 0) / total) * 100) : 0;
    const tokenROI = total > 0 ? Math.min(100, Math.round((doneTools / Math.max(1, total / 1000)) * 50)) : 50;
    const overall = Math.round(toolSuccess * 0.4 + (100 - wasteRatio) * 0.3 + Math.min(100, contextUtil * 0.8) * 0.2 + tokenROI * 0.1);
    t.turnEfficiency = { tokenROI, toolSuccess, contextUtil, wasteRatio, overall };
  }
  return R;
}

function detectProvider(model: string): string {
  if (!model) return "custom";
  const m = model.toLowerCase();
  if (m.includes("gpt-") || m.includes("o1") || m.includes("o3") || m.includes("o4")) return "openai";
  if (m.includes("claude")) return "anthropic";
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("minimax") || m.includes("mimo")) return "minimax";
  if (m.includes("kimi")) return "moonshot";
  if (m.includes("glm")) return "zhipu";
  if (m.includes("qwen")) return "alibaba";
  if (m.includes("hy3") || m.includes("hunyuan")) return "tencent";
  return "custom";
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
        let inputTokens = 0;
        let outputTokens = 0;
        let cacheTokens = 0;
        let doneToolCount = 0;
        let abortedTurnCount = 0;
        let compactedTurnCount = 0;
        let modelDetected = "";
        const seenTurns = new Set<string>();

        for (const line of lines) {
          const evt = safeJson(line);
          if (!evt) continue;
          const { type, payload } = evt;

          if (type === "session_meta") { meta = payload; }
          if (type === "turn_context" && payload.turn_id) {
            if (payload.model && !modelDetected) modelDetected = payload.model;
            if (!seenTurns.has(payload.turn_id)) { seenTurns.add(payload.turn_id); turnCount++; }
          }
          if (type === "event_msg" && payload.type === "token_count" && (payload.info?.total_token_usage || payload.total_token_usage)) {
            const tu = payload.info?.total_token_usage || payload.total_token_usage;
            const t = tu.total_tokens || 0; if (t > totalTokens) totalTokens = t;
            const inp = tu.input_tokens || 0; if (inp > inputTokens) inputTokens = inp;
            const out = tu.output_tokens || 0; if (out > outputTokens) outputTokens = out;
            const cache = tu.cached_input_tokens || 0; if (cache > cacheTokens) cacheTokens = cache;
          }
          if (type === "response_item" && payload.type === "function_call") { toolCallCount++; }
          if (type === "response_item" && payload.type === "function_call_output" && !payload.error) { doneToolCount++; }
          if (type === "event_msg" && payload.type === "turn_aborted") { abortedTurnCount++; }
          if (type === "event_msg" && payload.type === "compacted_context") { compactedTurnCount++; }
          if (type === "event_msg" && payload.type === "user_message" && !name) {
            name = extractFirstLine(payload.message || "");
          }
        }
        if (turnCount === 0 && meta) continue;

        // Precise wasted tokens: for sessions with aborted/compacted turns, do a full parse
        let wastedTokens = 0;
        if (abortedTurnCount > 0 || compactedTurnCount > 0) {
          try {
            const full = parseSession(raw);
            wastedTokens = full.turns.reduce((sum: number, t: Turn) => sum + (t.wastedTokens || 0), 0);
          } catch { /* fallback: wastedTokens stays 0 */ }
        }

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
          inputTokens,
          outputTokens,
          cacheTokens,
          toolCallCount,
          model: modelDetected || meta?.model_provider || "custom",
          cwd: meta?.cwd || "",
          anomalies,
          source: "codex", provider: detectProvider(modelDetected || meta?.model_provider || ""),
          wastedTokens,
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
// ====== Model Pricing (USD per 1M tokens) ======
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  // Chinese models
  "glm-5.1":      { input: 1.40, output: 4.40, cacheRead: 0.26 },
  "glm-5":        { input: 1.00, output: 3.20, cacheRead: 0.20 },
  "glm":          { input: 1.00, output: 3.20, cacheRead: 0.20 },
  "kimi-k2.6":    { input: 0.95, output: 4.00, cacheRead: 0.16 },
  "kimi-k2.5":    { input: 0.60, output: 3.00, cacheRead: 0.10 },
  "kimi":         { input: 0.95, output: 4.00, cacheRead: 0.16 },
  "mimo-v2.5":    { input: 0.14, output: 0.28, cacheRead: 0.0028 },
  "mimo-v2.5-pro":{ input: 1.74, output: 3.48, cacheRead: 0.0145 },
  "mimo":         { input: 1.74, output: 3.48, cacheRead: 0.0145 },
  "minimax-m3":   { input: 0.30, output: 1.20, cacheRead: 0.06 },
  "minimax-m2.7": { input: 0.30, output: 1.20, cacheRead: 0.06 },
  "minimax-m2.5": { input: 0.30, output: 1.20, cacheRead: 0.06 },
  "minimax":      { input: 0.30, output: 1.20, cacheRead: 0.06 },
  "qwen3.7-max":  { input: 2.50, output: 7.50, cacheRead: 0.50 },
  "qwen3.7-plus": { input: 0.40, output: 1.60, cacheRead: 0.04 },
  "qwen3.6-plus": { input: 0.50, output: 3.00, cacheRead: 0.05 },
  "qwen":         { input: 0.40, output: 1.60, cacheRead: 0.04 },
  "deepseek-v4-pro":  { input: 1.74, output: 3.48, cacheRead: 0.0145 },
  "deepseek-v4-flash":{ input: 0.14, output: 0.28, cacheRead: 0.0028 },
  "deepseek":     { input: 1.74, output: 3.48, cacheRead: 0.0145 },
  // OpenAI models
  "gpt-5.5":      { input: 1.25, output: 10.00, cacheRead: 0.625 },
  "gpt-5.4":      { input: 1.25, output: 10.00, cacheRead: 0.625 },
  "gpt-5.4-mini": { input: 0.15, output: 0.60, cacheRead: 0.075 },
  "gpt-5.3-codex":{ input: 0.50, output: 2.00, cacheRead: 0.25 },
  "gpt-5.1":      { input: 2.50, output: 10.00, cacheRead: 1.25 },
  "gpt-5":        { input: 1.25, output: 10.00, cacheRead: 0.625 },
  "gpt-4o":       { input: 2.50, output: 10.00, cacheRead: 1.25 },
  "gpt-4o-mini":  { input: 0.15, output: 0.60, cacheRead: 0.075 },
  // Anthropic models
  "claude-sonnet-4-20250514": { input: 3.00, output: 15.00, cacheRead: 0.30 },
  "claude-opus-4-20250514":  { input: 15.00, output: 75.00, cacheRead: 1.50 },
  "claude-3.5-sonnet":       { input: 3.00, output: 15.00, cacheRead: 0.30 },
  "claude-3.5-haiku":        { input: 0.80, output: 4.00, cacheRead: 0.08 },
  "claude":       { input: 3.00, output: 15.00, cacheRead: 0.30 },
  // Default
  "custom":       { input: 0.50, output: 2.00, cacheRead: 0.05 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number, cacheTokens: number = 0): number {
  const cfgModel = appConfig.costModel || "custom";
  const lookupModel = cfgModel !== "custom" ? cfgModel : model;
  const pricing = MODEL_PRICING[lookupModel] || MODEL_PRICING[model] || MODEL_PRICING["custom"];
  return (inputTokens / 1e6) * pricing.input + (outputTokens / 1e6) * pricing.output + (cacheTokens / 1e6) * pricing.cacheRead;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return "<$0.01";
  return "$" + cost.toFixed(2);
}

function computeStats(sessions: SessionInfo[]): Stats {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let todayTokens = 0, todaySessions = 0, monthTokens = 0, monthSessions = 0;
  let todayCost = 0, monthCost = 0;
  let todayIn = 0, todayOut = 0, todayCache = 0;
  let monthIn = 0, monthOut = 0, monthCache = 0;
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

    // Per-turn cost: parse session, only count turns from today/month
    if (mod >= todayStart || ts >= monthStart) {
      try {
        const raw = fs.readFileSync(s.filePath, "utf-8");
        const parsed = parseSession(raw);
        for (const t of parsed.turns) {
          const tDate = new Date(t.startedAt).getTime();
          const tIn = t.tokens.in || 0;
          const tOut = t.tokens.out || 0;
          const tCache = t.tokens.cache || 0;
          if (tDate >= todayStart) {
            todayCost += estimateCost(s.model, tIn, tOut, tCache);
            todayIn += tIn; todayOut += tOut; todayCache += tCache;
          }
          if (tDate >= monthStart) {
            monthCost += estimateCost(s.model, tIn, tOut, tCache);
            monthIn += tIn; monthOut += tOut; monthCache += tCache;
          }
        }
      } catch { /* skip parse errors */ }
    }
  }

  const avgTpt = totalAllTurns > 0 ? Math.round(totalAllTokens / totalAllTurns / 1000) : 0;
  const toolSuccessRate = totalAllTools > 0 ? Math.round((totalDoneTools / totalAllTools) * 100) : 100;
  const wasteRatio = totalAllTokens > 0 ? Math.round((totalWasted / totalAllTokens) * 100) : 0;
  // Context headroom: % of sessions where avg tokens/turn is under 150K (fits in context window)
  let sessionsWithHeadroom = 0;
  let sessionsWithTurns2 = 0;
  for (const s of sessions) {
    if (s.turnCount > 0 && s.totalTokens > 0) {
      sessionsWithTurns2++;
      if (s.totalTokens / s.turnCount < 150000) sessionsWithHeadroom++;
    }
  }
  const contextUtil = sessionsWithTurns2 > 0 ? Math.round((sessionsWithHeadroom / sessionsWithTurns2) * 100) : 100;
  // Token ROI: successful tool calls per 100K tokens (higher = more productive per token)
  const tokenROI = totalAllTokens > 0
    ? Math.min(100, Math.round((totalDoneTools / Math.max(1, totalAllTokens / 100000)) * 100))
    : 50;
  const overall = Math.round(
    toolSuccessRate * 0.20 + (100 - Math.min(100, wasteRatio)) * 0.20 + contextUtil * 0.30 + Math.min(100, tokenROI) * 0.30
  );

  const catCounts: Record<string, number> = {};
  for (const s of sessions) {
    if (s.category) catCounts[s.category] = (catCounts[s.category] || 0) + 1;
  }

  return {
    today: { tokens: todayTokens, sessions: todaySessions, cost: todayCost, inputTokens: todayIn, outputTokens: todayOut, cacheTokens: todayCache },
    month: { tokens: monthTokens, sessions: monthSessions, cost: monthCost, inputTokens: monthIn, outputTokens: monthOut, cacheTokens: monthCache },
    all: { tokens: totalAllTokens, turns: totalAllTurns, sessions: sessions.length },
    anomalies: sessions.filter((s: SessionInfo) => s.anomalies && s.anomalies.length > 0).length,
    efficiency: avgTpt,
    efficiencyScores: { tokenROI, toolSuccess: toolSuccessRate, contextUtil, wasteRatio, overall },
    categoryCounts: catCounts,
    patternInsights: { totalWasted: totalWasted, avgToolSuccess: toolSuccessRate, topTool: "" },
    estimatedCost: estimateCost(
      sessions[0]?.model || "custom",
      sessions.reduce((a: number, s: SessionInfo) => a + (s.inputTokens || 0), 0),
      sessions.reduce((a: number, s: SessionInfo) => a + (s.outputTokens || 0), 0),
      sessions.reduce((a: number, s: SessionInfo) => a + (s.cacheTokens || 0), 0)
    ),
  };
}

function checkAlerts(sessions: SessionInfo[]): string[] {
  const alerts: string[] = [];
  const ac = appConfig.alerts;
  if (!ac || !ac.enabled) return alerts;
  
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  
  // Check daily token limit
  let todayTokens = 0;
  for (const s of sessions) {
    const ts = new Date(s.startedAt).getTime();
    const mod = s.lastModified ? new Date(s.lastModified).getTime() : ts;
    if (mod >= todayStart) todayTokens += s.totalTokens;
  }
  if (ac.dailyTokenLimit && todayTokens > ac.dailyTokenLimit) {
    alerts.push("Daily token limit exceeded: " + Math.round(todayTokens / 1000) + "K / " + Math.round(ac.dailyTokenLimit / 1000) + "K");
  }
  
  // Check active turn token limit
  const lastTurn = turns[turns.length - 1];
  if (lastTurn && ac.singleTurnTokenLimit) {
    const tt = (lastTurn.tokens.in || 0) + (lastTurn.tokens.cache || 0) + (lastTurn.tokens.out || 0) + (lastTurn.tokens.reason || 0);
    if (tt > ac.singleTurnTokenLimit) {
      alerts.push("Turn #" + lastTurn.n + " tokens: " + Math.round(tt / 1000) + "K (limit: " + Math.round(ac.singleTurnTokenLimit / 1000) + "K)");
    }
  }
  
  // Check tool calls in active turn
  if (lastTurn && ac.toolCallLimitPerTurn && lastTurn.tc > ac.toolCallLimitPerTurn) {
    alerts.push("Turn #" + lastTurn.n + " tool calls: " + lastTurn.tc + " (limit: " + ac.toolCallLimitPerTurn + ")");
  }
  
  return alerts;
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
  const sessions = scanAllSessions();
  broadcast("full_state", {
    meta: sessionMeta,
    turns: buildClientTurns(),
    planSteps,
    planProgress: tokenMetrics.planProgress || { completed: 0, total: 0 },
    toolCalls: buildClientTools(),
    stats: computeStats(sessions),
    alerts: checkAlerts(sessions),
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
app.get("/api/config", (_: any, r: any) => r.json({ ...appConfig, costModel: appConfig.costModel || "custom" }));

app.post("/api/config", express.json(), (req: any, res: any) => {
  try {
    if (req.body.costModel) appConfig.costModel = req.body.costModel;
    if (req.body.platforms) {
      appConfig.sources = req.body.platforms.map((p: string) => ({ type: p, path: "" }));
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2), "utf-8");
    res.json({ ok: true, config: appConfig });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
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
  // Periodic turn-completion check for active session
  if (currentSessionFile && turns.length > 0) {
    const last = turns[turns.length - 1];
    if (last && !last.finishedAt && last.agentMessages.length > 0) {
      try {
        const raw = fs.readFileSync(currentSessionFile, "utf-8");
        const p = parseSession(raw);
        if (p && p.turns && p.turns.length > 0) {
          const newLast = p.turns[p.turns.length - 1];
          if (newLast && newLast.finishedAt) {
            turns = p.turns;
            toolCalls = p.toolCalls;
            planSteps = p.planSteps;
            tokenMetrics = { total: p.tokenTotal, contextWindow: p.ctxWindow, planProgress: p.planProgress };
            broadcastFullState();
          }
        }
      } catch { /* skip */ }
    }
  }
  broadcast("stats_update", computeStats(s));
}, 3000);

const ses = scanAllSessions();
const sts = computeStats(ses);
console.log(ses.length, "sessions | Today:", (sts.today.tokens / 1000).toFixed(1) + "K", "| Month:", (sts.month.tokens / 1e6).toFixed(1) + "M");
if (ses.length > 0) switchToSession(ses[0].filePath);
httpServer.listen(PORT, () => console.log("Mindrift http://localhost:" + PORT));