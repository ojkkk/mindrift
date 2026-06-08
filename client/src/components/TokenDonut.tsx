import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const fmtNum = (n: number) => { if (!n && n !== 0) return "0"; if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"; return String(Math.round(n)); };

const COLORS = {
  input: "#22d3ee",
  output: "#34d399",
  reason: "#a78bfa",
  cache: "#6366f1",
};

export default function TokenDonut({ tokens, total }: { tokens: { in: number; out: number; reason: number }; total: number }) {
  const data = [
    { name: "Input", value: tokens.in || 0, color: COLORS.input },
    { name: "Output", value: tokens.out || 0, color: COLORS.output },
    { name: "Reasoning", value: tokens.reason || 0, color: COLORS.reason },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return <div className="p-3 text-[9px] text-center" style={{ color: "var(--text-muted)" }}>No token data</div>;
  }

  return (
    <div className="p-2 flex flex-col items-center">
      <div className="w-[120px] h-[120px]">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={32}
              outerRadius={50}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs font-bold font-mono mt-1" style={{ color: "var(--text-primary)" }}>
        {fmtNum(total)}
      </div>
      <div className="text-[8px]" style={{ color: "var(--text-muted)" }}>total tokens</div>
      <div className="flex gap-3 mt-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1 text-[8px]">
            <div className="w-2 h-2 rounded-sm" style={{ background: d.color }} />
            <span style={{ color: "var(--text-secondary)" }}>{d.name}</span>
            <span className="font-mono" style={{ color: "var(--text-muted)" }}>{fmtNum(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
