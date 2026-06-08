import { Calendar, MessageCircle, Loader2, Clock, AlertTriangle, Flame } from "lucide-react";

const fmt = (n) => { if (!n && n !== 0) return "0"; if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"; if (n < 1000) return String(Math.round(n)); return String(n); };
function fmtDate(ts) { if (!ts) return ""; const d = new Date(ts); const now = new Date(); const diff = Number(now) - Number(d); if (diff < 60000) return "now"; if (diff < 3600000) return Math.round(diff / 60000) + "m"; if (diff < 86400000) return Math.round(diff / 3600000) + "h"; if (diff < 604800000) return Math.round(diff / 86400000) + "d"; return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" }); }
function fmtDur(sec) { if (sec == null) return ""; if (sec < 60) return sec + "s"; const m = Math.floor(sec / 60); if (m < 60) return m + "m"; return Math.floor(m / 60) + "h"; }

const ANOMALY_LABELS = { "high-tokens": "Tokens", "many-tools": "Tools", "long-session": "Long", "context-pressure": "Ctx", "tool-errors": "Errors" };

export default function SessionBar({ sessions, currentSessionId, onSelect, loading }) {
  return (
    <div className="shrink-0 border-b" style={{ borderColor: "var(--border)", background: "var(--bg-deep)" }}>
      <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto" style={{ maxHeight: "64px" }}>
        {sessions.length === 0 ? (
          <div className="text-[9px] py-1 px-2" style={{ color: "var(--text-muted)" }}>No sessions</div>
        ) : sessions.slice(0, 50).map((s) => {
          const isActive = s.id === currentSessionId || (currentSessionId && s.id && s.id.startsWith(currentSessionId));
          const name = s.name || s.id?.slice(0, 8) || "?";
          const hasAnomalies = s.anomalies && s.anomalies.length > 0;
          return (
            <button key={s.id} onClick={() => onSelect(s.id)} disabled={loading}
              className="shrink-0 w-[155px] flex flex-col justify-between px-2.5 py-2 rounded-lg border transition-all relative"
              style={{
                borderColor: isActive ? "var(--accent-cyan)" : hasAnomalies ? "rgba(255,94,94,0.25)" : "var(--border)",
                background: isActive ? "var(--bg-hover)" : "var(--bg-card)",
                boxShadow: isActive ? "0 0 16px rgba(0,212,255,0.10)" : "none",
                height: "58px",
              }}>
              {hasAnomalies && (
                <div className="absolute -top-1 -right-1" title={s.anomalies.map((a) => ANOMALY_LABELS[a] || a).join(", ")}>
                  <Flame size={10} style={{color:"var(--accent-red)"}} />
                </div>
              )}
              <div className="flex items-start gap-1 min-h-[20px]">
                {loading && isActive ? <Loader2 size={9} className="animate-spin shrink-0 mt-0.5" style={{color:"var(--accent-cyan)"}} />
                  : <MessageCircle size={9} className="shrink-0 mt-0.5" style={{ color: isActive ? "var(--accent-cyan)" : "var(--text-muted)" }} />}
                <span className="text-[9px] leading-tight line-clamp-1 text-left break-all" style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  {name}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[7px]" style={{ color: "var(--text-muted)" }}>
                <span className="flex items-center gap-0.5"><Calendar size={7} />{fmtDate(s.startedAt)}</span>
                <span className="ml-auto">{s.turnCount}t</span>
                {s.totalTokens > 0 && <span>{fmt(s.totalTokens)}</span>}
                {s.toolCallCount > 0 && <span style={{color:"var(--text-dim)"}}>{s.toolCallCount} tools</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
