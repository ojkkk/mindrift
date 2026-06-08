// ====== Multi-Platform Parser Router ======
// Auto-detects session source and routes to the correct parser
import type { UnifiedSession, ParserFn, ScannerFn } from "./base";
import { parseCodexSession, scanCodexSessions } from "./codex";
import { parseClaudeSession, scanClaudeSessions } from "./claude";

const fs = require("fs");
const path = require("path");

// Detect source from file path
function detectSource(filePath: string): "codex" | "claude-code" | "cursor" | "unknown" {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.includes("/.codex/sessions/")) return "codex";
  if (normalized.includes("/.claude/projects/")) return "claude-code";
  if (normalized.includes("/.cursor")) return "cursor";
  return "unknown";
}

// Parse any session file
export function parseUnifiedSession(filePath: string): UnifiedSession | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  const source = detectSource(filePath);

  let parser: ParserFn;
  switch (source) {
    case "codex": parser = parseCodexSession; break;
    case "claude-code": parser = parseClaudeSession; break;
    default:
      // Try each parser, return first that succeeds
      const r1 = parseCodexSession(raw, filePath);
      if (r1) return r1;
      const r2 = parseClaudeSession(raw, filePath);
      if (r2) return r2;
      return null;
  }
  return parser(raw, filePath);
}

// Scan all sessions across all platforms
export function scanAllPlatforms(extraSources?: { type: string; path: string }[]): any[] {
  let all: any[] = [];

  // Always scan Codex
  try { all = all.concat(scanCodexSessions()); } catch {}

  // Scan Claude Code if available
  try { all = all.concat(scanClaudeSessions()); } catch {}

  // Additional sources from config
  if (extraSources) {
    for (const src of extraSources) {
      try {
        if (src.type === "codex") all = all.concat(scanCodexSessions(src.path));
        else if (src.type === "claude-code") all = all.concat(scanClaudeSessions(src.path));
      } catch {}
    }
  }

  // Sort by last modified, deduplicate by id
  const seen = new Set<string>();
  all = all.filter((s: any) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  all.sort((a: any, b: any) =>
    new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );

  return all;
}
