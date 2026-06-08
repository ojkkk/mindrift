import { useMemo } from "react";
import { Zap, TrendingUp } from "lucide-react";

const fmt = (n) => { if (!n && n !== 0) return "0"; if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"; if (n < 1000) return String(Math.round(n)); return String(n); };

export default function TurnTokenChart({ turns, selectedTurnN, onSelectTurn }) {
  const ranked = useMemo(() => {
    const list = turns
      .map((t) => { const tok = t.tokens || {}; return { n: t.n, total: (tok.in || 0) + (tok.out || 0) + (tok.reason || 0), inTokens: tok.in || 0, outTokens: tok.out || 0, reasonTokens: tok.reason || 0, userMsg: t.userMsg || "", tc: t.tc || 0, done: t.done || t.taskDone || !!t.finishedAt }; })
      .filter((t) => t.total > 0)
      .sort((a, b) => b.total - a.total);
    const max = list.length > 0 ? list[0].total : 1;
    return { list, max };
  }, [turns]);

  if (ranked.list.length === 0) {
    return <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}><div className="text-center text-[10px]">No token data yet</div></div>;
  }

  const top3 = ranked.list.slice(0, 3);
  const totalAll = ranked.list.reduce((s, t) => s + t.total, 0);

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      <div className="flex items-center gap-3 text-[9px] px-1">
        <span style={{ color: "var(--text-muted)" }}>
          <span className="font-mono" style={{ color: "var(--text-primary)" }}>{ranked.list.length}</span> active turns
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          <Zap size={9} className="inline text-cyan-500/60 mr-0.5" />
          <span className="font-mono" style={{ color: "var(--text-primary)" }}>{fmt(totalAll)}</span> total tokens
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          <TrendingUp size={9} className="inline text-red-400/60 mr-0.5" />
          Top: <span className="font-mono" style={{ color: "var(--text-primary)" }}>#{top3[0]?.n}</span> ({fmt(top3[0]?.total || 0)})
        </span>
      </div>

      <div className="space-y-1">
        {ranked.list.map((t, i) => {
          const pct = (t.total / ranked.max) * 100;
          const isSelected = t.n === selectedTurnN;
          const isTop = i < 3;
          return (
            <button key={t.n} onClick={() => onSelectTurn(t.n)}
              className="w-full text-left group hover:bg-white/[0.02] rounded transition-colors px-2 py-1"
              style={isSelected ? { background: "var(--bg-hover)", boxShadow: "0 0 0 1px rgba(34,211,238,0.2)" } : {}}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[9px] font-mono w-8 shrink-0" style={{ color: isSelected ? "var(--accent-cyan)" : "var(--text-muted)" }}>#{t.n}</span>
                <div className="flex-1 h-2 rounded-full overflow-hidden relative" style={{ background: "var(--border)" }}>
                  <div className="absolute inset-0 flex">
                    {t.inTokens > 0 && <div className="h-full bg-cyan-500/40" style={{ width: `${(t.inTokens / t.total) * pct}%` }} />}
                    {t.reasonTokens > 0 && <div className="h-full bg-purple-500/40" style={{ width: `${(t.reasonTokens / t.total) * pct}%` }} />}
                    {t.outTokens > 0 && <div className="h-full bg-amber-500/40" style={{ width: `${(t.outTokens / t.total) * pct}%` }} />}
                  </div>
                </div>
                <span className="text-[9px] font-mono w-14 text-right shrink-0" style={{ color: "var(--text-secondary)" }}>{fmt(t.total)}</span>
              </div>
              <div className="flex items-center gap-2 pl-10">
                <span className="text-[8px] truncate flex-1" style={{ color: "var(--text-dim)" }}>{t.userMsg?.slice(0, 60) || (t.done ? "(done)" : "processing\u2026")}</span>
                <span className="text-[8px] font-mono shrink-0" style={{ color: "var(--text-muted)" }}>{t.tc} tools</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 px-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-cyan-500/60" /><span className="text-[8px]" style={{ color: "var(--text-dim)" }}>Input</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-purple-500/60" /><span className="text-[8px]" style={{ color: "var(--text-dim)" }}>Reason</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-amber-500/60" /><span className="text-[8px]" style={{ color: "var(--text-dim)" }}>Output</span></div>
        <span className="text-[8px] ml-auto" style={{ color: "var(--text-dim)" }}>Click to jump to turn</span>
      </div>
    </div>
  );
}
