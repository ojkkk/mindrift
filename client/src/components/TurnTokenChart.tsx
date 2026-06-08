import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Zap, TrendingUp } from "lucide-react";

const fmt = (n: number) => { if (!n && n !== 0) return "0"; if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"; return String(Math.round(n)); };

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass px-3 py-2 rounded-lg border text-[9px]" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
      <div className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Turn #{d.n}</div>
      {d.userMsg && <div className="mb-1 max-w-[180px] truncate" style={{ color: "var(--text-secondary)" }}>{d.userMsg.slice(0, 60)}</div>}
      <div className="space-y-0.5">
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-cyan-400" /><span style={{ color: "var(--text-muted)" }}>In: {fmt(d.inTokens)}</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-emerald-400" /><span style={{ color: "var(--text-muted)" }}>Out: {fmt(d.outTokens)}</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-purple-400" /><span style={{ color: "var(--text-muted)" }}>Reason: {fmt(d.reasonTokens)}</span></div>
      </div>
      <div className="mt-1 font-mono" style={{ color: "var(--accent-cyan)" }}>Total: {fmt(d.total)}</div>
    </div>
  );
};

export default function TurnTokenChart({ turns, selectedTurnN, onSelectTurn }: { turns: any[]; selectedTurnN: number | null; onSelectTurn: (n: number) => void }) {
  const chartData = useMemo(() => {
    return turns
      .map((t) => {
        const tok = t.tokens || {};
        return {
          n: t.n,
          total: (tok.in || 0) + (tok.out || 0) + (tok.reason || 0),
          inTokens: tok.in || 0,
          outTokens: tok.out || 0,
          reasonTokens: tok.reason || 0,
          userMsg: t.userMsg || "",
          tc: t.tc || 0,
          done: t.done || t.taskDone || !!t.finishedAt,
        };
      })
      .filter((t) => t.total > 0);
  }, [turns]);

  if (chartData.length === 0) {
    return <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}><div className="text-center text-[10px]">No token data yet</div></div>;
  }

  const totalAll = chartData.reduce((s, t) => s + t.total, 0);
  const top3 = [...chartData].sort((a, b) => b.total - a.total).slice(0, 3);

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      <div className="flex items-center gap-3 text-[9px] px-1 flex-wrap">
        <span style={{ color: "var(--text-muted)" }}>
          <span className="font-mono" style={{ color: "var(--text-primary)" }}>{chartData.length}</span> turns
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          <Zap size={9} className="inline text-cyan-500/60 mr-0.5" />
          <span className="font-mono" style={{ color: "var(--text-primary)" }}>{fmt(totalAll)}</span> total
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          <TrendingUp size={9} className="inline text-amber-400/60 mr-0.5" />
          Top: <span className="font-mono" style={{ color: "var(--text-primary)" }}>#{top3[0]?.n}</span> ({fmt(top3[0]?.total || 0)})
        </span>
      </div>

      {/* Bar Chart */}
      <div className="h-[300px]">
        <ResponsiveContainer>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
            onClick={(e: any) => { if (e?.activePayload?.[0]?.payload?.n) onSelectTurn(e.activePayload[0].payload.n); }}>
            <XAxis dataKey="n" tick={{ fontSize: 8, fill: "var(--text-muted)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
            <YAxis tick={{ fontSize: 8, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={fmt} width={40} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--bg-hover)" }} />
            <Bar dataKey="inTokens" stackId="a" radius={[0, 0, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.n === selectedTurnN ? "#22d3ee" : "rgba(34,211,238,0.4)"} />
              ))}
            </Bar>
            <Bar dataKey="reasonTokens" stackId="a" radius={[0, 0, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.n === selectedTurnN ? "#a78bfa" : "rgba(167,139,250,0.4)"} />
              ))}
            </Bar>
            <Bar dataKey="outTokens" stackId="a" radius={[2, 2, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.n === selectedTurnN ? "#34d399" : "rgba(52,211,153,0.4)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 px-2 text-[8px]" style={{ color: "var(--text-dim)" }}>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-cyan-400/60" /><span>Input</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-purple-400/60" /><span>Reasoning</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-emerald-400/60" /><span>Output</span></div>
        <span className="ml-auto">Click bar to jump</span>
      </div>
    </div>
  );
}
