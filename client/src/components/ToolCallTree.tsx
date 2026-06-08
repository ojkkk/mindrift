// @ts-nocheck

import { useState, useMemo } from "react";
import { Wrench, Clock, AlertCircle, ChevronRight, ChevronDown, Repeat } from "lucide-react";

const fmtMs = (ms) => { if (!ms) return "\u2014"; if (ms < 1000) return ms + "ms"; return (ms / 1000).toFixed(1) + "s"; };

export default function ToolCallTree({ turn, turnTools }) {
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  const tree = useMemo(() => {
    const tools = turnTools || [];
    if (tools.length === 0) return { calls: [], byName: {}, patterns: [], totalCalls: 0, doneCount: 0, errorCount: 0, totalDur: 0 };
    const byName = {};
    for (const tc of tools) {
      if (!tc || !tc.name) continue;
      if (!byName[tc.name]) byName[tc.name] = [];
      byName[tc.name].push(tc);
    }
    const patterns = [];
    for (const [name, calls] of Object.entries(byName)) {
      if (calls.length > 3) patterns.push({ type: "repeat", name, count: calls.length, severity: calls.length > 5 ? "high" : "medium" });
    }
    const sortedByDur = [...tools].filter((t) => t && t.dur > 0).sort((a, b) => (b.dur || 0) - (a.dur || 0));
    for (const tc of sortedByDur.slice(0, 3)) {
      if (tc && tc.dur > 2000) patterns.push({ type: "slow", tc, severity: tc.dur > 5000 ? "high" : "medium" });
    }
    const failed = tools.filter((t) => t && t.error);
    for (const tc of failed) patterns.push({ type: "error", tc, severity: "high" });
    return { calls: tools, byName, patterns, totalCalls: tools.length, doneCount: tools.filter((t) => t && t.done).length, errorCount: failed.length, totalDur: tools.reduce((s, t) => s + ((t && t.dur) || 0), 0) };
  }, [turnTools]);

  if (!turn) return <div className="flex-1 flex items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>Select a turn</div>;
  if (tree.calls.length === 0) return <div className="flex-1 flex items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>No tool calls in this turn</div>;

  const toggle = (key) => setExpandedNodes((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-3 py-2 rounded border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <Stat label="calls" value={tree.totalCalls} icon={<Wrench size={11} className="text-purple-400" />} />
        <Stat label="total" value={fmtMs(tree.totalDur)} icon={<Clock size={11} className="text-cyan-400" />} />
        <Stat label="done" value={tree.doneCount} icon={<div className="w-2 h-2 rounded-full bg-emerald-400" />} />
        {tree.errorCount > 0 && <Stat label="failed" value={tree.errorCount} icon={<AlertCircle size={11} className="text-red-400" />} alert />}
      </div>

      {/* Patterns */}
      {tree.patterns.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[9px] font-semibold tracking-wider uppercase px-1" style={{ color: "var(--text-muted)" }}>Detected Patterns</div>
          {tree.patterns.map((p, i) => {
            const cfg = p.type === "repeat" ? { icon: <Repeat size={10} />, base: "text-amber-400 bg-amber-400/5 border-amber-400/20", label: `Repeated ${p.count}x: ${(p.name || "").replace(/_/g, " ")}` }
              : p.type === "slow" ? { icon: <Clock size={10} />, base: p.severity === "high" ? "text-red-400 bg-red-400/5 border-red-400/20" : "text-amber-400 bg-amber-400/5 border-amber-400/20", label: `Slow: ${(p.tc?.name || "").replace(/_/g, " ")} (${fmtMs(p.tc?.dur)})` }
              : { icon: <AlertCircle size={10} />, base: "text-red-400 bg-red-400/5 border-red-400/20", label: `Failed: ${(p.tc?.name || "").replace(/_/g, " ")}` };
            return <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 rounded border text-[9px] ${cfg.base}`}>{cfg.icon}<span>{cfg.label}</span></div>;
          })}
        </div>
      )}

      {/* By Tool Type */}
      <div className="space-y-1.5">
        <div className="text-[9px] font-semibold tracking-wider uppercase px-1" style={{ color: "var(--text-muted)" }}>By Tool Type</div>
        {Object.entries(tree.byName).sort((a, b) => b[1].length - a[1].length).map(([name, calls]) => {
          const isExpanded = expandedNodes.has(name);
          const avgDur = calls.reduce((s, c) => s + ((c && c.dur) || 0), 0) / calls.length;
          return (
            <div key={name} className="rounded border overflow-hidden" style={{ borderColor: "var(--border)" }}>
              <button onClick={() => toggle(name)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.02] transition-colors text-left">
                {isExpanded ? <ChevronDown size={10} style={{ color: "var(--text-muted)" }} /> : <ChevronRight size={10} style={{ color: "var(--text-muted)" }} />}
                <span className="text-[10px] font-semibold" style={{ color: "var(--text-primary)" }}>{(name || "").replace(/_/g, " ")}</span>
                <span className="text-[9px] font-mono ml-auto" style={{ color: "var(--text-muted)" }}>{calls.length}x</span>
                <span className="text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>avg {fmtMs(Math.round(avgDur))}</span>
              </button>
              {isExpanded && (
                <div className="border-t" style={{ borderColor: "var(--border)" }}>
                  {calls.map((tc, i) => <ToolCallNode key={tc?.id || i} tc={tc} index={i} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, icon, alert }) {
  return (
    <div className={`flex items-center gap-1.5 text-[10px] ${alert ? "text-red-400" : ""}`} style={!alert ? { color: "var(--text-secondary)" } : {}}>
      {icon}
      <span className="font-mono" style={!alert ? { color: "var(--text-primary)" } : {}}>{value}</span>
      <span style={!alert ? { color: "var(--text-muted)" } : {}}>{label}</span>
    </div>
  );
}

function ToolCallNode({ tc, index }) {
  const [open, setOpen] = useState(false);
  if (!tc) return null;
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-5 py-1.5 hover:bg-white/[0.02] transition-colors text-left">
        <span className="text-[9px] font-mono w-6" style={{ color: "var(--text-muted)" }}>#{index + 1}</span>
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${tc.error ? "bg-red-400" : tc.done ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
        <span className="text-[9px] font-mono shrink-0 w-12" style={{ color: "var(--text-muted)" }}>{fmtMs(tc.dur)}</span>
        <span className="text-[9px] truncate flex-1" style={{ color: "var(--text-secondary)" }}>{(tc.args || "").slice(0, 60)}</span>
        {tc.error && <AlertCircle size={10} className="text-red-400 shrink-0" />}
        {open ? <ChevronDown size={10} style={{ color: "var(--text-muted)" }} /> : <ChevronRight size={10} style={{ color: "var(--text-muted)" }} />}
      </button>
      {open && (
        <div className="ml-10 mr-3 mb-1 p-2 rounded border" style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}>
          <div className="text-[8px] mb-1 font-semibold" style={{ color: "var(--text-muted)" }}>ARGS:</div>
          <pre className="text-[9px] font-mono mb-2 break-all whitespace-pre-wrap max-h-[150px] overflow-y-auto" style={{ color: "var(--text-secondary)" }}>{tc.argsFull || tc.args || ""}</pre>
          {(tc.outputFull || tc.output) && (
            <>
              <div className="text-[8px] mb-1 font-semibold" style={{ color: "var(--text-muted)" }}>OUTPUT ({(tc.outputSize ? (tc.outputSize / 1000).toFixed(1) + "KB" : "?")}):</div>
              <pre className="text-[9px] font-mono max-h-[250px] overflow-y-auto whitespace-pre-wrap break-all" style={{ color: "var(--text-secondary)" }}>{tc.outputFull || tc.output}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
