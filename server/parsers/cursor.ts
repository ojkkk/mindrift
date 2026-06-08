// ====== Cursor Agent Session Parser ======
// Parses Cursor agent mode logs from multiple possible locations:
//   - ~/.cursor-tutor/conversations/*.json
//   - <workspace>/.cursor/agent/*.jsonl
//   - %APPDATA%/Cursor/agent_logs/*.jsonl
// Output is compatible with the server's ParsedSession format

const fs = require("fs");
const path = require("path");
const os = require("os");

// Possible Cursor log directories
function getCursorDirs(): string[] {
  const dirs: string[] = [];
  const home = os.homedir();
  
  // ~/.cursor-tutor (older Cursor versions)
  const tutorDir = path.join(home, ".cursor-tutor", "conversations");
  if (fs.existsSync(tutorDir)) dirs.push(tutorDir);
  
  // ~/.cursor/agent (newer versions)
  const cursorAgent = path.join(home, ".cursor", "agent");
  if (fs.existsSync(cursorAgent)) dirs.push(cursorAgent);
  
  // Windows AppData
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    const winDir = path.join(appData, "Cursor", "agent_logs");
    if (fs.existsSync(winDir)) dirs.push(winDir);
  }
  
  return dirs;
}

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

function extractFirstLine(text: string): string {
  if (!text) return "";
  const lines = text.split(/\n/).map((l: string) => l.trim()).filter((l: string) => l && l.length > 2);
  return lines.length > 0 ? lines[0].slice(0, 200) : "";
}

/**
 * Parse a Cursor agent session file into ParsedSession format
 * Supports both JSONL (one event per line) and JSON array formats
 */
function parseCursorSession(raw: string, filePath: string): any {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Detect format: JSON array vs JSONL
    let events: any[] = [];
    if (trimmed.startsWith("[")) {
      // JSON array format
      events = safeJson(trimmed) || [];
      if (!Array.isArray(events)) return null;
    } else {
      // JSONL format (one JSON object per line)
      events = trimmed.split("\n")
        .map((l: string) => safeJson(l.trim()))
        .filter(Boolean);
    }
    if (events.length === 0) return null;

    const turns: any[] = [];
    const toolCalls: any[] = [];
    let tokenTotal = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 };
    let ctxWindow = 0;
    let sessionId = path.basename(filePath).replace(/\.(jsonl?|txt)$/, "").slice(0, 40);
    let currentTurn: any = null;
    let tn = 0;
    let sessionModel = "cursor";

    for (const evt of events) {
      // Handle multiple possible event formats
      const type = evt.type || evt.role || "";
      const ts = evt.timestamp || evt.created_at || evt.ts || new Date().toISOString();

      // User message -> new turn
      if (type === "user" || type === "user_message" || evt.role === "user") {
        if (currentTurn) {
          currentTurn.finishedAt = ts;
          if (currentTurn.startedAt) {
            currentTurn.duration = Math.round((new Date(ts).getTime() - new Date(currentTurn.startedAt).getTime()) / 1000);
          }
        }
        tn++;
        const content = typeof evt.content === "string" ? evt.content : (evt.content?.[0]?.text || evt.message || evt.text || "");
        currentTurn = {
          id: sessionId + "-t" + tn,
          n: tn,
          model: evt.model || sessionModel,
          startedAt: ts,
          finishedAt: null,
          tc: 0,
          tokens: { in: 0, out: 0, reason: 0 },
          ctxWindow: 0,
          userMsg: extractFirstLine(content),
          agentMessages: [],
          agentSummary: "",
          reasoning: "",
          duration: null,
          compacted: false, compactRestarts: 0, compactSummary: "",
          goalObjective: "",
          aborted: false, abortReason: "", taskDone: false,
          wastedTokens: 0, wasteReasons: [], planSteps: [],
          turnEfficiency: undefined,
        };
        turns.push(currentTurn);
        continue;
      }

      // Assistant message
      if (type === "assistant" || type === "agent_message" || evt.role === "assistant") {
        if (!currentTurn) {
          tn++;
          currentTurn = {
            id: sessionId + "-t" + tn, n: tn, model: evt.model || sessionModel,
            startedAt: ts, finishedAt: null, tc: 0,
            tokens: { in: 0, out: 0, reason: 0 }, ctxWindow: 0,
            userMsg: "", agentMessages: [], agentSummary: "",
            reasoning: "", duration: null,
            compacted: false, compactRestarts: 0, compactSummary: "",
            goalObjective: "", aborted: false, abortReason: "", taskDone: false,
            wastedTokens: 0, wasteReasons: [], planSteps: [],
            turnEfficiency: undefined,
          };
          turns.push(currentTurn);
        }
        const content = typeof evt.content === "string" ? evt.content : (evt.content?.[0]?.text || evt.message || evt.text || "");
        if (content) {
          currentTurn.agentMessages.push({ ts, text: content.slice(0, 500) });
          if (!currentTurn.agentSummary) currentTurn.agentSummary = content.slice(0, 200);
        }
        if (evt.model) {
          currentTurn.model = evt.model;
          sessionModel = evt.model;
        }
        // Token usage
        if (evt.usage || evt.token_usage) {
          const u = evt.usage || evt.token_usage;
          currentTurn.tokens.in += u.input_tokens || u.prompt_tokens || 0;
          currentTurn.tokens.out += u.output_tokens || u.completion_tokens || 0;
          tokenTotal.input_tokens += u.input_tokens || u.prompt_tokens || 0;
          tokenTotal.output_tokens += u.output_tokens || u.completion_tokens || 0;
          tokenTotal.total_tokens += (u.input_tokens || u.prompt_tokens || 0) + (u.output_tokens || u.completion_tokens || 0);
        }
        if (evt.context_window || evt.max_tokens) {
          ctxWindow = Math.max(ctxWindow, evt.context_window || evt.max_tokens || 0);
        }
        continue;
      }

      // Tool call
      if (type === "tool_call" || type === "function_call" || evt.name) {
        if (currentTurn) currentTurn.tc++;
        const toolName = evt.name || evt.function?.name || evt.tool_name || "unknown";
        const toolArgs = evt.arguments || evt.function?.arguments || evt.input || {};
        toolCalls.push({
          id: evt.id || evt.call_id || String(Date.now()),
          name: toolName,
          ts, dur: null, done: false,
          args: (typeof toolArgs === "string" ? toolArgs : JSON.stringify(toolArgs)).slice(0, 200),
          argsFull: typeof toolArgs === "string" ? toolArgs : JSON.stringify(toolArgs),
          output: "", outputFull: "",
          turnN: currentTurn?.n || tn,
        });
        continue;
      }

      // Tool result
      if (type === "tool_result" || type === "function_call_output" || type === "tool") {
        const callId = evt.call_id || evt.id || evt.tool_call_id;
        const existing = [...toolCalls].reverse().find((c: any) => c.id === callId || (c.turnN === (currentTurn?.n || tn) && !c.done));
        if (existing) {
          existing.done = true;
          const output = typeof evt.content === "string" ? evt.content : (evt.output || evt.result || "");
          existing.output = (typeof output === "string" ? output : JSON.stringify(output)).slice(0, 500);
          existing.outputFull = typeof output === "string" ? output : JSON.stringify(output);
          existing.outputSize = existing.outputFull.length;
          if (existing.ts) existing.dur = Date.now() - new Date(existing.ts).getTime();
          if (evt.error) existing.error = evt.error;
        }
        continue;
      }

      // System / metadata
      if (type === "system" || type === "metadata" || type === "session_meta") {
        if (evt.model) sessionModel = evt.model;
        if (evt.session_id && !sessionId) sessionId = evt.session_id;
        continue;
      }
    }

    // Finish last turn
    if (currentTurn && !currentTurn.finishedAt) {
      currentTurn.finishedAt = new Date().toISOString();
      if (currentTurn.startedAt) {
        currentTurn.duration = Math.round((new Date(currentTurn.finishedAt).getTime() - new Date(currentTurn.startedAt).getTime()) / 1000);
      }
    }

    if (turns.length === 0) return null;

    // Per-turn efficiency
    for (const t of turns) {
      if (t.aborted || t.compacted) {
        t.wastedTokens = (t.tokens.in || 0) + (t.tokens.out || 0) + (t.tokens.reason || 0);
      }
      const total = (t.tokens.in || 0) + (t.tokens.out || 0) + (t.tokens.reason || 0);
      const allTools = toolCalls.filter((tc: any) => tc.turnN === t.n).length;
      const doneTools = toolCalls.filter((tc: any) => tc.turnN === t.n && tc.done).length;
      const toolSuccess = allTools > 0 ? Math.round((doneTools / allTools) * 100) : 100;
      const contextUtil = ctxWindow > 0 ? Math.min(100, Math.round((total / ctxWindow) * 100)) : 0;
      const wasteRatio = total > 0 ? Math.round(((t.wastedTokens || 0) / total) * 100) : 0;
      const overall = Math.round(toolSuccess * 0.4 + (100 - wasteRatio) * 0.3 + Math.min(100, contextUtil * 0.8) * 0.2 + 50 * 0.1);
      t.turnEfficiency = { tokenROI: 50, toolSuccess, contextUtil, wasteRatio, overall };
    }

    return {
      meta: {
        id: sessionId,
        cwd: "",
        model: sessionModel,
        startedAt: turns[0]?.startedAt || new Date().toISOString(),
      },
      turns, toolCalls,
      planSteps: [], planProgress: { completed: 0, total: 0 },
      tokenTotal, ctxWindow,
    };
  } catch {
    return null;
  }
}

/**
 * Scan Cursor agent sessions for metadata
 */
function scanCursorSessions(): any[] {
  const sessions: any[] = [];
  const dirs = getCursorDirs();
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files: string[] = [];
      function walk(d: string) {
        const entries = fs.readdirSync(d, { withFileTypes: true });
        for (const e of entries) {
          const fp = path.join(d, e.name);
          if (e.isDirectory()) walk(fp);
          else if (e.name.endsWith(".json") || e.name.endsWith(".jsonl")) files.push(fp);
        }
      }
      walk(dir);
      
      for (const fp of files) {
        try {
          const stat = fs.statSync(fp);
          const raw = fs.readFileSync(fp, "utf-8");
          let name = "";
          let turnCount = 0, toolCallCount = 0, totalTokens = 0;
          let model = "cursor";
          let firstTs = stat.birthtime.toISOString();

          const trimmed = raw.trim();
          let events: any[] = [];
          if (trimmed.startsWith("[")) {
            events = safeJson(trimmed) || [];
          } else {
            events = trimmed.split("\n").map((l: string) => safeJson(l.trim())).filter(Boolean);
          }

          for (const evt of events) {
            const type = evt.type || evt.role || "";
            if (type === "user" || evt.role === "user") {
              turnCount++;
              if (!name) {
                const content = typeof evt.content === "string" ? evt.content : (evt.content?.[0]?.text || evt.message || "");
                name = extractFirstLine(content);
              }
              if (evt.timestamp && evt.timestamp < firstTs) firstTs = evt.timestamp;
            }
            if (evt.usage || evt.token_usage) {
              const u = evt.usage || evt.token_usage;
              totalTokens = Math.max(totalTokens, (u.input_tokens || u.prompt_tokens || 0) + (u.output_tokens || u.completion_tokens || 0));
            }
            if (type === "tool_call" || type === "function_call" || evt.name) toolCallCount++;
            if (evt.model) model = evt.model;
          }

          if (turnCount === 0) continue;

          const anomalies: string[] = [];
          if (turnCount > 0 && totalTokens / turnCount > 50000) anomalies.push("high-tokens");
          if (toolCallCount > 50) anomalies.push("many-tools");
          if (turnCount > 30) anomalies.push("long-session");

          const toolSuccessRate = 100;
          const tpt = turnCount > 0 ? toolCallCount / turnCount : 0;
          let category = "";
          if (turnCount <= 1 && totalTokens < 5000) category = "";
          else if (tpt < 2) category = "chat-heavy";
          else if (tpt > 8) category = "tool-heavy";
          else category = "balanced";
          let effScore = 50;
          if (turnCount > 0) {
            effScore = Math.round(Math.min(100, Math.max(0, 100 - Math.abs(tpt - 4) * 10)) * 0.4 + 60);
          }

          sessions.push({
            id: "cursor-" + path.basename(fp).replace(/\.(jsonl?|txt)$/, "").slice(0, 40),
            name: name || path.basename(fp).slice(0, 30),
            filePath: fp,
            source: "cursor",
            startedAt: firstTs,
            lastModified: stat.mtime.toISOString(),
            turnCount, totalTokens, toolCallCount,
            model, cwd: "",
            anomalies, wastedTokens: 0,
            toolSuccessRate, efficiencyScore: effScore, category,
          });
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
  
  sessions.sort((a: any, b: any) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
  return sessions;
}

module.exports = { parseCursorSession, scanCursorSessions, getCursorDirs };
