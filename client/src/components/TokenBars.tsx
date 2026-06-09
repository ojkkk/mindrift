import { useMemo } from "react";

const fmtNum = (n: number) => { if (!n && n !== 0) return "0"; if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"; if (n < 1000) return String(Math.round(n)); return String(n); };

const COLORS = {
  input: "#22d3ee",
  cache: "#6366f1",
  output: "#34d399",
  reason: "#a78bfa",
};

interface TokenBarsProps {
  tokens: { in: number; out: number; reason: number; cache?: number };
  total: number;
}

export default function TokenBars({ tokens, total }: TokenBarsProps) {
  const items = useMemo(() => {
    const raw = [
      { label: "Input", value: tokens.in || 0, color: COLORS.input },
      { label: "Cache", value: tokens.cache || 0, color: COLORS.cache },
      { label: "Output", value: tokens.out || 0, color: COLORS.output },
      { label: "Reason", value: tokens.reason || 0, color: COLORS.reason },
    ].filter((d) => d.value > 0);

    if (raw.length === 0) return null;

    const maxVal = Math.max(...raw.map((d) => d.value));
    return raw.map((d) => ({
      ...d,
      pct: total > 0 ? Math.round((d.value / total) * 100) : 0,
      barPct: maxVal > 0 ? (d.value / maxVal) * 100 : 0,
    }));
  }, [tokens, total]);

  if (!items) {
    return <div className="p-3 text-[9px] text-center" style={{ color: "var(--text-muted)" }}>No token data</div>;
  }

  return (
    <div className="p-2 flex flex-col gap-1.5 w-full">
      {items.map((d) => (
        <div key={d.label} className="flex items-center gap-1.5">
          <span className="text-[8px] font-mono w-10 text-right shrink-0" style={{ color: "var(--text-muted)" }}>{d.label}</span>
          <div className="flex-1 h-3 rounded-sm overflow-hidden" style={{ background: "var(--bg-deep)" }}>
            <div
              className="h-full rounded-sm transition-all"
              style={{ width: `${Math.max(d.barPct, 2)}%`, background: d.color, opacity: 0.85 }}
            />
          </div>
          <span className="text-[8px] font-mono w-10 shrink-0 text-right" style={{ color: "var(--text-primary)" }}>{fmtNum(d.value)}</span>
          <span className="text-[7px] font-mono w-7 shrink-0 text-right" style={{ color: "var(--text-dim)" }}>{d.pct}%</span>
        </div>
      ))}
    </div>
  );
}
