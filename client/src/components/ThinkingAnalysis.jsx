import { useMemo } from "react";
import { Brain, Target, RotateCw, AlertTriangle, Bug, Lightbulb, CheckCircle2 } from "lucide-react";

export default function ThinkingAnalysis({ turn }) {
  const analysis = useMemo(() => {
    if (!turn || !turn.reasoning) return null;
    const text = turn.reasoning;

    const stateIndicators = [];
    if (text.match(/goal|objective|task|要做|任务|目标/i))
      stateIndicators.push({ state: "goal_clear", label: "Task focused", tip: "Agent understands the objective", icon: Target, color: "text-emerald-400", bg: "bg-emerald-400/5 border-emerald-400/20" });
    const retryCount = (text.match(/retry|重试|again|再次|re-attempt/gi) || []).length;
    if (retryCount > 2)
      stateIndicators.push({ state: "retrying", label: "Retrying (" + retryCount + "x)", tip: "Agent is retrying failed actions repeatedly", icon: RotateCw, color: "text-amber-400", bg: "bg-amber-400/5 border-amber-400/20" });
    if (text.match(/doesn''t work|not working|failed|error|issue|bug|不行|不工作|错误|失败|问题/gi))
      stateIndicators.push({ state: "stuck", label: "Hitting errors", tip: "Agent is running into problems", icon: Bug, color: "text-red-400", bg: "bg-red-400/5 border-red-400/20" });
    if (text.match(/oops|wait|actually|hmm|不对|等等|实际上|等一下/gi))
      stateIndicators.push({ state: "off_track", label: "Self-correcting", tip: "Agent noticed a mistake and is adjusting course", icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-400/5 border-orange-400/20" });
    if (text.match(/aha|found it|I see|原来如此|明白了|啊哈|我懂了/gi))
      stateIndicators.push({ state: "insight", label: "Had insight", tip: "Agent discovered something useful", icon: Lightbulb, color: "text-yellow-400", bg: "bg-yellow-400/5 border-yellow-400/20" });
    if (text.match(/done|finished|complete|working now|搞定|完成|好了|可以了/gi))
      stateIndicators.push({ state: "confident", label: "Done / Confident", tip: "Agent believes the task is complete", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-400/5 border-emerald-400/20" });

    const faults = [];
    const readCount = (text.match(/read.*file|readFile|读取.*文件|Get-Content/gi) || []).length;
    if (readCount > 5) faults.push({ type: "loop", label: "Possible loop: reading files " + readCount + "x", severity: "high" });
    if (text.match(/tool.*(?:not found|doesn''t exist|unknown)|工具.*(?:找不到|不存在|未知)/gi))
      faults.push({ type: "invalid_tool", label: "Referenced non-existent tool", severity: "high" });
    if (text.match(/forgot|confused|unsure|不确定|忘记|困惑/gi))
      faults.push({ type: "confusion", label: "Shows uncertainty about task", severity: "medium" });

    return { stateIndicators, faults, totalReasoningLen: text.length };
  }, [turn]);

  if (!turn) return <div className="flex-1 flex items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>Select a turn</div>;
  if (!analysis || !turn.reasoning) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
        <div className="text-center"><Brain size={24} className="mx-auto mb-2 opacity-20" /><p className="text-xs">No reasoning data for this turn</p></div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {/* State indicators */}
      {analysis.stateIndicators.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[9px] font-semibold tracking-wider uppercase px-1" style={{ color: "var(--text-muted)" }}>
            Agent State <span style={{fontWeight:"normal",textTransform:"none"}}>(thinking patterns detected)</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.stateIndicators.map((s, i) => (
              <div key={i} className={"flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-[9px] " + s.bg + " " + s.color} title={s.tip || s.label}>
                <s.icon size={10} /><span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fault patterns */}
      {analysis.faults.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[9px] font-semibold tracking-wider uppercase px-1" style={{ color: "var(--text-muted)" }}>
            <AlertTriangle size={10} className="inline mr-1 text-red-400" />Fault Patterns
          </div>
          <div className="space-y-1">
            {analysis.faults.map((f, i) => (
              <div key={i} className={"flex items-center gap-2 px-2.5 py-1.5 rounded border text-[9px] " + (f.severity === "high" ? "text-red-400 bg-red-400/5 border-red-400/20" : "text-amber-400 bg-amber-400/5 border-amber-400/20")}>
                <Bug size={10} /><span>{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full reasoning */}
      <details className="group">
        <summary className="text-[9px] cursor-pointer font-semibold tracking-wider uppercase px-1" style={{ color: "var(--text-muted)" }}>
          <Brain size={10} className="inline mr-1 text-purple-400" />Full Reasoning ({analysis.totalReasoningLen.toLocaleString()} chars)
        </summary>
        <pre className="mt-2 text-[9px] font-mono p-3 rounded border max-h-[400px] overflow-y-auto whitespace-pre-wrap leading-relaxed" style={{ background: "var(--code-bg)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          {turn.reasoning}
        </pre>
      </details>
    </div>
  );
}