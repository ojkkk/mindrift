import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const fmtNum = (n: number) => { if (!n && n !== 0) return "0"; if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"; if (n < 1000) return String(Math.round(n)); return String(n); };

const COLORS = {
  input: "#22d3ee",
  cache: "#6366f1",
  output: "#34d399",
  reason: "#a78bfa",
};

export default function TokenDonut({ tokens, total }: { tokens: { in: number; out: number; reason: number; cache?: number }; total: number }) {
  const data = [
    { name: "Input", value: tokens.in || 0, color: COLORS.input },
    { name: "Cache", value: tokens.cache || 0, color: COLORS.cache },
    { name: "Output", value: tokens.out || 0, color: COLORS.output },
    { name: "Reason", value: tokens.reason || 0, color: COLORS.reason },
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
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1.5 justify-center">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ background: d.color }} />
            <span className="text-[8px] font-mono" style={{ color: "var(--text-secondary)" }}>
              {d.name} {fmtNum(d.value)}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1 ml-1">
          <span className="text-[8px] font-semibold font-mono" style={{ color: "var(--text-primary)" }}>
            {fmtNum(total)}
          </span>
        </div>
      </div>
    </div>
  );
}
