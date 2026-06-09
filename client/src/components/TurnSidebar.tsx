import type { Turn } from '../../../shared/types';
import { MessageCircle, Zap, Wrench, Clock, Loader2, XCircle } from "lucide-react";

const fmt = (n) => { if (!n && n !== 0) return "0"; if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"; if (n < 1000) return String(Math.round(n)); return String(n); };
function fmtDur(sec) { if (sec == null) return ""; if (sec < 60) return sec + "s"; const m = Math.floor(sec / 60); return m + "m" + (sec % 60 > 0 ? " " + (sec % 60) + "s" : ""); }

const isDark = () => document.documentElement.className !== "light";

export default function TurnSidebar({ turns, selectedTurnN, onSelect }: { turns: Turn[]; selectedTurnN: number | null; onSelect: (n: number) => void }) {
  return (
    <div className="flex flex-col h-full glass border-r" style={{ borderColor: "var(--border)" }}>
      <div className="shrink-0 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <MessageCircle size={13} style={{color:"var(--accent-cyan)"}} />
          <span className="text-[11px] font-semibold tracking-wide" style={{ color: "var(--text-primary)" }}>Turns</span>
          <span className="text-[10px] font-mono ml-auto" style={{ color: "var(--text-muted)" }}>{turns.length}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {turns.length === 0 ? (
          <div className="text-[10px] text-center py-8" style={{ color: "var(--text-muted)" }}>
            <Loader2 size={14} className="animate-spin mx-auto mb-2" style={{color:"var(--accent-cyan)", opacity:0.4}} />Waiting...
          </div>
        ) : [...turns].reverse().map((turn) => {
          const tok = turn.tokens || {};
          const total = (tok.in || 0) + (tok.cache || 0) + (tok.out || 0) + (tok.reason || 0);
          const isActive = turn.n === selectedTurnN;
          const isDone = turn.done || turn.taskDone || !!turn.finishedAt;
          const isAborted = turn.aborted;
          const peakCtx = turn.peakTokens || ((tok.in || 0) + (tok.cache || 0));
          const ctxPct = turn.ctxWindow > 0 ? Math.round((peakCtx / turn.ctxWindow) * 100) : 0;
          let userPreview = turn.userMsg || "";
          if (!userPreview && turn.goalObjective) userPreview = "[Goal] " + turn.goalObjective.slice(0, 80);
          if (!userPreview && turn.agentSummary) userPreview = turn.agentSummary.slice(0, 80);
          if (!userPreview && isAborted) userPreview = "(interrupted)";
          if (!userPreview && isDone && turn.reasoning) userPreview = "(thinking only)";
          if (!userPreview && isDone) userPreview = "(completed)";
          if (!userPreview) userPreview = "processing\u2026";

          return (
            <button key={turn.n} onClick={() => onSelect(turn.n)}
              className="w-full text-left px-3 py-2.5 rounded-lg border transition-all duration-200"
              style={{
                borderColor: isActive ? "var(--accent-cyan)" : isAborted ? "rgba(255,94,94,0.2)" : "var(--border)",
                background: isActive ? "var(--bg-hover)" : isAborted ? "rgba(255,94,94,0.04)" : "var(--bg-card)",
                boxShadow: isActive ? "0 0 20px rgba(0,212,255,0.10)" : "none",
                opacity: isAborted ? 0.7 : 1,
              }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold" style={{
                    color: isActive ? "var(--accent-cyan)" : isAborted ? "var(--accent-red)" : "var(--text-secondary)"
                  }}>#{turn.n}</span>
                  {turn.compacted && (
                    <span className="text-[8px] px-1 py-0.5 rounded border" style={{background:"rgba(251,191,36,0.1)", color:"var(--accent-amber)", borderColor:"rgba(251,191,36,0.2)"}}>
                      {"\u26A0"}{turn.compactRestarts || 1}x
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {turn.duration != null && <span className="text-[8px]" style={{ color: "var(--text-muted)" }}>{fmtDur(turn.duration)}</span>}
                  {isAborted ? (
                    <XCircle size={11} style={{color:"var(--accent-red)"}} />
                  ) : isDone ? (
                    <div className="w-1.5 h-1.5 rounded-full" style={{background:"var(--accent-green)", opacity:0.7}} title="Done" />
                  ) : turn.compacted ? (
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background:"var(--accent-amber)"}} />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background:"var(--accent-cyan)"}} />
                  )}
                </div>
              </div>
              <p className="text-[10px] leading-relaxed mb-1.5 line-clamp-2" style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}>
                {userPreview}
              </p>
              <div className="flex flex-col gap-1 text-[9px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span style={{display:"flex",alignItems:"center",gap:"3px",color:"var(--text-muted)"}}><span style={{color:"var(--accent-cyan)",fontSize:"8px"}}>in</span><span className="font-mono text-[9px]">{fmt(tok.in||0)}</span></span>
                  <span style={{display:"flex",alignItems:"center",gap:"3px",color:"var(--text-muted)"}}><span style={{color:"var(--accent-amber)",fontSize:"8px"}}>ctx</span><span className="font-mono text-[9px]">{fmt(tok.cache||0)}</span></span>
                  <span style={{display:"flex",alignItems:"center",gap:"3px",color:"var(--text-muted)"}}><span style={{color:"var(--accent-green)",fontSize:"8px"}}>out</span><span className="font-mono text-[9px]">{fmt(tok.out||0)}</span></span>
                  <span className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                    <Wrench size={9} style={{color:"var(--accent-purple)", opacity:0.6}} />
                    <span className="font-mono">{turn.tc || 0}</span>
                  </span>
                  {ctxPct > 0 && (
                    <span className="font-mono text-[8px]" style={{ color: ctxPct > 80 ? "var(--accent-red)" : ctxPct > 40 ? "var(--accent-amber)" : "var(--accent-green)" }}>
                      ctx{ctxPct}%
                    </span>
                  )}
                  {(turn.wastedTokens || 0) > 0 && (
                    <span className="flex items-center gap-0.5" style={{ color: "rgba(255,94,94,0.7)" }} title="Wasted tokens">
                      <Zap size={8} style={{color:"rgba(255,94,94,0.5)"}} />
                      <span className="font-mono text-[8px]">{fmt(turn.wastedTokens || 0)}</span>
                    </span>
                  )}
                  {turn.turnEfficiency && turn.turnEfficiency.overall > 0 && (
                    <span className="px-1 rounded text-[7px] font-mono" title={"Efficiency: " + turn.turnEfficiency.overall + "%"} style={{
                      background: turn.turnEfficiency.overall >= 70 ? "rgba(16,185,129,0.1)" : turn.turnEfficiency.overall >= 40 ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                      color: turn.turnEfficiency.overall >= 70 ? "var(--accent-green)" : turn.turnEfficiency.overall >= 40 ? "var(--accent-amber)" : "var(--accent-red)",
                    }}>
                      eff{turn.turnEfficiency.overall}%
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}