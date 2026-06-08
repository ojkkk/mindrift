// ====== Claude Code Session Parser ======
// Parses ~/.claude/projects/*/session-*.jsonl
// Output is compatible with the server's ParsedSession format

const fs = require("fs");
const path = require("path");
const os = require("os");

const CLAUDE_SESSIONS = path.join(os.homedir(), ".claude", "projects");

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

function extractFirstLine(text: string): string {
  if (!text) return "";
  const lines = text.split(/\n/).map((l: string) => l.trim()).filter((l: string) => l && l.length > 2);
  return lines.length > 0 ? lines[0].slice(0, 200) : "";
}

/**
 * Parse a Claude Code session JSONL file into the server's ParsedSession format
 */
function parseClaudeSession(raw: string, filePath: string): any {
  try {
    const lines = raw.split("\n").filter((l: string) => l.trim());
    if (lines.length === 0) return null;

    const turns: any[] = [];
    const toolCalls: any[] = [];
    let tokenTotal = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 };
    let ctxWindow = 0;
    let sessionId = path.basename(filePath, ".jsonl").replace(/^session-/, "");
    let currentTurn: any = null;
    let tn = 0;

    for (const line of lines) {
      const evt = safeJson(line);
      if (!evt) continue;

      const role = evt.type || evt.role;

      if (role === "user") {
        // Finish previous turn
        if (currentTurn) {
          currentTurn.finishedAt = evt.timestamp || new Date().toISOString();
          if (currentTurn.startedAt) {
            currentTurn.duration = Math.round(
              (new Date(currentTurn.finishedAt).getTime() - new Date(currentTurn.startedAt).getTime()) / 1000
            );
          }
        }
        tn++;
        currentTurn = {
          id: sessionId + "-t" + tn,
          n: tn,
          model: evt.model || "claude",
          startedAt: evt.timestamp || new Date().toISOString(),
          finishedAt: null,
          tc: 0,
          tokens: { in: 0, out: 0, reason: 0 },
          ctxWindow: 0,
          userMsg: extractFirstLine(evt.content?.[0]?.text || evt.message || ""),
          agentMessages: [],
          agentSummary: "",
          reasoning: "",
          duration: null,
          compacted: false,
          compactRestarts: 0,
          compactSummary: "",
          goalObjective: "",
          aborted: false,
          abortReason: "",
          taskDone: false,
          wastedTokens: 0,
          wasteReasons: [],
          planSteps: [],
        };
        turns.push(currentTurn);
      } else if (role === "assistant" && currentTurn) {
        const text = evt.content?.[0]?.text || evt.message || "";
        if (text) {
          currentTurn.agentMessages.push({ ts: evt.timestamp || "", text: text.slice(0, 500) });
          if (!currentTurn.agentSummary) currentTurn.agentSummary = text.slice(0, 200);
        }
        if (evt.usage) {
          currentTurn.tokens.in += evt.usage.input_tokens || 0;
          currentTurn.tokens.out += evt.usage.output_tokens || 0;
          tokenTotal.input_tokens += evt.usage.input_tokens || 0;
          tokenTotal.output_tokens += evt.usage.output_tokens || 0;
          tokenTotal.total_tokens += (evt.usage.input_tokens || 0) + (evt.usage.output_tokens || 0);
        }
        if (evt.model) currentTurn.model = evt.model;
      } else if ((role === "tool_use" || evt.name) && currentTurn) {
        currentTurn.tc++;
        toolCalls.push({
          id: evt.id || String(Date.now()),
          name: evt.name || "unknown",
          ts: evt.timestamp || new Date().toISOString(),
          dur: null,
          done: false,
          args: JSON.stringify(evt.input || evt.arguments || {}).slice(0, 200),
          argsFull: JSON.stringify(evt.input || evt.arguments || {}),
          output: "",
          outputFull: "",
          turnN: currentTurn.n,
        });
      } else if (role === "tool_result" && currentTurn) {
        const existing = [...toolCalls].reverse().find((c: any) => c.turnN === currentTurn.n && !c.done);
        if (existing) {
          existing.done = true;
          existing.output = (evt.content || evt.output || "").slice(0, 500);
          existing.outputFull = evt.content || evt.output || "";
          existing.outputSize = (existing.outputFull || "").length;
          if (existing.ts) {
            existing.dur = Date.now() - new Date(existing.ts).getTime();
          }
        }
      } else if (role === "system" && evt.context_window) {
        ctxWindow = evt.context_window;
      }
    }

    // Finish last turn
    if (currentTurn && !currentTurn.finishedAt) {
      currentTurn.finishedAt = new Date().toISOString();
      if (currentTurn.startedAt) {
        currentTurn.duration = Math.round(
          (new Date(currentTurn.finishedAt).getTime() - new Date(currentTurn.startedAt).getTime()) / 1000
        );
      }
    }

    if (turns.length === 0) return null;

    // Calculate wasted tokens
    for (const t of turns) {
      if (t.aborted || t.compacted) {
        t.wastedTokens = (t.tokens.in || 0) + (t.tokens.out || 0) + (t.tokens.reason || 0);
      }
    }

    return {
      meta: {
        id: sessionId,
        cwd: "",
        model: turns[0]?.model || "claude",
        startedAt: turns[0]?.startedAt || new Date().toISOString(),
      },
      turns,
      toolCalls,
      planSteps: [],
      planProgress: { completed: 0, total: 0 },
      tokenTotal,
      ctxWindow,
    };
  } catch {
    return null;
  }
}

/**
 * Scan Claude Code sessions directory for metadata
 */
function scanClaudeSessions(): any[] {
  const sessions: any[] = [];
  if (!fs.existsSync(CLAUDE_SESSIONS)) return sessions;
  try {
    const projects = fs.readdirSync(CLAUDE_SESSIONS, { withFileTypes: true })
      .filter((e: any) => e.isDirectory());
    
    for (const proj of projects) {
      const projDir = path.join(CLAUDE_SESSIONS, proj.name);
      const files = fs.readdirSync(projDir).filter((f: string) => f.endsWith(".jsonl"));
      for (const f of files) {
        const fp = path.join(projDir, f);
        try {
          const stat = fs.statSync(fp);
          const raw = fs.readFileSync(fp, "utf-8");
          const rawLines = raw.split("\n").filter((l: string) => l.trim());
          let name = "";
          let turnCount = 0;
          let toolCallCount = 0;
          let totalTokens = 0;
          let model = "claude";
          let firstTs = stat.birthtime.toISOString();

          for (const line of rawLines) {
            const evt = safeJson(line);
            if (!evt) continue;
            const role = evt.type || evt.role;
            if (role === "user") {
              turnCount++;
              if (!name) name = extractFirstLine(evt.content?.[0]?.text || evt.message || "");
              if (evt.timestamp && evt.timestamp < firstTs) firstTs = evt.timestamp;
            }
            if (evt.usage) {
              totalTokens = Math.max(totalTokens, (evt.usage.input_tokens || 0) + (evt.usage.output_tokens || 0));
            }
            if (role === "tool_use" || evt.name) toolCallCount++;
            if (evt.model) model = evt.model;
          }

          if (turnCount === 0) continue;

          const anomalies: string[] = [];
          if (turnCount > 0 && totalTokens / turnCount > 50000) anomalies.push("high-tokens");
          if (toolCallCount > 50) anomalies.push("many-tools");
          if (turnCount > 30) anomalies.push("long-session");

          sessions.push({
            id: "claude-" + path.basename(fp, ".jsonl"),
            name: name || path.basename(fp, ".jsonl").slice(0, 30),
            filePath: fp,
            source: "claude-code",
            startedAt: firstTs,
            lastModified: stat.mtime.toISOString(),
            turnCount,
            totalTokens,
            toolCallCount,
            model,
            cwd: "",
            anomalies,
          });
        } catch { /* skip */ }
      }
    }
    sessions.sort((a: any, b: any) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );
  } catch { /* skip */ }
  return sessions;
}

module.exports = { parseClaudeSession, scanClaudeSessions, CLAUDE_SESSIONS };
