import React, { useState, useEffect } from "react";
import { useAgentScope } from "./hooks/useAgentScope";
import SessionFilter from "./components/SessionFilter";
import SessionBar from "./components/SessionBar";
import TurnSidebar from "./components/TurnSidebar";
import TurnDetail from "./components/TurnDetail";
import { lazy, Suspense } from "react";
const ShareCard = lazy(() => import("./components/ShareCard"));
import { Radio, Sun, Moon, Zap, Calendar, Activity, Flame, BarChart3, AlertTriangle, TrendingUp, MessageCircle, Cpu, HelpCircle, X, ShieldCheck, ChevronRight, Share2 } from "lucide-react";

const fmt = (n: number) => {
  if (!n && n !== 0) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  if (n < 1000) return String(Math.round(n));
  return String(n);
};

const App: React.FC = () => {
  const {
    connected, sessions, currentSessionId, loadSession, loading,
    sessionMeta, turns, selectedTurnN, setSelectedTurnN, selectedTurn, selectedTurnTools,
    planSteps, planProgress, stats, activeView, setActiveView, allToolCalls,
  } = useAgentScope();

  const [filteredSessions, setFilteredSessions] = useState<any>(null); const [showWizard, setShowWizard] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("mindrift-theme") || "dark");
  const displaySessions = filteredSessions || sessions;

  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem("mindrift-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const todayTok = stats?.today?.tokens || 0;
  const monthTok = stats?.month?.tokens || 0;
  const todaySes = stats?.today?.sessions || 0;
  const allSes = stats?.all?.sessions || 0;
  const allTurns = stats?.all?.turns || 0;
  const anomalies = stats?.anomalies || 0;
  const currentSession = sessions.find((s: any) => s.id === currentSessionId) || null;
  const efficiency = stats?.efficiency || 0;
  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "var(--bg-deep)", color: "var(--text-primary)" }}>
      <div className="absolute inset-0 pointer-events-none opacity-[0.012]" style={{ backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)", backgroundSize: "20px 20px" }} />

      {/* ====== STATS BAR — absolutely at the top, full width ====== */}
      <div className="shrink-0 flex items-center justify-between px-5 py-1.5 border-b text-[9px] relative z-20 backdrop-blur-xl"
        style={{ borderColor: "var(--border)", background: "var(--header-bg)" }}>
        {/* Left: logo + name */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Radio size={12} className="text-white" />
          </div>
          <span className="text-[11px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Mindrift</span>
          <span className="text-[8px] px-1.5 py-0.5 rounded-full" style={{ color: "var(--text-muted)", background: "var(--badge-bg)" }}>
            {sessionMeta?.model || "ai observatory"}
          </span>
        </div>

        {/* Center: 5 stat pills */}
        <div className="flex items-center gap-3">
          <StatPill icon={<Zap size={10} className="text-cyan-400" />} label="Today" value={fmt(todayTok)} unit="tokens" />
          <StatPill icon={<Calendar size={10} className="text-purple-400" />} label="Month" value={fmt(monthTok)} unit="tokens" />
          <StatPill icon={<Activity size={10} className="text-emerald-400" />} label="Today" value={String(todaySes)} unit="sessions" />
          <StatPill icon={<BarChart3 size={10} style={{color:"var(--text-muted)"}} />} label="Total" value={String(allSes)} unit="sessions" />
          {anomalies > 0 && <StatPill icon={<Flame size={10} className="text-red-400" />} label="Alerts" value={String(anomalies)} unit="" alert />}
        </div>

        {/* Right: theme toggle + live status */}
        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} className="p-1.5 rounded-md hover:bg-white/10 transition-colors" title={theme === "dark" ? "Switch to light" : "Switch to dark"}>
            {theme === "dark" ? <Sun size={13} className="text-amber-400" /> : <Moon size={13} className="text-indigo-500" />}
          </button>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[8px] font-mono transition-colors ${
            connected ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/5" : "text-red-400 border-red-400/20 bg-red-400/5"
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
            {connected ? "LIVE" : "OFF"}
          </div>
          <button
            onClick={() => setShowWizard(!showWizard)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all duration-200 hover:scale-105 cursor-pointer"
            style={{ borderColor: "var(--border)", background: showWizard ? "var(--bg-hover)" : "var(--bg-card)" }}
            title="Setup & Help"
          >
            <UserCircle size={15} style={{ color: showWizard ? "var(--accent-cyan)" : "var(--text-muted)" }} />
            <span className="text-[10px] font-medium" style={{ color: "var(--text-secondary)" }}>Setup</span>
          </button>

        </div>
      </div>

      {/* Anomaly banner */}
      {anomalies > 0 && (
        <div className="shrink-0 px-4 py-1 bg-red-500/[0.04] border-b border-red-500/10 flex items-center gap-2 text-[9px]">
          <Flame size={10} className="text-red-400 shrink-0" />
          <span style={{color:"var(--text-secondary)"}}>{anomalies} sessions flagged</span>
          <span style={{color:"var(--text-muted)"}}>— high tokens, many tools, or context pressure detected</span>
        </div>
      )}

      <SessionFilter sessions={sessions} onFiltered={setFilteredSessions} />
      <SessionBar sessions={displaySessions} currentSessionId={currentSessionId} onSelect={loadSession} loading={loading} />

      <div className="flex-1 flex min-h-0 relative z-10">
        <div className="w-[220px] shrink-0">
          <TurnSidebar turns={turns} selectedTurnN={selectedTurnN} onSelect={setSelectedTurnN} />
        </div>
        <TurnDetail
          turn={selectedTurn} planSteps={planSteps} planProgress={planProgress} turnTools={selectedTurnTools} sessions={sessions}
          activeView={activeView} setActiveView={setActiveView} sessionMeta={sessionMeta}
          turns={turns} selectedTurnN={selectedTurnN} setSelectedTurnN={setSelectedTurnN}
          allToolCalls={allToolCalls}
        />
      </div>{showWizard && (
        <div className="fixed top-10 right-4 w-72 rounded-xl border shadow-2xl z-50 p-4" style={{background:"var(--bg-surface)",borderColor:"var(--border-strong)",boxShadow:"0 8px 32px rgba(0,0,0,0.4)"}}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold" style={{color:"var(--text-primary)"}}>Setup & Help</span>
            <button onClick={() => setShowWizard(false)} className="text-[10px] hover:underline" style={{color:"var(--text-muted)"}}>Esc</button>
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <CheckCircle size={14} className="text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-[10px] font-semibold" style={{color:"var(--text-primary)"}}>Zero Setup Required</div>
                <div className="text-[8px] mt-0.5" style={{color:"var(--text-muted)"}}>Mindrift reads Codex session logs automatically. No API keys or config files needed.</div>
              </div>
            </div>
            <div className="border-t" style={{borderColor:"var(--border)"}} />
            <div>
              <div className="text-[9px] font-semibold mb-1.5" style={{color:"var(--text-secondary)"}}>Quick Links</div>
              <a href="https://github.com" target="_blank" className="flex items-center gap-1.5 text-[9px] hover:underline" style={{color:"var(--accent-cyan)"}}>
                <ExternalLink size={10} />View on GitHub
              </a>
              <div className="text-[9px] mt-1.5 flex items-center gap-1.5" style={{color:"var(--text-muted)"}}>
                <Settings size={10} />Session path: <code style={{fontSize:"8px",color:"var(--text-secondary)"}}>~/.codex/sessions/</code>
              </div>
            </div>
            <div className="border-t" style={{borderColor:"var(--border)"}} />
            <div>
              <div className="text-[9px] font-semibold mb-1" style={{color:"var(--text-secondary)"}}>How It Works</div>
              <ol className="text-[8px] space-y-0.5" style={{color:"var(--text-muted)"}}>
                <li>1. Codex writes session logs locally</li>
                <li>2. Mindrift watches for new files</li>
                <li>3. Dashboard updates in real-time</li>
              </ol>
              <div className="flex items-center gap-1.5 mt-1.5 text-[8px] px-2 py-1 rounded" style={{background:"rgba(0,212,255,0.08)",color:"var(--accent-cyan)",border:"1px solid rgba(0,212,255,0.15)"}}>
                <HelpCircle size={10} />100% local · 0 instrumentation · No telemetry
              </div>
            </div>
          </div>
        </div>
      )}
<footer className="shrink-0 flex items-center justify-between px-4 py-1 border-t text-[8px] font-mono relative z-10 backdrop-blur-xl"
        style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--bg-deep)" }}>
        <span>{allSes} sessions · {allTurns} turns · {fmt(sessions.reduce((s, x) => s + (x.totalTokens || 0), 0))} total tokens</span>
        <span>{connected ? "ws connected" : "ws disconnected"}</span>
      </footer>
      {showShare && <Suspense fallback={null}><ShareCard session={currentSession || sessions[0]} turns={turns} stats={stats} onClose={() => setShowShare(false)} /></Suspense>}
    </div>
  );
}

function StatPill({ icon, label, value, unit, alert }: { icon: React.ReactNode; label: string; value: string; unit: string; alert?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: "var(--bg-card)" }}>
      {icon}
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className={`font-bold font-mono ${alert ? "text-red-400" : ""}`} style={!alert ? { color: "var(--text-primary)" } : {}}>{value}</span>
      {unit && <span style={{ color: "var(--text-dim)" }}>{unit}</span>}
    </div>
  );
}


export default App;