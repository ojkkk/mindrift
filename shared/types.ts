// ====== Core types shared between server and client ======

// ---- Session Meta ----
export interface SessionMeta {
  id: string;
  cwd: string;
  model: string;
  cliVersion?: string;
  startedAt: string;
  lastModified?: string; // ISO timestamp
}

// ---- Token Metrics ----
export interface TokenUsage {
  in: number;
  out: number;
  reason: number;
}

export interface TokenMetrics {
  total: {
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    reasoning_output_tokens: number;
    total_tokens: number;
  };
  contextWindow: number;
}

// ---- Tool Call ----
export interface ToolCall {
  id: string;
  name: string;
  ts: string;
  dur: number | null;
  done: boolean;
  args: string;
  argsFull: string;
  output: string;
  outputFull: string;
  turnN: number;
  error?: string;
  outputSize?: number;
  readFiles?: string[];
}

// ---- Plan Step ----
export interface PlanStep {
  step: string;
  status: "pending" | "in_progress" | "completed" | "";
}

// ---- Agent Message ----
export interface AgentMessage {
  ts: string;
  text: string;
}

// ---- Turn ----
export interface Turn {
  id: string;
  n: number;
  model: string;
  startedAt: string;
  finishedAt: string | null;
  tc: number; // tool call count
  tokens: TokenUsage;
  ctxWindow: number;
  userMsg: string;
  agentMessages: AgentMessage[];
  agentSummary: string;
  reasoning: string;
  duration: number | null;
  compacted: boolean;
  compactRestarts: number;
  compactSummary: string;
  goalObjective: string;
  aborted: boolean;
  abortReason: string;
  taskDone: boolean;
  done?: boolean; // runtime alias
  wastedTokens: number;
  wasteReasons: string[];
  // Client-side merged
  tTools?: ToolCall[];
}

// ---- Session (from scan) ----
export interface SessionInfo {
  id: string;
  name: string;
  filePath: string;
  source: string;
  startedAt: string;
  turnCount: number;
  totalTokens: number;
  toolCallCount: number;
  model: string;
  cwd: string;
  anomalies: string[];
}

// ---- Stats ----
export interface Stats {
  today: { tokens: number; sessions: number };
  month: { tokens: number; sessions: number };
  all: { tokens: number; turns: number; sessions: number };
  anomalies: number;
  efficiency: number;
}

// ---- WebSocket message types ----
export type WsMessage =
  | { type: "init"; payload: WsInitPayload }
  | { type: "full_state"; payload: WsFullStatePayload }
  | { type: "stats_update"; payload: Stats }
  | { type: "session_loaded"; payload: WsSessionLoadedPayload }
  | { type: "new_session"; payload: Record<string, never> }
  | { type: "plan_update"; payload: PlanStep[] };

export interface WsInitPayload {
  sessions: SessionInfo[];
  currentSessionId: string;
  stats: Stats;
  liveSession: {
    meta: SessionMeta | null;
    turns: Turn[];
    planSteps: PlanStep[];
  };
  liveMetrics: {
    tokens: TokenMetrics;
    toolCalls: number;
    turns: { n: number; tc: number; tokens: TokenUsage; done: boolean; aborted: boolean; compacted: boolean }[];
  };
}

export interface WsFullStatePayload {
  meta: SessionMeta | null;
  turns: Turn[];
  planSteps: PlanStep[];
  toolCalls: ToolCall[];
  stats: Stats;
}

export interface WsSessionLoadedPayload {
  session: SessionInfo;
  meta: SessionMeta | null;
  turns: Turn[];
  planSteps: PlanStep[];
}

// ---- Server-side raw parsed session ----
export interface ParsedSession {
  meta: SessionMeta | null;
  turns: Turn[];
  toolCalls: ToolCall[];
  planSteps: PlanStep[];
  tokenTotal: {
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    reasoning_output_tokens: number;
    total_tokens: number;
  };
  ctxWindow: number;
}
