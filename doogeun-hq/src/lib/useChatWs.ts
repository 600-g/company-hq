"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/lib/utils";

/** 팀메이커/두근 백엔드 공용 WebSocket 스트리밍 훅 */
export interface WsMessage {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  agentEmoji?: string;
  agentName?: string;
  images?: string[];
  ts: number;
  tools?: ToolEntry[];
  handoff?: HandoffPayload;
  streaming?: boolean;
}

export interface ToolEntry {
  id: string;
  tool: string;
  summary: string;
  input?: Record<string, unknown>;
  done: boolean;
  error: boolean;
  resultSummary?: string;
}

export interface HandoffPayload {
  dispatch_id: string;
  steps: { team: string; team_name: string; emoji: string; prompt: string }[];
}

function wsBase(): string {
  if (typeof window === "undefined") return "ws://localhost:8000";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h === "127.0.0.1" || h.endsWith(".local") || h.startsWith("192.168.");
  return isLocal ? `ws://${h}:8000` : `wss://api.600g.net`;
}

interface Options {
  teamId: string | null;
  agentEmoji?: string;
  agentName?: string;
  onHandoff?: (h: HandoffPayload) => void;
  onToolUse?: (t: ToolEntry) => void;
}

export function useChatWs({ teamId, agentEmoji, agentName, onHandoff, onToolUse }: Options) {
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [connected, setConnected] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastAgentIdRef = useRef<string | null>(null);

  // 에이전트 변경 시 재연결
  useEffect(() => {
    if (!teamId) {
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      return;
    }
    const url = `${wsBase()}/ws/chat/${teamId}`;
    let closed = false;
    let retry = 0;

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => { setConnected(true); retry = 0; };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        // 자동 재시도 (백오프)
        if (!closed) {
          retry = Math.min(retry + 1, 5);
          setTimeout(connect, 1000 * retry);
        }
      };
      ws.onerror = () => { /* onclose 가 처리 */ };
      ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
    };

    connect();
    return () => {
      closed = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [teamId]);

  const handleMessage = useCallback((data: Record<string, unknown>) => {
    const type = data.type as string;
    if (type === "user") {
      // 서버가 에코 — 이미 추가했으므로 무시
      return;
    }
    if (type === "ai_start") {
      const id = crypto.randomUUID();
      lastAgentIdRef.current = id;
      setMessages((p) => [...p, {
        id, role: "agent", content: "", ts: Date.now(),
        agentEmoji, agentName, streaming: true, tools: [],
      }]);
      setStreaming(true);
    }
    if (type === "ai_chunk") {
      const chunk = (data.content as string) || "";
      setMessages((p) => {
        const arr = [...p];
        const last = arr[arr.length - 1];
        if (last?.role === "agent") arr[arr.length - 1] = { ...last, content: last.content + chunk };
        return arr;
      });
    }
    if (type === "ai_end") {
      setStreaming(false);
      setMessages((p) => {
        const arr = [...p];
        const last = arr[arr.length - 1];
        if (last?.role === "agent") arr[arr.length - 1] = { ...last, streaming: false };
        return arr;
      });
    }
    if (type === "tool_use") {
      const entry: ToolEntry = {
        id: (data.tool_id as string) || (data.tool as string) || crypto.randomUUID(),
        tool: (data.tool as string) || "?",
        summary: (data.summary as string) || "",
        input: (data.input as Record<string, unknown>) || undefined,
        done: false,
        error: false,
      };
      setToolStatus(entry.summary);
      setMessages((p) => {
        const arr = [...p];
        const last = arr[arr.length - 1];
        if (last?.role === "agent") {
          arr[arr.length - 1] = { ...last, tools: [...(last.tools || []), entry] };
        }
        return arr;
      });
      onToolUse?.(entry);
    }
    if (type === "tool_result") {
      const id = (data.tool_id as string) || (data.tool as string);
      const isErr = !!(data.is_error as boolean);
      const summary = (data.summary as string) || "";
      setMessages((p) => {
        const arr = [...p];
        const last = arr[arr.length - 1];
        if (last?.role === "agent" && last.tools) {
          arr[arr.length - 1] = {
            ...last,
            tools: last.tools.map((t) => t.id === id ? { ...t, done: true, error: isErr, resultSummary: summary } : t),
          };
        }
        return arr;
      });
      setToolStatus(null);
    }
    if (type === "status") {
      setToolStatus((data.content as string) || null);
    }
    if (type === "handoff_request") {
      const payload = data as unknown as HandoffPayload;
      onHandoff?.(payload);
      setMessages((p) => [...p, {
        id: crypto.randomUUID(), role: "system",
        content: `핸드오프 요청 — ${payload.steps?.length || 0}팀`,
        ts: Date.now(), handoff: payload,
      }]);
    }
    if (type === "error") {
      setStreaming(false);
      setMessages((p) => [...p, {
        id: crypto.randomUUID(), role: "system",
        content: `⚠️ ${(data.content as string) || "오류"}`, ts: Date.now(),
      }]);
    }
  }, [agentEmoji, agentName, onHandoff, onToolUse]);

  const send = useCallback((prompt: string, images?: string[]) => {
    if (!teamId) return false;
    const content = prompt.trim();
    if (!content && !images?.length) return false;

    setMessages((p) => [...p, {
      id: crypto.randomUUID(), role: "user", content, images, ts: Date.now(),
    }]);

    const body = JSON.stringify({ prompt: content, images });
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(body);
    } else {
      // 폴백: HTTP
      fetch(`${apiBase()}/api/chat/${teamId}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
      }).catch(() => {});
    }
    return true;
  }, [teamId]);

  const clear = useCallback(() => setMessages([]), []);

  return { messages, send, clear, streaming, connected, toolStatus };
}
