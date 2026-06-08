// @ts-nocheck — JSX render component, types to be added gradually

import { useState, useEffect } from "react";
import { Download, Copy, Check, FileText } from "lucide-react";

export default function RawLogViewer({ sessionMeta }) {
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sessionMeta?.id) return;
    setLoading(true);
    fetch(`/api/sessions/${sessionMeta.id}/raw`)
      .then((r) => r.text())
      .then((text) => { setRaw(text); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sessionMeta?.id]);

  const handleCopy = () => {
    navigator.clipboard.writeText(raw).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  const handleDownload = () => {
    const blob = new Blob([raw], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-${sessionMeta?.id?.slice(0, 8) || "export"}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
        <div className="text-center"><FileText size={24} className="mx-auto mb-2 opacity-20 animate-pulse" /><p className="text-xs">Loading raw log...</p></div>
      </div>
    );
  }

  if (!raw) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
        <div className="text-center"><FileText size={24} className="mx-auto mb-2 opacity-20" /><p className="text-xs">No raw log available</p></div>
      </div>
    );
  }

  const lines = raw.split("\n").filter(Boolean);
  const sizeKB = (new Blob([raw]).size / 1024).toFixed(1);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <div className="flex items-center gap-2">
          <FileText size={12} style={{ color: "var(--text-muted)" }} />
          <span className="text-[10px] font-mono" style={{ color: "var(--text-secondary)" }}>{lines.length} lines · {sizeKB} KB</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-1 rounded text-[9px] transition-colors hover:bg-white/[0.04]" style={{ color: "var(--text-muted)" }}>
            {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}{copied ? "Copied" : "Copy"}
          </button>
          <button onClick={handleDownload} className="flex items-center gap-1 px-2 py-1 rounded text-[9px] transition-colors hover:bg-white/[0.04]" style={{ color: "var(--text-muted)" }}>
            <Download size={10} />Download
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <pre className="text-[9px] font-mono p-4 leading-relaxed whitespace-pre-wrap break-all" style={{ color: "var(--text-secondary)" }}>{raw}</pre>
      </div>
    </div>
  );
}
