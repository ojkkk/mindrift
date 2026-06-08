// @ts-nocheck

import { useState } from "react";
import { Search, Filter, X, Zap, Wrench, Flame } from "lucide-react";

export default function SessionFilter({ sessions, onFiltered }) {
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [minTokens, setMinTokens] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [minTools, setMinTools] = useState("");
  const [anomalyOnly, setAnomalyOnly] = useState(false);

  const apply = (q, mt, xt, mTool, anom) => {
    let f = [...sessions];
    if (q) { const l = q.toLowerCase(); f = f.filter(s => (s.name||"").toLowerCase().includes(l) || (s.cwd||"").toLowerCase().includes(l) || (s.model||"").toLowerCase().includes(l)); }
    if (mt) f = f.filter(s => (s.totalTokens||0) >= parseInt(mt));
    if (xt) f = f.filter(s => (s.totalTokens||0) <= parseInt(xt));
    if (mTool) f = f.filter(s => (s.toolCallCount||0) >= parseInt(mTool));
    if (anom) f = f.filter(s => s.anomalies && s.anomalies.length > 0);
    onFiltered(f);
  };
  const handleSearch = (v) => { setQuery(v); apply(v, minTokens, maxTokens, minTools, anomalyOnly); };
  const clear = () => { setQuery(""); setMinTokens(""); setMaxTokens(""); setMinTools(""); setAnomalyOnly(false); setShowFilters(false); onFiltered(sessions); };
  const hasFilters = query || minTokens || maxTokens || minTools || anomalyOnly;

  return (
    <div className="shrink-0 border-b" style={{ borderColor: "var(--border)", background: "var(--bg-deep)" }}>
      <div className="flex items-center gap-1.5 px-2 py-0.5">
        <Search size={10} style={{ color: "var(--text-muted)" }} />
        <input type="text" placeholder="Filter sessions..." value={query} onChange={e => handleSearch(e.target.value)}
          className="flex-1 bg-transparent text-[9px] outline-none" style={{ color: "var(--text-primary)" }} />
        <button onClick={() => setShowFilters(!showFilters)}
          className={"flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] transition-colors " + (showFilters||hasFilters ? "text-cyan-400 bg-cyan-400/10" : "")}
          style={{ color: (!showFilters && !hasFilters) ? "var(--text-muted)" : undefined }}>
          <Filter size={8} />Filters
        </button>
        {hasFilters && <button onClick={clear} style={{ color: "var(--text-muted)" }}><X size={10} /></button>}
      </div>
      {showFilters && (
        <div className="flex items-center gap-2 px-2 py-1 border-t text-[8px]" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-1"><Zap size={8} className="text-cyan-500/60" /><span style={{ color: "var(--text-muted)" }}>Tokens:</span>
            <input type="number" placeholder="Min" value={minTokens} onChange={e => { setMinTokens(e.target.value); apply(query, e.target.value, maxTokens, minTools, anomalyOnly); }}
              className="w-12 border rounded px-1 py-0.5 text-[8px] outline-none" style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--bg-card)" }} />
            <input type="number" placeholder="Max" value={maxTokens} onChange={e => { setMaxTokens(e.target.value); apply(query, minTokens, e.target.value, minTools, anomalyOnly); }}
              className="w-12 border rounded px-1 py-0.5 text-[8px] outline-none" style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--bg-card)" }} />
          </div>
          <div className="flex items-center gap-1"><Wrench size={8} className="text-purple-500/60" /><span style={{ color: "var(--text-muted)" }}>Tools:</span>
            <input type="number" placeholder="Min" value={minTools} onChange={e => { setMinTools(e.target.value); apply(query, minTokens, maxTokens, e.target.value, anomalyOnly); }}
              className="w-10 border rounded px-1 py-0.5 text-[8px] outline-none" style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--bg-card)" }} />
          </div>
          <label className="flex items-center gap-0.5 cursor-pointer">
            <input type="checkbox" checked={anomalyOnly} onChange={e => { setAnomalyOnly(e.target.checked); apply(query, minTokens, maxTokens, minTools, e.target.checked); }} className="accent-red-400" />
            <Flame size={8} className="text-red-400" /><span style={{ color: "var(--text-muted)" }}>Anomalies</span>
          </label>
        </div>
      )}
    </div>
  );
}
