import { useState, useEffect, useRef, useCallback } from "react";
import type { SessionInfo, Turn, ToolCall, PlanStep, Stats, SessionMeta } from "../../../shared/types";

export function useAgentScope() {
  const [connected, setConnected] = useState<boolean>(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sessionMeta, setSessionMeta] = useState<SessionMeta | null>(null);
  const [selectedTurnN, setSelectedTurnN] = useState<number | null>(null);
  const [planSteps, setPlanSteps] = useState<PlanStep[]>([]);
  const [planProgress, setPlanProgress] = useState<{ completed: number; total: number }>({ completed: 0, total: 0 });
  const [loading, setLoading] = useState<boolean>(false);
  const [allToolCalls, setAllToolCalls] = useState<ToolCall[]>([]);
  const [stats, setStats] = useState<Stats>({ today: { tokens: 0, sessions: 0 }, month: { tokens: 0, sessions: 0 }, all: { tokens: 0, turns: 0, sessions: 0 }, anomalies: 0, efficiency: 0 });
  const [activeView, setActiveView] = useState<string>("overview");
  const [alerts, setAlerts] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(protocol + "//" + location.hostname + ":3344/ws");
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => { setConnected(false); setTimeout(connect, 2000); };
    ws.onerror = () => ws.close();

    ws.onmessage = (msg: MessageEvent) => {
      try {
        const data = JSON.parse(msg.data);
        switch (data.type) {
          case "init": {
            const p = data.payload;
            setSessions(p.sessions || []);
            setCurrentSessionId((prev) => prev || p.currentSessionId);
            if (p.stats) setStats(p.stats);
            if (p.liveSession) {
              const ls = p.liveSession;
              setSessionMeta(ls.meta);
              setTurns(ls.turns || []);
              setPlanSteps(ls.planSteps || []);
              if (ls.planProgress) setPlanProgress(ls.planProgress);
              const tcs: ToolCall[] = [];
              for (const t of ls.turns || []) {
                for (const tc of t.tTools || []) tcs.push({ ...tc, turnN: t.n } as ToolCall);
              }
              setAllToolCalls(tcs);
              const ts = ls.turns || [];
              if (ts.length > 0) setSelectedTurnN((prev) => prev || ts[ts.length - 1].n);
            }
            break;
          }

          case "full_state": {
            const fs = data.payload;
            if (fs.meta) setSessionMeta(fs.meta);
            if (fs.stats) setStats(fs.stats);
            if (fs.alerts) setAlerts(fs.alerts);
            const newTurns: Turn[] = fs.turns || [];
            setTurns(newTurns);
            setPlanSteps(fs.planSteps || []);
            if (fs.planProgress) setPlanProgress(fs.planProgress);
            const tcs: ToolCall[] = [];
            for (const t of newTurns) {
              for (const tc of t.tTools || []) tcs.push({ ...tc, turnN: t.n } as ToolCall);
            }
            setAllToolCalls(tcs);
            if (newTurns.length > 0) {
              setSelectedTurnN((prev) => {
                if (prev && newTurns.some((t: Turn) => t.n === prev)) return prev;
                return newTurns[newTurns.length - 1].n;
              });
            }
            break;
          }

          case "stats_update": {
            if (data.payload) setStats(data.payload);
            break;
          }

          case "session_loaded": {
            const sl = data.payload;
            setSessionMeta(sl.meta);
            const loadedTurns: Turn[] = sl.turns || [];
            setTurns(loadedTurns);
            setPlanSteps(sl.planSteps || []);
            if (sl.planProgress) setPlanProgress(sl.planProgress);
            setLoading(false);
            const tcs: ToolCall[] = [];
            for (const t of loadedTurns) {
              for (const tc of t.tTools || []) tcs.push({ ...tc, turnN: t.n } as ToolCall);
            }
            setAllToolCalls(tcs);
            if (loadedTurns.length > 0) setSelectedTurnN(loadedTurns[loadedTurns.length - 1].n);
            else setSelectedTurnN(null);
            setActiveView("overview");
            break;
          }

          case "new_session": {
            fetch("/api/sessions")
              .then((r) => r.json())
              .then((d) => {
                const sess: SessionInfo[] = d.sessions || [];
                setSessions(sess);
                if (d.stats) setStats(d.stats);
                if (sess.length > 0) {
                  setCurrentSessionId(sess[0].id);
                  setTurns([]);
                  setAllToolCalls([]);
                  setSelectedTurnN(null);
                  setLoading(true);
                  if (wsRef.current?.readyState === 1) {
                    wsRef.current.send(JSON.stringify({ type: "load_session", sessionId: sess[0].id }));
                  }
                }
              })
              .catch(() => {});
            break;
          }

          case "plan_update": {
            setPlanSteps(data.payload || []);
            break;
          }
        }
      } catch {}
    };
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  const loadSession = useCallback((sessionId: string) => {
    if (!sessionId) return;
    setCurrentSessionId(sessionId);
    setTurns([]);
    setAllToolCalls([]);
    setSelectedTurnN(null);
    setLoading(true);
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((all) => {
        setSessions(all.sessions || all);
        if (all.stats) setStats(all.stats);
      })
      .catch(() => {})
      .finally(() => {
        if (wsRef.current?.readyState === 1) {
          wsRef.current.send(JSON.stringify({ type: "load_session", sessionId }));
        }
      });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!turns.length) return;
      const currentIdx = turns.findIndex((t: Turn) => t.n === selectedTurnN);
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const next = currentIdx < turns.length - 1 ? currentIdx + 1 : 0;
        setSelectedTurnN(turns[next].n);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const prev = currentIdx > 0 ? currentIdx - 1 : turns.length - 1;
        setSelectedTurnN(turns[prev].n);
      } else if (e.key === "Escape") {
        if (activeView !== "overview") setActiveView("overview");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [turns, selectedTurnN, activeView, setActiveView]);
  
  const selectedTurn = turns.find((t: Turn) => t.n === selectedTurnN) || null;
  const selectedTurnTools = selectedTurn ? allToolCalls.filter((tc: ToolCall) => tc.turnN === selectedTurn.n) : [];

  const clearSession = useCallback(() => {
    setCurrentSessionId(null);
    setTurns([]);
    setAllToolCalls([]);
    setSelectedTurnN(null);
    setPlanSteps([]);
    setSessionMeta(null);
  }, []);

  return {
    connected, sessions, currentSessionId, loadSession, loading,
    sessionMeta, turns, selectedTurnN, setSelectedTurnN,
    selectedTurn, selectedTurnTools, planSteps, planProgress, clearSession,
    stats, activeView, setActiveView, allToolCalls, alerts,
  };
}