import { useMemo, useCallback } from "react";
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
        <div className="text-[7px] mt-0.5" style={{ color: "var(--accent-cyan)" }}>Click to view session ↓</div>
      </div>
    </div>
  );
};

export default function SessionTrend({ sessions, onSelectSession }: { sessions: SessionInfo[]; onSelectSession?: (id: string) => void }) {
  const chartData = useMemo(() => {
    if (!sessions || sessions.length === 0) return [];
    return [...sessions]
      .filter((s) => s.totalTokens > 0 || s.turnCount > 0)
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
      .slice(-30)
      .map((s, i) => ({
        index: i,
        name: s.name?.slice(0, 24) || `#${i + 1}`,
        fullName: s.name || "Untitled",
        sessionId: s.id,
        tokens: s.totalTokens,
        turns: s.turnCount,
        tools: s.toolCallCount,
        date: new Date(s.startedAt).toLocaleDateString("en", { month: "short", day: "numeric" }),
        source: s.source || "codex",
      }));
  }, [sessions]);

  const handleDotClick = useCallback((data: any) => {
    if (data?.activePayload?.[0]?.payload?.sessionId && onSelectSession) {
      onSelectSession(data.activePayload[0].payload.sessionId);
    }
  }, [onSelectSession]);

  if (chartData.length === 0) {
    return <div className="p-6 text-center text-[10px]" style={{ color: "var(--text-muted)" }}>Not enough session data for trends</div>;
  }

  const sharedProps = (color: string, dataKey: string) => ({
    type: "monotone" as const,
    dataKey,
    stroke: color,
    strokeWidth: 2,
    dot: { r: 3, fill: color, strokeWidth: 0 },
    activeDot: { r: 5, fill: color, stroke: "var(--bg-surface)", strokeWidth: 2, cursor: "pointer" },
  });

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] font-semibold tracking-wide" style={{ color: "var(--text-secondary)" }}>Session Trends (30 most recent)</span>
        <span className="text-[9px] font-mono ml-auto" style={{ color: "var(--text-muted)" }}>{chartData.length} sessions</span>
      </div>

      <div>
        <div className="text-[8px] font-semibold uppercase tracking-wider mb-1 px-1" style={{ color: "var(--accent-cyan)" }}>Token Consumption</div>
        <div className="h-[160px] cursor-pointer">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }} onClick={handleDotClick}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="index" tick={{ fontSize: 8, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 8, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={fmt} width={40} />
              <Tooltip content={<CustomTooltip />} />
              <Line {...sharedProps("#22d3ee", "tokens")} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <div className="text-[8px] font-semibold uppercase tracking-wider mb-1 px-1" style={{ color: "var(--accent-purple)" }}>Turn Count</div>
        <div className="h-[120px] cursor-pointer">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }} onClick={handleDotClick}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="index" tick={{ fontSize: 8, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 8, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<CustomTooltip />} />
              <Line {...sharedProps("#a78bfa", "turns")} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <div className="text-[8px] font-semibold uppercase tracking-wider mb-1 px-1" style={{ color: "var(--accent-amber)" }}>Tool Calls</div>
        <div className="h-[120px] cursor-pointer">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }} onClick={handleDotClick}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="index" tick={{ fontSize: 8, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 8, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<CustomTooltip />} />
              <Line {...sharedProps("#f59e0b", "tools")} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}