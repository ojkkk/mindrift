import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { SessionInfo } from "../../../shared/types";

const fmt = (n: number) => { if (!n && n !== 0) return "0"; if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"; return String(Math.round(n)); };

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass px-3 py-2 rounded-lg border text-[9px]" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
      <div className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{d.fullName || label}</div>
      <div className="space-y-0.5">
        {d.tokens != null && <div style={{ color: "var(--text-muted)" }}>Tokens: <span className="font-mono" style={{ color: "var(--accent-cyan)" }}>{fmt(d.tokens)}</span></div>}
        {d.turns != null && <div style={{ color: "var(--text-muted)" }}>Turns: <span className="font-mono" style={{ color: "var(--accent-purple)" }}>{d.turns}</span></div>}
        {d.tools != null && <div style={{ color: "var(--text-muted)" }}>Tools: <span className="font-mono" style={{ color: "var(--accent-amber)" }}>{d.tools}</span></div>}
      </div>
    </div>
  );
};

export default function SessionTrend({ sessions }: { sessions: SessionInfo[] }) {
  const chartData = useMemo(() => {
    if (!sessions || sessions.length === 0) return [];
    return [...sessions]
      .filter((s) => s.totalTokens > 0)
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
      .slice(-30) // Last 30 sessions
      .map((s, i) => ({
        index: i,
        name: s.name?.slice(0, 20) || `#${i + 1}`,
        fullName: s.name || "Untitled",
        tokens: s.totalTokens,
        turns: s.turnCount,
        tools: s.toolCallCount,
        date: new Date(s.startedAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }),
        source: s.source || "codex",
      }));
  }, [sessions]);

  if (chartData.length === 0) {
    return <div className="p-6 text-center text-[10px]" style={{ color: "var(--text-muted)" }}>Not enough session data for trends</div>;
  }

  return (
    <div className="p-3 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] font-semibold tracking-wide" style={{ color: "var(--text-secondary)" }}>Session Trends (30 most recent)</span>
        <span className="text-[9px] font-mono ml-auto" style={{ color: "var(--text-muted)" }}>{chartData.length} sessions</span>
      </div>

      {/* Token Trend */}
      <div>
        <div className="text-[8px] font-semibold uppercase tracking-wider mb-1 px-1" style={{ color: "var(--accent-cyan)" }}>Token Consumption</div>
        <div className="h-[160px]">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 8, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 8, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={fmt} width={40} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="tokens" stroke="#22d3ee" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: "#22d3ee" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Turns Trend */}
      <div>
        <div className="text-[8px] font-semibold uppercase tracking-wider mb-1 px-1" style={{ color: "var(--accent-purple)" }}>Turn Count</div>
        <div className="h-[120px]">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 8, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 8, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="turns" stroke="#a78bfa" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: "#a78bfa" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tools Trend */}
      <div>
        <div className="text-[8px] font-semibold uppercase tracking-wider mb-1 px-1" style={{ color: "var(--accent-amber)" }}>Tool Calls</div>
        <div className="h-[120px]">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 8, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 8, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="tools" stroke="#f59e0b" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: "#f59e0b" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
