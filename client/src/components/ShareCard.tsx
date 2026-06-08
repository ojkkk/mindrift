import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Download, Share2, X } from "lucide-react";
import type { SessionInfo, Turn, Stats } from "../../../shared/types";

const fmt = (n: number) => { if (!n && n !== 0) return "0"; if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"; return String(Math.round(n)); };

function fmtDate(ts: string) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ShareCard({ session, turns, stats, onClose }: {
  session: SessionInfo | null;
  turns: any[];
  stats: Stats;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  if (!session) return null;

  const totalTokens = session.totalTokens || 0;
  const totalTurns = session.turnCount || 0;
  const toolCalls = session.toolCallCount || 0;
  const avgTokens = totalTurns > 0 ? Math.round(totalTokens / totalTurns / 1000) : 0;
  const efficiency = stats?.efficiency || avgTokens;

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        backgroundColor: "#0a0a0f",
        pixelRatio: 2,
        quality: 1,
      });
      const link = document.createElement("a");
      link.download = `mindrift-${session.id.slice(0, 8)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Failed to generate image:", e);
    }
    setDownloading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="relative" style={{ maxWidth: "500px" }}>
        {/* Close button */}
        <button onClick={onClose} className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <X size={14} style={{ color: "var(--text-muted)" }} />
        </button>

        {/* Card */}
        <div ref={cardRef} className="rounded-2xl overflow-hidden" style={{
          width: "460px",
          background: "linear-gradient(135deg, #0a0a0f 0%, #111118 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          padding: "28px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#e2e8f0", marginBottom: "4px", maxWidth: "320px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {session.name || "Untitled Session"}
              </div>
              <div style={{ fontSize: "10px", color: "#64748b" }}>
                {fmtDate(session.startedAt)} · {session.model || "AI"}
              </div>
            </div>
            <div style={{
              background: "linear-gradient(135deg, rgba(34,211,238,0.15), rgba(99,102,241,0.15))",
              border: "1px solid rgba(34,211,238,0.2)",
              borderRadius: "10px",
              padding: "8px 14px",
              textAlign: "center"
            }}>
              <div style={{ fontSize: "8px", color: "#64748b", textTransform: "uppercase", letterSpacing: "1px" }}>Mindrift</div>
              <div style={{ fontSize: "10px", fontWeight: 600, color: "#22d3ee" }}>
                {session.source === "claude-code" ? "Claude Code" : "Codex"}
              </div>
            </div>
          </div>

          {/* Big number */}
          <div style={{
            background: "linear-gradient(135deg, rgba(34,211,238,0.06), rgba(99,102,241,0.06))",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: "14px",
            padding: "18px",
            marginBottom: "16px",
            textAlign: "center"
          }}>
            <div style={{ fontSize: "42px", fontWeight: 800, color: "#22d3ee", lineHeight: 1, marginBottom: "4px" }}>
              {fmt(totalTokens)}
            </div>
            <div style={{ fontSize: "10px", color: "#64748b", textTransform: "uppercase", letterSpacing: "2px" }}>Total Tokens</div>
          </div>

          {/* Stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "16px" }}>
            <StatBox label="Turns" value={String(totalTurns)} color="#a78bfa" />
            <StatBox label="Tools" value={String(toolCalls)} color="#34d399" />
            <StatBox label="Avg/Turn" value={avgTokens + "K"} color="#f59e0b" />
          </div>

          {/* Footer */}
          <div style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            paddingTop: "12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <div style={{ fontSize: "9px", color: "#475569" }}>
              Generated by Mindrift · monitor every thought
            </div>
            <div style={{ fontSize: "9px", color: "#475569" }}>
              github.com/ojkkk/mindrift
            </div>
          </div>
        </div>

        {/* Download button */}
        <div className="flex justify-center mt-4">
          <button onClick={handleDownload} disabled={downloading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all"
            style={{
              background: downloading ? "var(--bg-hover)" : "linear-gradient(135deg, rgba(34,211,238,0.2), rgba(99,102,241,0.2))",
              border: "1px solid rgba(34,211,238,0.3)",
              color: downloading ? "var(--text-muted)" : "#22d3ee",
              cursor: downloading ? "wait" : "pointer",
            }}>
            {downloading ? "Generating..." : <>
              <Download size={14} />
              Download PNG
            </>}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: "10px",
      padding: "10px",
      textAlign: "center"
    }}>
      <div style={{ fontSize: "22px", fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: "8px", color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginTop: "2px" }}>{label}</div>
    </div>
  );
}
