import React, { useMemo, useState } from "react";
import { AlertTriangle, Zap, Wrench, Clock, TrendingUp } from "lucide-react";
import type { SessionInfo } from "../../../shared/types";

const fmt = (n: number) => { if (!n && n !== 0) return "0"; if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"; return String(Math.round(n)); };

export default function AnomalyInsights({ sessions, stats }: { sessions: SessionInfo[]; stats?: any }) {
  const [compareIds, setCompareIds] = useState<string[]>([]);
  
  const toggleCompare = (id: string) => {
    setCompareIds((prev: string[]) => {
      if (prev.includes(id)) return prev.filter((x: string) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };
  
  const compareSessions = compareIds.map((id: string) => sessions.find((s: any) => s.id === id)).filter(Boolean);
  
  const insights = useMemo(() => {
    if (!sessions || sessions.length === 0) return null;

    const flagged = sessions.filter((s) => s.anomalies && s.anomalies.length > 0);
    const totalTurns = sessions.reduce((a, s) => a + s.turnCount, 0);
    const totalTokens = sessions.reduce((a, s) => a + s.totalTokens, 0);
    const totalTools = sessions.reduce((a, s) => a + s.toolCallCount, 0);

    // Count anomaly types
    const counts: Record<string, number> = {};
    for (const s of flagged) {
      for (const a of s.anomalies) {
        counts[a] = (counts[a] || 0) + 1;
      }
    }

    // Top anomaly sessions
    const topAnomalies = [...flagged]
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, 5);

    // Platform breakdown
    const platforms: Record<string, number> = {};
    for (const s of sessions) {
      const p = s.source || "codex";
      platforms[p] = (platforms[p] || 0) + 1;
    }

    // Daily average
    const firstSession = sessions[sessions.length - 1];
    const lastSession = sessions[0];
    const daysActive = firstSession && lastSession
      ? Math.max(1, Math.round((new Date(lastSession.startedAt).getTime() - new Date(firstSession.startedAt).getTime()) / 86400000))
      : 1;
    const avgTokensPerDay = Math.round(totalTokens / daysActive / 1000);

    return {
      flagged,
      totalTurns,
      totalTokens,
      totalTools,
      counts,
      topAnomalies,
      platforms,
      daysActive,
      avgTokensPerDay,
      avgTokensPerTurn: totalTurns > 0 ? Math.round(totalTokens / totalTurns / 1000) : 0,
      healthScore: flagged.length > 0 ? Math.round((1 - flagged.length / sessions.length) * 100) : 100,
    };
  }, [sessions]);

  if (!insights) {
    return <div className="p-6 text-center text-[10px]" style={{ color: "var(--text-muted)" }}>Not enough data</div>;
  }

  const { counts, topAnomalies, platforms, daysActive, avgTokensPerDay, avgTokensPerTurn, healthScore, flagged } = insights;

  return (
    <div className="p-4 space-y-4">
      {/* Health Score */}
      <div className="flex items-center justify-between p-3 rounded-xl" style={{
        background: healthScore >= 80 ? "rgba(16,185,129,0.06)" : healthScore >= 50 ? "rgba(245,158,11,0.06)" : "rgba(239,68,68,0.06)",
        border: `1px solid ${healthScore >= 80 ? "rgba(16,185,129,0.15)" : healthScore >= 50 ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)"}`,
      }}>
        <div>
          <div className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-secondary)" }}>Session Health</div>
          <div className="text-[7px] mt-1" style={{ color: "var(--text-dim)" }}>% of sessions without anomalies</div>
          <div className="text-[8px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {flagged.length} flagged / {sessions.length} total
          </div>
        </div>
        <div className="text-2xl font-bold font-mono" style={{
          color: healthScore >= 80 ? "var(--accent-green)" : healthScore >= 50 ? "var(--accent-amber)" : "var(--accent-red)"
        }}>{healthScore}%</div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2">
        <MiniStat icon={<Zap size={10} className="text-cyan-400" />} label="Avg/Day" value={avgTokensPerDay + "K"} />
        <MiniStat icon={<TrendingUp size={10} className="text-purple-400" />} label="Avg/Turn" value={avgTokensPerTurn + "K"} />
        <MiniStat icon={<Clock size={10} className="text-amber-400" />} label="Days" value={String(daysActive)} />
      </div>

      {/* Efficiency Breakdown */}
      {stats?.efficiencyScores && (
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>Efficiency Score</div>
          <div className="text-[7px] mb-1" style={{ color: "var(--text-dim)" }}>Composite: tool success + waste avoidance + context util + token ROI</div>
          <div className="flex items-center gap-3 mb-2">
            <div className="text-2xl font-bold font-mono" style={{
              color: stats.efficiencyScores.overall >= 70 ? "var(--accent-green)" : stats.efficiencyScores.overall >= 40 ? "var(--accent-amber)" : "var(--accent-red)"
            }}>{stats.efficiencyScores.overall}%</div>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-card)" }}>
              <div className="h-full rounded-full transition-all duration-500" style={{
                width: stats.efficiencyScores.overall + "%",
                background: stats.efficiencyScores.overall >= 70 ? "linear-gradient(90deg, #22d3ee, #10b981)" : stats.efficiencyScores.overall >= 40 ? "linear-gradient(90deg, #f59e0b, #fbbf24)" : "linear-gradient(90deg, #ef4444, #f87171)"
              }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <EffMini label="Tool Success" value={stats.efficiencyScores.toolSuccess} />
            <EffMini label="Token ROI" value={stats.efficiencyScores.tokenROI} />
            <EffMini label="Context Util" value={stats.efficiencyScores.contextUtil} />
            <EffMini label="Waste Ratio" value={100 - stats.efficiencyScores.wasteRatio} invert />
          </div>
        </div>
      )}

      {/* Session Categories */}
      {stats?.categoryCounts && Object.keys(stats.categoryCounts).length > 0 && (
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>Session Types</div>
          <div className="text-[7px] mb-1" style={{ color: "var(--text-dim)" }}>By tool/turn ratio and efficiency</div>
          <div className="space-y-1">
            {Object.entries(stats.categoryCounts as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
              <div key={cat} className="flex items-center justify-between px-2 py-1.5 rounded" style={{ background: "var(--bg-card)" }}>
                <div className="flex items-center gap-2">
                  <CategoryDot category={cat} />
                  <span className="text-[9px]" style={{ color: "var(--text-secondary)" }}>{fmtCategory(cat)}</span>
                </div>
                <span className="text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>{count as number}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pattern Insights */}
      {stats?.patternInsights && (stats.patternInsights.totalWasted > 0 || stats.patternInsights.topTool) && (
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>Pattern Insights</div>
          <div className="space-y-1">
            {stats.patternInsights.totalWasted > 0 && (
              <div className="flex items-center justify-between px-2 py-1.5 rounded" style={{ background: "var(--bg-card)" }}>
                <span className="text-[9px]" style={{ color: "var(--text-secondary)" }}>Total Wasted</span>
                <span className="text-[9px] font-mono text-red-400">{fmt(stats.patternInsights.totalWasted)} tokens</span>
              </div>
            )}
            {stats.patternInsights.avgToolSuccess != null && (
              <div className="flex items-center justify-between px-2 py-1.5 rounded" style={{ background: "var(--bg-card)" }}>
                <span className="text-[9px]" style={{ color: "var(--text-secondary)" }}>Avg Tool Success</span>
                <span className="text-[9px] font-mono" style={{ color: stats.patternInsights.avgToolSuccess >= 80 ? "var(--accent-green)" : "var(--accent-amber)" }}>{stats.patternInsights.avgToolSuccess}%</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Anomaly Breakdown */}
      {Object.keys(counts).length > 0 && (
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>Anomaly Types</div>
          <div className="space-y-1.5">
            {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between px-2 py-1.5 rounded" style={{ background: "var(--bg-card)" }}>
                <div className="flex items-center gap-2">
                  <AnomalyIcon type={type} />
                  <span className="text-[9px]" style={{ color: "var(--text-secondary)" }}>{fmtAnomaly(type)}</span>
                </div>
                <span className="text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Platform Breakdown */}
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>Platforms</div>
        <div className="flex gap-2">
          {Object.entries(platforms).map(([p, c]) => (
            <div key={p} className="flex-1 px-3 py-2 rounded text-center" style={{ background: "var(--bg-card)" }}>
              <div className="text-[10px] font-semibold" style={{ color: p === "claude-code" ? "var(--accent-purple)" : "var(--accent-cyan)" }}>
                {p === "claude-code" ? "Claude" : "Codex"}
              </div>
              <div className="text-[9px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>{c}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Session Comparison */}
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>Compare Sessions (click 2)</div>
        <div className="space-y-1 max-h-[120px] overflow-y-auto">
          {sessions.slice(0, 15).map((s: any) => {
            const isSelected = compareIds.includes(s.id);
            return (
              <button key={s.id} onClick={() => toggleCompare(s.id)}
                className="w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[9px] transition-colors"
                style={{
                  background: isSelected ? "rgba(34,211,238,0.1)" : "var(--bg-card)",
                  color: isSelected ? "var(--accent-cyan)" : "var(--text-secondary)",
                }}>
                <div className="w-3 h-3 rounded border flex items-center justify-center text-[7px]" style={{ borderColor: isSelected ? "var(--accent-cyan)" : "var(--border)" }}>
                  {isSelected ? "✓" : ""}
                </div>
                <span className="truncate flex-1">{s.name?.slice(0, 30) || "Untitled"}</span>
                <span className="text-[8px] font-mono" style={{color:"var(--text-muted)"}}>{fmt(s.totalTokens)}</span>
              </button>
            );
          })}
        </div>
        {compareSessions.length === 2 && (
          <div className="mt-2 p-2 rounded border" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <div className="grid grid-cols-3 gap-1 text-[8px]">
              <span style={{color:"var(--text-muted)"}}>Metric</span>
              <span className="font-semibold text-center" style={{color:"var(--accent-cyan)"}}>{(compareSessions[0] as any).name?.slice(0,12)}</span>
              <span className="font-semibold text-center" style={{color:"var(--accent-purple)"}}>{(compareSessions[1] as any).name?.slice(0,12)}</span>
              
              {[["Tokens", "totalTokens", fmt], ["Turns", "turnCount", (v:any)=>String(v)], ["Tools", "toolCallCount", (v:any)=>String(v)], ["Category", "category", (v:any)=>v||"-"], ["Efficiency", "efficiencyScore", (v:any)=>v+"%"]].map(([label, key, f]: any) => (
                <React.Fragment key={key}>
                  <span style={{color:"var(--text-muted)"}}>{label}</span>
                  <span className="font-mono text-center" style={{color:"var(--text-secondary)"}}>{f((compareSessions[0] as any)[key])}</span>
                  <span className="font-mono text-center" style={{color:"var(--text-secondary)"}}>{f((compareSessions[1] as any)[key])}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Category Legend */}
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>Category Legend</div>
        <div className="grid grid-cols-2 gap-1 text-[8px]">
          <div className="flex items-center gap-1"><CategoryDot category="chat-heavy" /><span style={{color:"var(--text-muted)"}}>Chat Heavy</span></div>
          <div className="flex items-center gap-1"><CategoryDot category="tool-heavy" /><span style={{color:"var(--text-muted)"}}>Tool Heavy</span></div>
          <div className="flex items-center gap-1"><CategoryDot category="efficient" /><span style={{color:"var(--text-muted)"}}>Efficient</span></div>
          <div className="flex items-center gap-1"><CategoryDot category="wasteful" /><span style={{color:"var(--text-muted)"}}>Wasteful</span></div>
          <div className="flex items-center gap-1"><CategoryDot category="balanced" /><span style={{color:"var(--text-muted)"}}>Balanced</span></div>
        </div>
      </div>

      {/* Top Flagged Sessions */}
      {topAnomalies.length > 0 && (
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>Top Flagged</div>
          <div className="space-y-1">
            {topAnomalies.map((s) => (
              <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "var(--bg-card)" }}>
                <AlertTriangle size={10} className="text-red-400 shrink-0" />
                <span className="text-[9px] truncate flex-1" style={{ color: "var(--text-secondary)" }}>{s.name?.slice(0, 40) || "Untitled"}</span>
                <span className="text-[8px] font-mono shrink-0" style={{ color: "var(--text-muted)" }}>{fmt(s.totalTokens)}</span>
                <span className="text-[7px] shrink-0" style={{ color: "var(--accent-red)" }}>
                  {s.anomalies?.map((a) => a[0]?.toUpperCase()).join("")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EffMini({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  const color = !invert
    ? value >= 70 ? "var(--accent-green)" : value >= 40 ? "var(--accent-amber)" : "var(--accent-red)"
    : value >= 70 ? "var(--accent-green)" : value >= 40 ? "var(--accent-amber)" : "var(--accent-red)";
  return (
    <div className="flex items-center justify-between px-2 py-1 rounded" style={{ background: "var(--bg-card)" }}>
      <span className="text-[8px]" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-[9px] font-mono font-semibold" style={{ color }}>{value}%</span>
    </div>
  );
}

function CategoryDot({ category }: { category: string }) {
  const colors: Record<string, string> = {
    "chat-heavy": "#22d3ee", "tool-heavy": "#a78bfa", "efficient": "#10b981",
    "wasteful": "#ef4444", "balanced": "#f59e0b",
  };
  return <div className="w-2 h-2 rounded-full" style={{ background: colors[category] || "#6b7280" }} />;
}

function fmtCategory(cat: string): string {
  const m: Record<string, string> = {
    "chat-heavy": "Chat Heavy", "tool-heavy": "Tool Heavy",
    "efficient": "Efficient", "wasteful": "Wasteful", "balanced": "Balanced",
  };
  return m[cat] || cat;
}

function MiniStat({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center p-2 rounded" style={{ background: "var(--bg-card)" }}>
      <div className="flex items-center gap-1 mb-0.5">{icon}<span className="text-[7px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</span></div>
      <div className="text-xs font-bold font-mono" style={{ color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function AnomalyIcon({ type }: { type: string }) {
  switch (type) {
    case "high-tokens": return <Zap size={9} className="text-red-400" />;
    case "many-tools": return <Wrench size={9} className="text-amber-400" />;
    case "long-session": return <Clock size={9} className="text-purple-400" />;
    case "context-pressure": return <AlertTriangle size={9} className="text-orange-400" />;
    default: return <AlertTriangle size={9} className="text-red-400" />;
  }
}

function fmtAnomaly(type: string): string {
  switch (type) {
    case "high-tokens": return "High Token Usage";
    case "many-tools": return "Excessive Tool Calls";
    case "long-session": return "Long Session";
    case "context-pressure": return "Context Pressure";
    default: return type;
  }
}
