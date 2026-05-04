"use client";

import { useEffect, useRef, useCallback } from "react";
import { apiBase } from "@/lib/utils";
import { parseArtifacts } from "@/lib/parseArtifacts";
import { validateParsedResult, buildRetryPrompt } from "@/lib/validateOutput";
import { useChatStore } from "@/stores/chatStore";

/** 팀메이커/두근 백엔드 공용 WebSocket — 멀티 팀 동시 연결 관리
 *   - 모든 메시지는 chatStore 에 팀별 저장 → 에이전트 전환해도 유지
 *   - 한 번 연결된 WS 는 유지 (작업 중 백그라운드 처리)
 *   - 15분 유휴 시 자동 종료 (리소스 절약)
 */

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
  retry?: { count: number; issues: string[] };
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

interface ConnState {
  ws: WebSocket | null;
  retry: number;
  closed: boolean;
  retryCtx: { originalPrompt: string; count: number } | null;
  retryCount: number;
  lastDisconnectMsgId?: string; // 연결끊김 메시지 ID (재연결 시 제거용)
}

// 팀별 WS 연결 — 페이지 전역 유지
const connections = new Map<string, ConnState>();
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15분 유휴 시 자동 종료
const MAX_RETRIES = 2;

interface BroadcastHandlers {
  onBackgroundComplete?: (teamId: string, preview: string) => void;
  onHandoff?: (teamId: string, h: HandoffPayload) => void;
  onToolUse?: (teamId: string, t: ToolEntry) => void;
}

const handlers: BroadcastHandlers = {};

export function registerChatHandlers(h: BroadcastHandlers) {
  Object.assign(handlers, h);
}

/** 특정 팀의 메시지에 추가 — chatStore 의 단순 래퍼 */
function appendMsg(teamId: string, m: WsMessage) {
  useChatStore.getState().appendMessage(teamId, m);
}

function patchLastAgent(teamId: string, patch: Partial<WsMessage>) {
  const msgs = useChatStore.getState().messagesByTeam[teamId] ?? [];
  if (msgs.length === 0) return;
  const last = msgs[msgs.length - 1];
  if (last.role !== "agent") return;
  useChatStore.getState().updateLastMessage(teamId, patch);
}

function connectTeam(teamId: string, agentEmoji?: string, agentName?: string): ConnState {
  const existing = connections.get(teamId);
  if (existing && existing.ws && existing.ws.readyState !== WebSocket.CLOSED) {
    return existing;
  }
  const state: ConnState = {
    ws: null,
    retry: 0,
    closed: false,
    retryCtx: null,
    retryCount: 0,
  };
  connections.set(teamId, state);

  const connect = () => {
    if (state.closed) return;
    const url = `${wsBase()}/ws/chat/${teamId}`;
    const ws = new WebSocket(url);
    state.ws = ws;
    ws.onopen = () => {
      state.retry = 0;
      const store = useChatStore.getState();
      store.setToolStatus(teamId, null);
      // 재연결 시 streaming 고착 해제 — WS 끊기며 ai_end 못 받은 경우 "생각 중" 말풍선 영구 잔류 방지
      store.setStreaming(teamId, false);
      state.lastDisconnectMsgId = undefined;
    };
    ws.onclose = () => {
      state.ws = null;
      if (!state.closed) {
        state.retry = Math.min(state.retry + 1, 5);
        // 배포 진행 중이면 WS 재연결 메시지 표시 안 함 (배포 완료까지 침묵)
        const isDeploying = typeof window !== "undefined" && !!(window as any).__DEPLOY_IN_PROGRESS__;
        // 4회 이상 연속 끊김 + 배포 아닐 때만 알림 (배포 중엔 침묵, 배포 완료 후 계속 끊기면 표시)
        if (state.retry >= 4 && !isDeploying) {
          try {
            const msgId = crypto.randomUUID();
            state.lastDisconnectMsgId = msgId;
            useChatStore.getState().appendMessage(teamId, {
              id: msgId,
              role: "system",
              content: `❌ 연결 끊김 — 자동 재연결 ${state.retry}/5 시도 중. 응답 못 받으면 [재시도] 버튼 클릭`,
              ts: Date.now(),
              streaming: false,
            });
          } catch { /* ignore */ }
        }
        setTimeout(connect, 1000 * state.retry);
      }
    };
    ws.onerror = () => { /* onclose 가 처리 */ };
    ws.onmessage = (e) => handleMessage(teamId, JSON.parse(e.data), agentEmoji, agentName);
  };
  connect();
  return state;
}

function handleMessage(teamId: string, data: Record<string, unknown>, agentEmoji?: string, agentName?: string) {
  const type = data.type as string;
  const store = useChatStore.getState();

  if (type === "user") return;

  // 서버 측 히스토리 복원 — 새로고침/재접속 시 과거 메시지 로드
  if (type === "history_sync") {
    const raw = (data.messages as unknown[]) || [];
    const restored: WsMessage[] = raw.map((m) => {
      const mm = m as Record<string, unknown>;
      return {
        id: (mm.id as string) || crypto.randomUUID(),
        role: (mm.role as "user" | "agent" | "system") || "agent",
        content: (mm.content as string) || "",
        ts: typeof mm.ts === "number" ? (mm.ts as number) : 1, // 서버 ts 없으면 1 (30초 임계값에 걸려 말풍선 재표시 차단)
        agentEmoji: agentEmoji,
        agentName: agentName,
        streaming: false,
      };
    });
    // 클라이언트에 더 최근 메시지가 있을 수도 — 개수 많은 쪽 유지
    const cur = store.messagesByTeam[teamId] ?? [];
    if (restored.length >= cur.length) {
      store.setMessages(teamId, restored);
    }
    // 히스토리 복원 후 streaming 고착 해제 (WS 끊기며 ai_end 못 받은 잔류 해소)
    store.setStreaming(teamId, false);
    store.setToolStatus(teamId, null);
    return;
  }

  if (type === "ai_start") {
    const id = crypto.randomUUID();
    appendMsg(teamId, {
      id, role: "agent", content: "", ts: Date.now(),
      agentEmoji, agentName, streaming: true, tools: [],
    });
    store.setStreaming(teamId, true);
  }
  if (type === "ai_chunk") {
    const chunk = (data.content as string) || "";
    const msgs = store.messagesByTeam[teamId] ?? [];
    const last = msgs[msgs.length - 1];
    if (last?.role === "agent") {
      patchLastAgent(teamId, { content: last.content + chunk });
    }
  }
  if (type === "ai_end") {
    store.setStreaming(teamId, false);
    patchLastAgent(teamId, { streaming: false });

    // 자동 재시도 (품질 검증)
    const state = connections.get(teamId);
    const msgs = store.messagesByTeam[teamId] ?? [];
    const last = msgs[msgs.length - 1];
    if (state?.retryCtx && last?.role === "agent") {
      const parsed = parseArtifacts(last.content);
      const validation = validateParsedResult(parsed);
      if (!validation.valid && state.retryCtx.count < MAX_RETRIES) {
        const nextCount = state.retryCtx.count + 1;
        const ctx = state.retryCtx;
        state.retryCtx = { ...ctx, count: nextCount };
        appendMsg(teamId, {
          id: crypto.randomUUID(), role: "system", ts: Date.now(),
          content: `⟳ 응답 품질 미달 — 자동 재시도 ${nextCount}/${MAX_RETRIES} (${validation.issues.slice(0, 2).join(", ")})`,
          retry: { count: nextCount, issues: validation.issues },
        });
        setTimeout(() => sendRaw(teamId, buildRetryPrompt(validation.issues, ctx.originalPrompt)), 300);
      } else {
        state.retryCtx = null;
        // 백그라운드 완료 통지 (현재 보고 있는 팀인지와 무관하게 콜백 호출)
        const preview = last.content.slice(0, 120).replace(/\n+/g, " ");
        handlers.onBackgroundComplete?.(teamId, preview);
      }
    }
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
    store.setToolStatus(teamId, entry.summary);
    const msgs = store.messagesByTeam[teamId] ?? [];
    const last = msgs[msgs.length - 1];
    if (last?.role === "agent") {
      patchLastAgent(teamId, { tools: [...(last.tools || []), entry] });
    }
    handlers.onToolUse?.(teamId, entry);
  }
  if (type === "tool_result") {
    const id = (data.tool_id as string) || (data.tool as string);
    const isErr = !!(data.is_error as boolean);
    const summary = (data.summary as string) || "";
    const msgs = store.messagesByTeam[teamId] ?? [];
    const last = msgs[msgs.length - 1];
    if (last?.role === "agent" && last.tools) {
      patchLastAgent(teamId, {
        tools: last.tools.map((t) => t.id === id ? { ...t, done: true, error: isErr, resultSummary: summary } : t),
      });
    }
    store.setToolStatus(teamId, null);
  }
  if (type === "status") {
    store.setToolStatus(teamId, (data.content as string) || null);
  }
  if (type === "handoff_request") {
    const payload = data as unknown as HandoffPayload;
    handlers.onHandoff?.(teamId, payload);
    appendMsg(teamId, {
      id: crypto.randomUUID(), role: "system",
      content: `핸드오프 요청 — ${payload.steps?.length || 0}팀`,
      ts: Date.now(), handoff: payload,
    });
  }
  if (type === "error") {
    store.setStreaming(teamId, false);
    const state = connections.get(teamId);
    if (state) state.retryCtx = null;
    appendMsg(teamId, {
      id: crypto.randomUUID(), role: "system",
      content: `⚠️ ${(data.content as string) || "오류"}`, ts: Date.now(),
    });
  }
}

function sendRaw(teamId: string, content: string, images?: string[]) {
  const state = connections.get(teamId);
  const body = JSON.stringify({ prompt: content, images });
  if (state?.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(body);
  } else {
    fetch(`${apiBase()}/api/chat/${teamId}/send`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
    }).catch(() => {});
  }
}

/** 유휴 연결 정리 (1분 주기) */
if (typeof window !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    const store = useChatStore.getState();
    for (const [teamId, state] of connections.entries()) {
      const streaming = store.streamingByTeam[teamId];
      if (streaming) continue; // 작업 중이면 유지
      const last = store.lastActiveByTeam[teamId] ?? 0;
      if (now - last > IDLE_TIMEOUT_MS) {
        state.closed = true;
        state.ws?.close();
        connections.delete(teamId);
      }
    }
  }, 60_000);
}

interface Options {
  teamId: string | null;
  agentEmoji?: string;
  agentName?: string;
  onHandoff?: (h: HandoffPayload) => void;
  onToolUse?: (t: ToolEntry) => void;
}

/** React 훅 — 선택된 팀의 chatStore 상태를 구독. 백그라운드 WS는 별도 모듈 스코프에서 관리 */
export function useChatWs({ teamId, agentEmoji, agentName, onHandoff, onToolUse }: Options) {
  const messages = useChatStore((s) => (teamId ? s.messagesByTeam[teamId] ?? EMPTY : EMPTY));
  const streaming = useChatStore((s) => (teamId ? !!s.streamingByTeam[teamId] : false));
  const toolStatus = useChatStore((s) => (teamId ? s.toolStatusByTeam[teamId] ?? null : null));
  const connected = useConnectedStatus(teamId);

  // 선택된 팀 WS 자동 연결 (이미 연결돼 있으면 건드리지 않음)
  useEffect(() => {
    if (!teamId) return;
    connectTeam(teamId, agentEmoji, agentName);
    useChatStore.getState().clearUnread(teamId);
    useChatStore.getState().touch(teamId);
  }, [teamId, agentEmoji, agentName]);

  // 콜백 등록 — 최신 콜백으로 갱신
  const onHandoffRef = useRef(onHandoff);
  const onToolUseRef = useRef(onToolUse);
  onHandoffRef.current = onHandoff;
  onToolUseRef.current = onToolUse;
  useEffect(() => {
    registerChatHandlers({
      onHandoff: (_tid, h) => onHandoffRef.current?.(h),
      onToolUse: (_tid, t) => onToolUseRef.current?.(t),
      // onBackgroundComplete 는 Hub 페이지가 별도 등록
    });
  }, []);

  const send = useCallback((prompt: string, images?: string[]) => {
    if (!teamId) return false;
    const content = prompt.trim();
    if (!content && !images?.length) return false;
    const state = connections.get(teamId);
    if (state) state.retryCtx = { originalPrompt: content, count: 0 };
    appendMsg(teamId, {
      id: crypto.randomUUID(), role: "user", content, images, ts: Date.now(),
    });
    sendRaw(teamId, content, images);
    return true;
  }, [teamId]);

  const sendDirect = useCallback((content: string) => {
    if (!teamId || !content.trim()) return false;
    appendMsg(teamId, {
      id: crypto.randomUUID(), role: "user", content, ts: Date.now(),
    });
    const state = connections.get(teamId);
    if (state) state.retryCtx = { originalPrompt: content, count: 0 };
    sendRaw(teamId, content);
    return true;
  }, [teamId]);

  const clear = useCallback(() => {
    if (!teamId) return;
    useChatStore.getState().clearMessages(teamId);
  }, [teamId]);

  return { messages, send, sendDirect, clear, streaming, connected, toolStatus };
}

const EMPTY: WsMessage[] = [];

function useConnectedStatus(teamId: string | null): boolean {
  const raw = useChatStore((s) => (teamId ? s.lastActiveByTeam[teamId] : 0));
  void raw;
  if (!teamId) return false;
  const state = connections.get(teamId);
  return !!(state?.ws && state.ws.readyState === WebSocket.OPEN);
}

/** 전역 백그라운드 완료 등록 — Hub 페이지에서 1회 호출 */
export function onBackgroundComplete(fn: (teamId: string, preview: string) => void) {
  registerChatHandlers({ onBackgroundComplete: fn });
}
