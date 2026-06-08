import { useState } from "react";
import { Brain, Wrench, MessageCircle, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, RotateCw, Terminal, FileText, Bot } from "lucide-react";

const fmtMs = (ms) => { if (!ms) return "\u2014"; if (ms < 1000) return ms + "ms"; return (ms / 1000).toFixed(1) + "s"; };

export default function Timeline({ turn, turnTools }) {
  if (!turn) return <div className="flex-1 flex items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>Select a turn</div>;

  const events: any[] = [];

  // 1. User message
  if (turn.userMsg) {
    events.push({
      ts: turn.startedAt, type: "user",
      icon: <MessageCircle size={12} className="text-blue-400" />,
      content: turn.userMsg,
      color: "border-l-blue-400 bg-blue-400/5"
    });
  }

  // 2. Reasoning chunks
  if (turn.reasoning) {
    const chunks = turn.reasoning.split(/\n\n+/).filter(c => c.trim().length > 20);
    const showChunks = chunks.slice(0, 5);
    showChunks.forEach((chunk, i) => {
      const preview = chunk.trim().split("\n").filter(l => l.trim())[0]?.slice(0, 100) || "";
      events.push({
        ts: turn.startedAt, type: "thinking",
        icon: <Brain size={12} className="text-purple-400" />,
        content: preview, fullContent: chunk.trim(),
        color: "border-l-purple-400 bg-purple-400/5", collapsible: true,
        _order: i
      });
    });
  }

  // 3. ALL agent messages (chronological, interleaved with tools)
  if (turn.agentMessages && turn.agentMessages.length > 0) {
    for (const am of turn.agentMessages) {
      events.push({
        ts: am.ts || turn.startedAt, type: "agent",
        icon: <Bot size={12} className="text-emerald-400" />,
        content: am.text,
        color: "border-l-emerald-400 bg-emerald-400/5"
      });
    }
  } else if (turn.agentSummary) {
    events.push({
      ts: turn.finishedAt || turn.startedAt, type: "agent",
      icon: <Bot size={12} className="text-emerald-400" />,
      content: turn.agentSummary,
      color: "border-l-emerald-400 bg-emerald-400/5"
    });
  }

  // 4. Tool calls
  for (const tc of turnTools || []) {
    const name = (tc.name || "tool").replace(/_/g, " ");
    const preview = tc.args ? (typeof tc.args === "string" ? tc.args.slice(0, 100) : "") : "";
    events.push({
      ts: tc.ts, type: "tool", name,
      icon: tc.error ? <AlertCircle size={12} className="text-red-400" />
        : tc.done ? <CheckCircle2 size={12} className="text-emerald-400" />
        : <RotateCw size={12} className="text-amber-400 animate-spin" />,
      content: tc, preview,
      color: tc.error ? "border-l-red-400 bg-red-400/5" : "border-l-cyan-400 bg-cyan-400/5",
      collapsible: true,
    });
  }

  // Sort chronologically
  events.sort((a, b) => {
    const ta = a.ts || "";
    const tb = b.ts || "";
    if (ta !== tb) return ta.localeCompare(tb);
    const oa = a._order ?? (a.type === "thinking" ? 0 : a.type === "agent" ? 50 : a.type === "tool" ? 100 : 200);
    const ob = b._order ?? (b.type === "thinking" ? 0 : b.type === "agent" ? 50 : b.type === "tool" ? 100 : 200);
    return oa - ob;
  });

  const toolDone = (turnTools || []).filter(t => t && t.done).length;
  const toolTotal = (turnTools || []).length;

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="flex items-center gap-4 mb-3 px-2 text-[9px]">
        <span style={{ color: "var(--text-secondary)" }}>
          Turn <span style={{ color: "var(--text-primary)" }}>#{turn.n}</span>
          {turn.duration ? " \u00B7 " + turn.duration + "s" : " \u00B7 in progress"}
        </span>
        {toolTotal > 0 && (
          <span className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            <Wrench size={10} style={{ color: "var(--accent-purple)" }} />
            <span style={{ color: "var(--text-primary)" }}>{toolDone}/{toolTotal}</span> tools
          </span>
        )}
        <span className="text-[8px]" style={{ color: "var(--text-dim)" }}>{events.length} events</span>
        {turn.compacted && <span className="text-amber-500 text-[8px]">compacted {turn.compactRestarts || 1}x</span>}
      </div>

      <div className="relative pl-6">
        <div className="absolute left-[11px] top-2 bottom-2 w-px" style={{ background: "var(--border)" }} />
        <div className="space-y-2">
          {events.map((evt, i) => <TimelineEvent key={i} evt={evt} />)}
        </div>
      </div>

      {events.length === 0 && (
        <div className="text-[10px] text-center py-8" style={{ color: "var(--text-muted)" }}>No events for this turn</div>
      )}
    </div>
  );
}

function TimelineEvent({ evt }) {
  const [open, setOpen] = useState(false);

  if (evt.type === "tool") {
    const tc = evt.content;
    return (
      <div className={"relative border-l-2 rounded-r-lg p-2.5 " + evt.color}>
        <div className="absolute -left-[5px] top-3 w-2 h-2 rounded-full bg-current opacity-60" />
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {evt.icon}
            <span className="text-[10px] font-semibold shrink-0" style={{ color: "var(--text-primary)" }}>{evt.name}</span>
            <span className="text-[9px] font-mono truncate" style={{ color: "var(--text-muted)" }}>{evt.preview}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[8px] font-mono" style={{ color: "var(--text-muted)" }}>{tc.done ? fmtMs(tc.dur) : "\u00B7\u00B7\u00B7"}</span>
            <button onClick={() => setOpen(!open)} style={{ color: "var(--text-muted)" }}>
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          </div>
        </div>
        {open && (
          <div className="mt-2 space-y-2">
            <div>
              <div className="text-[8px] mb-1 font-semibold flex items-center gap-1" style={{ color: "var(--text-muted)" }}><Terminal size={8} />ARGS</div>
              <pre className="text-[9px] font-mono p-2 rounded max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all" style={{ background: "var(--code-bg)", color: "var(--text-secondary)" }}>
                {typeof tc.argsFull === "string" ? tc.argsFull : typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args, null, 2)}
              </pre>
            </div>
            {tc.output && (
              <div>
                <div className="text-[8px] mb-1 font-semibold flex items-center gap-1" style={{ color: "var(--text-muted)" }}><FileText size={8} />OUTPUT</div>
                <pre className="text-[9px] font-mono p-2 rounded max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all" style={{ background: "var(--code-bg)", color: "var(--text-secondary)" }}>
                  {tc.outputFull || tc.output}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const isCollapsible = evt.collapsible;
  const text = typeof evt.content === "string" ? evt.content : "";

  if (isCollapsible) {
    return (
      <div className={"relative border-l-2 rounded-r-lg p-2.5 " + evt.color}>
        <div className="absolute -left-[5px] top-3 w-2 h-2 rounded-full bg-current opacity-60" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {evt.icon}
            <span className="text-[10px] font-semibold shrink-0" style={{ color: "var(--text-secondary)" }}>Thinking</span>
            <span className="text-[9px] truncate" style={{ color: "var(--text-dim)" }}>{text}</span>
          </div>
          <button onClick={() => setOpen(!open)} style={{ color: "var(--text-muted)" }} className="shrink-0 ml-2">
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        </div>
        {open && evt.fullContent && (
          <pre className="mt-2 text-[9px] font-mono p-2 rounded max-h-[300px] overflow-y-auto whitespace-pre-wrap leading-relaxed" style={{ background: "var(--code-bg)", color: "var(--text-secondary)" }}>
            {evt.fullContent}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className={"relative border-l-2 rounded-r-lg p-2.5 " + evt.color}>
      <div className="absolute -left-[5px] top-3 w-2 h-2 rounded-full bg-current opacity-60" />
      <div className="flex items-start gap-2">
        {evt.icon}
        <span className="text-[10px] leading-relaxed" style={{ color: "var(--text-primary)" }}>{text}</span>
      </div>
    </div>
  );
}
