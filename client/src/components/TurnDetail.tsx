// @ts-nocheck — JSX render component, types to be added gradually

import { useState, useMemo } from "react";
import { Zap, Wrench, GitBranch, Brain, Circle, Clock, User, Bot, ChevronDown, ChevronRight, Eye, Columns, FileText, AlertTriangle, Lightbulb, BarChart3, Activity, Cpu, Gauge, Thermometer, ShieldCheck, ShieldAlert } from "lucide-react";
import Timeline from "./Timeline";
import RawLogViewer from "./RawLogViewer";
import ToolCallTree from "./ToolCallTree";
import ThinkingAnalysis from "./ThinkingAnalysis";
import TokenDonut from "./TokenDonut";
import TurnTokenChart from "./TurnTokenChart";

const fmt = (n) => { if (!n && n !== 0) return "0"; if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"; if (n < 1000) return String(Math.round(n)); return String(n); };
const fmtMs = (ms) => { if (!ms) return "\u2014"; if (ms < 1000) return ms + "ms"; return (ms / 1000).toFixed(1) + "s"; };
const fmtDur = (sec) => { if (sec == null) return ""; if (sec < 60) return sec + "s"; const m = Math.floor(sec / 60); return m + "m " + (sec % 60) + "s"; };

export default function TurnDetail({ turn, planSteps, turnTools, activeView, setActiveView, sessionMeta, turns, setSelectedTurnN, selectedTurnN, allToolCalls }) {
  const isDark = document.documentElement.className !== "light";

  if (!turn && activeView !== "allturns") {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
        <div className="text-center"><Brain size={32} className="mx-auto mb-3 opacity-20" /><p className="text-xs">Select a turn from the sidebar</p></div>
      </div>
    );
  }

  if (activeView === "allturns") {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="shrink-0 px-5 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><BarChart3 size={14} className="text-cyan-400" /><span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Token by Turn</span></div>
            <TabBar activeView={activeView} setActiveView={setActiveView} />
          </div>
        </div>
        <TurnTokenChart turns={turns} selectedTurnN={selectedTurnN} onSelectTurn={setSelectedTurnN} />
      </div>
    );
  }

  const tok = turn.tokens || {};
  const total = (tok.in || 0) + (tok.out || 0) + (tok.reason || 0);
  const isDone = turn.done || turn.taskDone || turn.finishedAt;
  const isAborted = turn.aborted;
  const ctxPct = turn.ctxWindow > 0 ? Math.round((total / turn.ctxWindow) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Turn banner */}
      <div className="shrink-0 px-5 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-1.5">
              <User size={13} className="text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>{turn.userMsg || (turn.goalObjective ? "[Goal] " + turn.goalObjective.slice(0, 150) : "(no message)")}</p>
            </div>
            {turn.agentSummary && (
              <div className="flex items-start gap-2">
                <Bot size={13} className="text-purple-400 shrink-0 mt-0.5" />
                <p className="text-[10px] leading-relaxed line-clamp-2" style={{ color: "var(--text-secondary)" }}>{turn.agentSummary}</p>
              </div>
            )}
            {(turn.compacted || isAborted) && (
              <div className="mt-1.5 flex items-center gap-1.5">
                {turn.compacted && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">compacted {turn.compactRestarts || 1}x</span>}
                {isAborted && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">interrupted</span>}
              </div>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1">
            <span className="text-[10px] font-semibold ">Turn #{turn.n}</span>
            <div className="flex items-center gap-2 text-[9px]" style={{ color: "var(--text-muted)" }}>
              {turn.duration && <span className="flex items-center gap-1"><Clock size={10} />{fmtDur(turn.duration)}</span>}
              <span className={isAborted ? "text-red-400" : isDone ? "text-emerald-400" : "text-amber-400"}>
                {isAborted ? "aborted" : isDone ? "done" : "active"}
              </span>
            </div>
          </div>
        </div>

        {/* Turn-level token stats row */}
        <div className="flex items-center gap-4 mt-2 text-[9px]">
          <span className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}><Zap size={10} className="text-cyan-500/60" /><span className="font-mono" style={{ color: "var(--text-primary)" }}>{fmt(total)}</span> tokens</span>
          <span className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}><Wrench size={10} className="text-purple-500/60" /><span className="font-mono" style={{ color: "var(--text-primary)" }}>{turn.tc || 0}</span> tools</span>
          {ctxPct > 0 && (
            <span className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
              <Thermometer size={10} className={ctxPct > 80 ? "text-red-500/60" : ctxPct > 40 ? "text-amber-500/60" : "text-emerald-500/60"} />
              <span className="font-mono" style={{ color: ctxPct > 80 ? "var(--accent-red)" : ctxPct > 40 ? "var(--accent-amber)" : "var(--accent-green)" }}>{ctxPct}% ctx</span>
            </span>
          )}
          <div className="flex items-center gap-1 ml-auto">
            <div className="flex items-center gap-0.5 text-[8px]" style={{ color: "var(--text-dim)" }}>
              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: "var(--accent-cyan)" }} />
              in:{fmt(tok.in||0)}
            </div>
            <div className="flex items-center gap-0.5 text-[8px]" style={{ color: "var(--text-dim)" }}>
              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: "var(--accent-purple)" }} />
              reason:{fmt(tok.reason||0)}
            </div>
            <div className="flex items-center gap-0.5 text-[8px]" style={{ color: "var(--text-dim)" }}>
              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: "var(--accent-amber)" }} />
              out:{fmt(tok.out||0)}
            </div>
          </div>
        </div>

        <TabBar activeView={activeView} setActiveView={setActiveView} />
      </div>

      {/* Content area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {activeView === "overview" && (
          <OverviewView turn={turn} turnTools={turnTools} planSteps={planSteps} allToolCalls={allToolCalls} turns={turns} sessionMeta={sessionMeta} />
        )}
        {activeView === "timeline" && <Timeline turn={turn} turnTools={turnTools} />}
        {activeView === "tools" && <ToolCallTree turn={turn} turnTools={turnTools} />}
        {activeView === "thinking" && <ThinkingAnalysis turn={turn} />}
        {activeView === "raw" && <RawLogViewer sessionMeta={sessionMeta} />}
      </div>
    </div>
  );
}

/* ====== Overview View ====== */
function OverviewView({ turn, turnTools, planSteps, allToolCalls, turns, sessionMeta }) {
  const tok = turn.tokens || {};
  const total = (tok.in || 0) + (tok.out || 0) + (tok.reason || 0);
  const ctxPct = turn.ctxWindow > 0 ? Math.round((total / turn.ctxWindow) * 100) : 0;
  const doneCount = turnTools.filter((t) => t && t.done).length;
  const errCount = turnTools.filter((t) => t && t.error).length;

  // All tool calls across all turns
  const allTools = allToolCalls || [];
  const totalDone = allTools.filter((t) => t && t.done).length;
  const totalErr = allTools.filter((t) => t && t.error).length;

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Token Donut */}
        <Panel icon={<Zap size={12} className="text-cyan-400" />} title="Token Usage">
          <TokenDonut tokens={tok} total={total} />
        </Panel>

        {/* Context Pressure Gauge (NEW) */}
        <Panel icon={<Gauge size={12} className={ctxPct > 80 ? "text-red-400" : ctxPct > 50 ? "text-amber-400" : "text-emerald-400"} />} title="Context Pressure">
          <ContextGauge pct={ctxPct} ctxWindow={turn.ctxWindow} used={total} />
        </Panel>

        {/* Agent Health Card (NEW) */}
        <Panel icon={<Cpu size={12} className="text-purple-400" />} title="Agent Health">
          <AgentHealth turn={turn} turnTools={turnTools} />
        </Panel>

        {/* Plan Steps */}
        <Panel icon={<GitBranch size={12} className="text-amber-400" />} title="Plan Steps" count={planSteps?.length || 0}>
          <PlanStepList steps={planSteps} />
        </Panel>
      </div>

      {/* Tool Calls Summary */}
      {turnTools.length > 0 && (
        <Panel icon={<Wrench size={12} className="text-purple-400" />} title="Tool Calls" count={turnTools.length}>
          <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto">
            {turnTools.slice(0, 20).map((tc, i) => (
              <ToolCallRow key={tc?.id || i} tc={tc} />
            ))}
            {turnTools.length > 20 && (
              <div className="text-[9px] text-center py-1" style={{ color: "var(--text-muted)" }}>
                +{turnTools.length - 20} more (switch to Tools tab for full view)
              </div>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ====== Context Gauge (NEW MODULE) ====== */
function ContextGauge({ pct, ctxWindow, used }) {
  const level = pct > 90 ? "critical" : pct > 70 ? "high" : pct > 40 ? "moderate" : "low";
  const colors = { critical: { bar: "#ef4444", text: "var(--accent-red)" }, high: { bar: "#f59e0b", text: "var(--accent-amber)" }, moderate: { bar: "#22d3ee", text: "var(--accent-cyan)" }, low: { bar: "#34d399", text: "var(--accent-green)" } };
  const c = colors[level];
  const label = level === "critical" ? "Critical" : level === "high" ? "High" : level === "moderate" ? "Moderate" : "Healthy";
  return (
    <div className="p-3 flex flex-col items-center justify-center h-full min-h-[100px]">
      <div className="relative w-20 h-20 mb-2">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="26" fill="none" stroke="var(--border)" strokeWidth="6" />
          <circle cx="32" cy="32" r="26" fill="none" stroke={c.bar} strokeWidth="6" strokeDasharray={`${(pct / 100) * 163.4} 163.4`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold font-mono" style={{ color: c.text }}>{pct}%</span>
        </div>
      </div>
      <span className="text-[9px] font-semibold" style={{ color: c.text }}>{label}</span>
      <span className="text-[8px] mt-0.5" style={{ color: "var(--text-muted)" }}>{fmt(used)} / {fmt(ctxWindow)} tokens</span>
    </div>
  );
}

/* ====== Agent Health (NEW MODULE) ====== */
function AgentHealth({ turn, turnTools }) {
  const errCount = turnTools.filter((t) => t && t.error).length;
  const doneCount = turnTools.filter((t) => t && t.done).length;
  const total = turnTools.length;
  const successRate = total > 0 ? Math.round((doneCount / total) * 100) : 100;
  const isCompacted = turn.compacted;
  const isAborted = turn.aborted;
  const wasteTokens = turn.wastedTokens || 0;

  const healthScore = (() => {
    let s = 100;
    if (errCount > 0) s -= errCount * 10;
    if (isCompacted) s -= 20;
    if (isAborted) s -= 40;
    if (wasteTokens > 5000) s -= 15;
    return Math.max(0, s);
  })();

  const healthColor = healthScore >= 80 ? "var(--accent-green)" : healthScore >= 50 ? "var(--accent-amber)" : "var(--accent-red)";
  const healthLabel = healthScore >= 80 ? "Healthy" : healthScore >= 50 ? "Degraded" : "Critical";

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px]" style={{ color: "var(--text-secondary)" }}>Health Score</span>
        <span className="text-sm font-bold font-mono" style={{ color: healthColor }}>{healthScore}%</span>
      </div>
      {/* Simple bar */}
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: healthScore + "%", background: healthColor }} />
      </div>
      <div className="flex items-center justify-between text-[8px]" style={{ color: "var(--text-muted)" }}>
        <span>{healthLabel}</span>
        <span>{total} tools · {errCount} errors · {doneCount} done</span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-[7px]">
        <StatusChip label="Compacted" active={isCompacted} />
        <StatusChip label="Aborted" active={isAborted} />
        <StatusChip label="Waste" active={wasteTokens > 0} detail={wasteTokens > 0 ? fmt(wasteTokens) + " tk" : ""} />
      </div>
    </div>
  );
}

function StatusChip({ label, active, detail }) {
  return (
    <div className="flex items-center gap-1 px-1.5 py-1 rounded" style={{ background: active ? "rgba(239,68,68,0.1)" : "var(--bg-card)", color: active ? "var(--accent-red)" : "var(--text-muted)" }}>
      {active ? <ShieldAlert size={8} /> : <ShieldCheck size={8} />}
      <span>{label}{detail ? " " + detail : ""}</span>
    </div>
  );
}

/* ====== Plan Step List ====== */
function PlanStepList({ steps }) {
  if (!steps || steps.length === 0) {
    return <div className="p-3 text-[9px] text-center" style={{ color: "var(--text-muted)" }}>No plan steps recorded</div>;
  }
  return (
    <div className="p-2 space-y-1 max-h-[200px] overflow-y-auto">
      {steps.map((ps, i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "var(--bg-card)" }}>
          <Circle size={6} className={`shrink-0 ${ps.status === "completed" ? "text-emerald-400 fill-emerald-400" : ps.status === "in_progress" ? "text-amber-400 fill-amber-400" : ""}`}
            style={!ps.status || ps.status === "pending" ? { color: "var(--text-muted)" } : {}} />
          <span className="text-[9px] truncate" style={{ color: "var(--text-secondary)" }}>{ps.step}</span>
          <span className={`text-[7px] ml-auto shrink-0 ${ps.status === "completed" ? "text-emerald-400" : ps.status === "in_progress" ? "text-amber-400" : ""}`}
            style={!ps.status || ps.status === "pending" ? { color: "var(--text-muted)" } : {}}>
            {ps.status ? ps.status.replace("_", " ") : "pending"}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ====== Tool Call Row (click-expand) ====== */
function ToolCallRow({ tc }) {
  const [open, setOpen] = useState(false);
  if (!tc) return null;
  const label = (tc.name || "tool").replace(/_/g, " ");
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover: transition-colors text-left">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${tc.error ? "bg-red-400" : tc.done ? "bg-emerald-400" : "bg-zinc-600 animate-pulse"}`} />
        <span className={`text-[10px] font-semibold w-16 shrink-0 truncate ${tc.error ? "text-red-400" : "text-cyan-400"}`}>{label}</span>
        <span className="text-[9px] truncate flex-1 font-mono" style={{ color: "var(--text-secondary)" }}>{(tc.args || "").slice(0, 60)}</span>
        <span className="text-[9px] font-mono shrink-0" style={{ color: "var(--text-muted)" }}>{tc.done ? fmtMs(tc.dur) : "\u00B7\u00B7\u00B7"}</span>
        {open ? <ChevronDown size={10} style={{ color: "var(--text-muted)" }} /> : <ChevronRight size={10} style={{ color: "var(--text-muted)" }} />}
      </button>
      {open && (
        <div className="ml-6 mr-2 mb-1 p-2 rounded border" style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}>
          <div className="text-[8px] mb-1 font-semibold" style={{ color: "var(--text-muted)" }}>ARGS:</div>
          <pre className="text-[9px] font-mono mb-2 break-all whitespace-pre-wrap max-h-[150px] overflow-y-auto" style={{ color: "var(--text-secondary)" }}>{tc.argsFull || tc.args || "(none)"}</pre>
          {(tc.outputFull || tc.output) && (
            <>
              <div className="text-[8px] mb-1 font-semibold" style={{ color: "var(--text-muted)" }}>OUTPUT {tc.outputSize ? "(" + (tc.outputSize / 1000).toFixed(1) + "KB)" : ""}:</div>
              <pre className="text-[9px] font-mono max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all" style={{ color: "var(--text-secondary)" }}>{tc.outputFull || tc.output}</pre>
            </>
          )}
          {tc.error && <div className="text-[9px] text-red-400 mt-1">Error: {tc.error}</div>}
        </div>
      )}
    </div>
  );
}

/* ====== Panel wrapper ====== */
function Panel({ icon, title, count, children }) {
  return (
    <div className="glass flex flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
        {icon}
        <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--text-secondary)" }}>{title}</span>
        {count !== undefined && <span className="text-[9px] font-mono ml-auto" style={{ color: "var(--text-muted)" }}>{count}</span>}
      </div>
      {children}
    </div>
  );
}

/* ====== Tab Bar ====== */
function TabBar({ activeView, setActiveView }) {
  const tabs = [
    { key: "overview", label: "Overview", icon: <Columns size={10} /> },
    { key: "timeline", label: "Timeline", icon: <Eye size={10} /> },
    { key: "tools", label: "Tools", icon: <Wrench size={10} /> },
    { key: "thinking", label: "Thinking", icon: <Brain size={10} /> },
    { key: "allturns", label: "All Turns", icon: <BarChart3 size={10} /> },
    { key: "raw", label: "Raw", icon: <FileText size={10} /> },
  ];
  return (
    <div className="flex items-center gap-0.5 mt-3 -mb-px flex-wrap">
      {tabs.map((v) => (
        <button key={v.key} onClick={() => setActiveView(v.key)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-t-lg text-[9px] transition-colors"
          style={{
            color: activeView === v.key ? "var(--text-primary)" : "var(--text-muted)",
            background: activeView === v.key ? "var(--bg-card)" : "transparent",
            borderBottom: activeView === v.key ? "2px solid rgba(34,211,238,0.4)" : "2px solid transparent",
          }}>
          {v.icon}{v.label}
        </button>
      ))}
    </div>
  );
}
