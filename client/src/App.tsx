import React, { useState, useEffect, useMemo, Suspense, lazy } from "react";
import { useAgentScope } from "./hooks/useAgentScope";
import SessionFilter from "./components/SessionFilter";
import SessionBar from "./components/SessionBar";
import TurnSidebar from "./components/TurnSidebar";
import TurnDetail from "./components/TurnDetail";
const ShareCard = lazy(() => import("./components/ShareCard"));
import { Radio, Sun, Moon, Zap, Calendar, Activity, Flame, BarChart3, AlertTriangle, TrendingUp, MessageCircle, Cpu, HelpCircle, X, ShieldCheck, ChevronRight, Share2, DollarSign, Download, Bell, UserCircle, CheckCircle, ExternalLink, Settings } from "lucide-react";

const fmt = (n: number) => {
  if (!n && n !== 0) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  if (n < 1000) return String(Math.round(n));
  return String(n);
};

const formatCost = (cost: number) => {
  if (cost < 0.01) return "<$0.01";
  if (cost < 1) return "$" + cost.toFixed(2);
  return "$" + Math.round(cost);
};

const saveConfig = async () => {
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costModel: setupModel, platform: activePlatform }),
      });
      if (res.ok) {
        setTimeout(() => window.location.reload(), 500);
      }
    } catch (e) {
      console.error("Save config failed:", e);
    }
  };

const App: React.FC = () => {
  const {
    connected, sessions, currentSessionId, loadSession, loading,
    sessionMeta, turns, selectedTurnN, setSelectedTurnN, selectedTurn, selectedTurnTools,
    planSteps, planProgress, stats, activeView, setActiveView, allToolCalls, alerts, clearSession,
  } = useAgentScope();

  useEffect(() => { (window as any).__loadSession = loadSession; return () => { delete (window as any).__loadSession; }; }, [loadSession]);

  const [filteredSessions, setFilteredSessions] = useState<any>(null); const [showWizard, setShowWizard] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [setupModel, setSetupModel] = useState("custom");
  const [activePlatform, setActivePlatform] = useState<string>(() => localStorage.getItem("mindrift-platform") || "codex");
  const [theme, setTheme] = useState(() => localStorage.getItem("mindrift-theme") || "dark");
  const displaySessions = (filteredSessions || sessions).filter((s: any) => !activePlatform || activePlatform === "all" || s.source === activePlatform);

  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem("mindrift-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // Client-side stats from platform-filtered displaySessions
  const clientStats = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let todayTok = 0, todaySes = 0, monthTok = 0, monthSes = 0, allTok2 = 0, allTurns2 = 0;
    for (const s of displaySessions) {
      const mod = s.lastModified ? new Date(s.lastModified).getTime() : new Date(s.startedAt).getTime();
      const ts = new Date(s.startedAt).getTime();
      allTok2 += s.totalTokens || 0;
      allTurns2 += s.turnCount || 0;
      if (mod >= todayStart) { todayTok += s.totalTokens || 0; todaySes++; }
      if (ts >= monthStart) { monthTok += s.totalTokens || 0; monthSes++; }
    }
    return { todayTok, todaySes, monthTok, monthSes, allTok: allTok2, allTurns: allTurns2, allSes: displaySessions.length };
  }, [displaySessions]);
  
  const todayTok = clientStats.todayTok;
  const monthTok = clientStats.monthTok;
  const todaySes = clientStats.todaySes;
  const allSes = clientStats.allSes;
  const allTurns = clientStats.allTurns;
  
  // Client-side pricing + cost estimation
  const PRICING: Record<string, {input:number;output:number}> = {
    "custom": {input:0.50,output:2},"gpt-5": {input:1.25,output:10},"gpt-5-mini": {input:0.15,output:0.60},
    "gpt-4o": {input:2.50,output:10},"claude-sonnet": {input:3,output:15},"claude-opus": {input:15,output:75},
    "deepseek-v4-pro": {input:0.55,output:2.19},
  };
  const estCost = useMemo(() => {
    let totalIn = 0, totalOut = 0;
    for (const s of displaySessions) {
      totalIn += (s.totalTokens || 0) * 0.7;
      totalOut += (s.totalTokens || 0) * 0.3;
    }
    const p = PRICING[setupModel] || PRICING["custom"];
    return (totalIn / 1e6) * p.input + (totalOut / 1e6) * p.output;
  }, [displaySessions, setupModel]);
  const anomalies = displaySessions.filter((s: any) => s.anomalies && s.anomalies.length > 0).length;
  const currentSession = sessions.find((s: any) => s.id === currentSessionId) || null;
  const efficiency = displaySessions.length > 0 ? Math.round(displaySessions.reduce((a: number, s: any) => a + (s.efficiencyScore || 50), 0) / displaySessions.length) : 0;
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
          {sessions[0]?.provider && <StatPill icon={<Cpu size={10} className="text-cyan-400" />} label="API" value={sessions[0].provider} unit="" />}
          {estCost > 0 && <StatPill icon={<DollarSign size={10} className="text-emerald-400" />} label="Est. Cost" value={formatCost(estCost)} unit="" title={"Model: " + setupModel} />}
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
            onClick={() => {
            if (!showWizard) {
              fetch("/api/config").then(r => r.json()).then(c => {
                setSetupModel(c.costModel || "custom");
                if (c.platform) setActivePlatform(c.platform);
              }).catch(() => {});
            }
            setShowWizard(!showWizard);
          }}
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
      {/* Alert banner */}
      {alerts && alerts.length > 0 && (
        <div className="shrink-0 px-4 py-1 bg-amber-500/[0.06] border-b border-amber-500/15 flex items-center gap-2 text-[9px]">
          <Bell size={10} className="text-amber-400 shrink-0" />
          <span style={{color:"var(--text-secondary)"}}>{alerts.length} alert{alerts.length > 1 ? "s" : ""}</span>
          <span style={{color:"var(--text-muted)"}}>— {alerts[0]}</span>
        </div>
      )}

      <SessionFilter sessions={sessions} onFiltered={setFilteredSessions} />
      <SessionBar sessions={displaySessions} currentSessionId={currentSessionId} onSelect={loadSession} loading={loading} />

      <div className="flex-1 flex min-h-0 relative z-10">
        <div className="w-[220px] shrink-0">
          <TurnSidebar turns={turns} selectedTurnN={selectedTurnN} onSelect={setSelectedTurnN} />
        </div>
        <TurnDetail
          turn={selectedTurn} planSteps={planSteps} planProgress={planProgress} turnTools={selectedTurnTools} sessions={sessions} currentSession={currentSession}
          activeView={activeView} setActiveView={setActiveView} sessionMeta={sessionMeta}
          turns={turns} selectedTurnN={selectedTurnN} setSelectedTurnN={setSelectedTurnN}
          allToolCalls={allToolCalls} stats={stats}
        />
      </div>{showWizard && (
        <div className="fixed top-10 right-4 w-80 rounded-xl border shadow-2xl z-50 p-4 max-h-[80vh] overflow-y-auto" style={{background:"var(--bg-surface)",borderColor:"var(--border-strong)",boxShadow:"0 8px 32px rgba(0,0,0,0.4)"}}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold" style={{color:"var(--text-primary)"}}>Setup & Configuration</span>
            <button onClick={() => setShowWizard(false)} className="text-[10px] hover:underline" style={{color:"var(--text-muted)"}}>Esc</button>
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-[9px] font-semibold mb-1.5" style={{color:"var(--text-secondary)"}}>Platform Sources</div>
              <div className="space-y-1">
                {[{id:"codex",label:"Codex",desc:"~/.codex/sessions/",color:"#22d3ee"},{id:"claude-code",label:"Claude Code",desc:"~/.claude/projects/",color:"#a78bfa"},{id:"cursor",label:"Cursor",desc:"~/.cursor-tutor/",color:"#f59e0b"}].map(p => {
                  const active = activePlatform === p.id;
                  return (
                    <button key={p.id} onClick={() => { 
                    setActivePlatform(p.id); 
                    setFilteredSessions(null); 
                    clearSession();
                    localStorage.setItem("mindrift-platform", p.id); 
                  }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded border text-left transition-colors"
                      style={{ borderColor: active ? p.color : "var(--border)", background: active ? p.color + "10" : "var(--bg-card)" }}>
                      <div className="w-3 h-3 rounded border flex items-center justify-center text-[7px]" style={{ borderColor: active ? p.color : "var(--border)", background: active ? p.color : "transparent", color: "white" }}>
                        {active ? "✓" : ""}
                      </div>
                      <div>
                        <div className="text-[9px] font-semibold" style={{color: active ? p.color : "var(--text-secondary)"}}>{p.label}</div>
                        <div className="text-[7px]" style={{color:"var(--text-muted)"}}>{p.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="border-t" style={{borderColor:"var(--border)"}} />
            <div>
              <div className="text-[9px] font-semibold mb-1.5" style={{color:"var(--text-secondary)"}}>Cost Estimation Model</div>
              <select value={setupModel} onChange={e => setSetupModel(e.target.value)}
                className="w-full px-2 py-1.5 rounded border text-[9px] outline-none"
                style={{ borderColor:"var(--border)", background:"var(--bg-card)", color:"var(--text-primary)" }}>
                <option value="custom">Autodetect (from session model)</option>
                <option value="gpt-5">GPT-5 ($1.25/$10 per 1M)</option>
                <option value="gpt-5-mini">GPT-5 Mini ($0.15/$0.60)</option>
                <option value="gpt-4o">GPT-4o ($2.50/$10)</option>
                <option value="claude-sonnet">Claude Sonnet 4 ($3/$15)</option>
                <option value="claude-opus">Claude Opus 4 ($15/$75)</option>
                <option value="deepseek-v4-pro">DeepSeek V4 Pro ($0.55/$2.19)</option>
              </select>
            </div>
            <div className="border-t" style={{borderColor:"var(--border)"}} />
            <button onClick={saveConfig}
              className="w-full py-2 rounded-lg text-[10px] font-semibold transition-colors hover:opacity-90"
              style={{background:"var(--accent-cyan)",color:"#000"}}>
              Apply & Refresh
            </button>
            <div className="border-t" style={{borderColor:"var(--border)"}} />
            <div className="flex items-center gap-1.5 text-[8px] px-2 py-1 rounded" style={{background:"rgba(0,212,255,0.08)",color:"var(--accent-cyan)",border:"1px solid rgba(0,212,255,0.15)"}}>
              <HelpCircle size={10} />100% local · 0 instrumentation · No telemetry
            </div>
          </div>
        </div>
      )}
<footer className="shrink-0 flex items-center justify-between px-4 py-1 border-t text-[8px] font-mono relative z-10 backdrop-blur-xl"
        style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--bg-deep)" }}>
        <span>{allSes} sessions · {allTurns} turns · {fmt(sessions.reduce((s, x) => s + (x.totalTokens || 0), 0))} total tokens</span>
        <div className="flex items-center gap-3">
          <a href="/api/export/csv" className="flex items-center gap-1 hover:text-cyan-400 transition-colors" style={{color:"var(--text-muted)"}} title="Export CSV">
            <Download size={9} />CSV
          </a>
          <a href="/api/export/json" className="flex items-center gap-1 hover:text-cyan-400 transition-colors" style={{color:"var(--text-muted)"}} title="Export JSON">
            <Download size={9} />JSON
          </a>
          <span>{connected ? "ws connected" : "ws disconnected"}</span>
        </div>
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