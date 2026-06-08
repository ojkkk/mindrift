import { useMemo } from "react";
import { AlertTriangle, Zap, Wrench, Clock, TrendingUp } from "lucide-react";
import type { SessionInfo } from "../../../shared/types";

const fmt = (n: number) => { if (!n && n !== 0) return "0"; if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"; return String(Math.round(n)); };

export default function AnomalyInsights({ sessions }: { sessions: SessionInfo[] }) {
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
