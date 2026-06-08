// @ts-nocheck

import { useMemo } from "react";

const fmtNum = (n) => { if (!n && n !== 0) return "0"; if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"; return String(n); };

export default function TokenDonut({ tokens, total}) {
  const segments = useMemo(() => {
    if (!total || total <= 0) return [];
    const items = [
      { label: "Input", value: tokens.in || 0, pct: ((tokens.in || 0) / total) * 100, color: "#22d3ee" },
      { label: "Reason", value: tokens.reason || 0, pct: ((tokens.reason || 0) / total) * 100, color: "#a78bfa" },
      { label: "Output", value: tokens.out || 0, pct: ((tokens.out || 0) / total) * 100, color: "#fbbf24" },
    ].filter((s) => s.pct > 0);
    const cx = 60, cy = 60, r = 36, strokeW = 14;
    const circumference = 2 * Math.PI * r;
    let offset = 0;
    return items.map((s) => {
      const dashLen = (s.pct / 100) * circumference;
      const seg = { ...s, dashLen, dashOffset: circumference - offset - dashLen, circumference };
      offset += dashLen;
      return seg;
    });
  }, [tokens, total]);

  
  
  // Abbreviate total for center display
  const centerText = total >= 100000 ? (total / 1000).toFixed(0) + "K" : String(total);

  return (
    <div className="flex flex-col items-center p-3">
      <div className="relative w-[120px] h-[120px]">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="36" fill="none" stroke="var(--border)" strokeWidth="14" />
          {segments.map((s, i) => (
            <circle key={i} cx="60" cy="60" r="36" fill="none" stroke={s.color} strokeWidth="14" strokeLinecap="butt"
              strokeDasharray={`${s.dashLen} ${s.circumference - s.dashLen}`} strokeDashoffset={-s.dashOffset}
              style={{ transition: "stroke-dasharray 0.5s ease" }} />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[13px] font-bold font-mono leading-none" style={{ color: "var(--text-primary)" }}>{centerText}</span>
          <span className="text-[7px] mt-0.5" style={{ color: "var(--text-muted)" }}>tokens</span>
          
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-[8px]" style={{ color: "var(--text-muted)" }}>{s.label}</span>
            <span className="text-[8px] font-mono" style={{ color: "var(--text-primary)" }}>{fmtNum(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
