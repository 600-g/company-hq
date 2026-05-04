"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WsMessage } from "@/lib/useChatWs";

/**
 * 멀티팀 채팅 상태 저장소.
 *  - 팀별 messages / streaming / toolStatus / unread 카운트 / 마지막 활동 시각
 *  - 에이전트 전환/페이지 이동해도 각 팀 메시지 유지
 *  - 백그라운드 완료 팀 unread 뱃지
 *  - persist: 최근 50 메시지만 (새로고침 시 복원, localStorage 크기 제한)
 */

const EMPTY_MESSAGES: WsMessage[] = [];

interface ChatState {
  messagesByTeam: Record<string, WsMessage[]>;
  streamingByTeam: Record<string, boolean>;
  toolStatusByTeam: Record<string, string | null>;
  unreadByTeam: Record<string, number>;
  /** 마지막 활동 시각 (ms) — 오래된 팀 WS 정리용 */
  lastActiveByTeam: Record<string, number>;

  setMessages: (teamId: string, messages: WsMessage[] | ((prev: WsMessage[]) => WsMessage[])) => void;
  appendMessage: (teamId: string, msg: WsMessage) => void;
  updateLastMessage: (teamId: string, patch: Partial<WsMessage>) => void;
  clearMessages: (teamId: string) => void;

  setStreaming: (teamId: string, v: boolean) => void;
  setToolStatus: (teamId: string, v: string | null) => void;

  markUnread: (teamId: string, count?: number) => void;
  clearUnread: (teamId: string) => void;

  touch: (teamId: string) => void;
  getMessages: (teamId: string | null) => WsMessage[];
}

export const useChatStore = create<ChatState>()(persist((set, get) => ({
  messagesByTeam: {},
  streamingByTeam: {},
  toolStatusByTeam: {},
  unreadByTeam: {},
  lastActiveByTeam: {},

  setMessages: (teamId, next) =>
    set((s) => {
      const prev = s.messagesByTeam[teamId] ?? EMPTY_MESSAGES;
      const arr = typeof next === "function" ? next(prev) : next;
      return { messagesByTeam: { ...s.messagesByTeam, [teamId]: arr } };
    }),

  appendMessage: (teamId, msg) =>
    set((s) => ({
      messagesByTeam: {
        ...s.messagesByTeam,
        [teamId]: [...(s.messagesByTeam[teamId] ?? EMPTY_MESSAGES), msg],
      },
      lastActiveByTeam: { ...s.lastActiveByTeam, [teamId]: Date.now() },
    })),

  updateLastMessage: (teamId, patch) =>
    set((s) => {
      const arr = s.messagesByTeam[teamId] ?? EMPTY_MESSAGES;
      if (arr.length === 0) return {};
      const next = [...arr];
      next[next.length - 1] = { ...next[next.length - 1], ...patch };
      return { messagesByTeam: { ...s.messagesByTeam, [teamId]: next } };
    }),

  clearMessages: (teamId) =>
    set((s) => ({ messagesByTeam: { ...s.messagesByTeam, [teamId]: [] } })),

  setStreaming: (teamId, v) =>
    set((s) => ({ streamingByTeam: { ...s.streamingByTeam, [teamId]: v } })),

  setToolStatus: (teamId, v) =>
    set((s) => ({ toolStatusByTeam: { ...s.toolStatusByTeam, [teamId]: v } })),

  markUnread: (teamId, count = 1) =>
    set((s) => ({
      unreadByTeam: { ...s.unreadByTeam, [teamId]: (s.unreadByTeam[teamId] ?? 0) + count },
    })),

  clearUnread: (teamId) =>
    set((s) => ({ unreadByTeam: { ...s.unreadByTeam, [teamId]: 0 } })),

  touch: (teamId) =>
    set((s) => ({ lastActiveByTeam: { ...s.lastActiveByTeam, [teamId]: Date.now() } })),

  getMessages: (teamId) => {
    if (!teamId) return EMPTY_MESSAGES;
    return get().messagesByTeam[teamId] ?? EMPTY_MESSAGES;
  },
}), {
  name: "doogeun-hq-chat",
  // 각 팀 최근 10 메시지 + content 5KB 자르기 — localStorage 용량 ↓↓ + hydrate 속도 ↑↑
  // 화면 진입 직후 server history_sync (WS) 가 풀 히스토리 복원하므로 영속 분량 작아도 OK
  partialize: (state) => ({
    messagesByTeam: Object.fromEntries(
      Object.entries(state.messagesByTeam).map(([k, v]) => [
        k,
        v.slice(-10).map((m) => {
          // 너무 긴 메시지는 truncate (코드 블록·로그 등이 localStorage 폭주 유발)
          // 큰 첨부(images base64, tools 출력) 도 영속에서 제거 — 화면 진입 시 server history_sync 가 풀 복원
          const content = typeof m.content === "string" && m.content.length > 5000
            ? m.content.slice(0, 5000) + "\n\n[…잘림 — 전체는 server 에서 자동 복원]"
            : m.content;
          const compact = { ...m, content } as WsMessage & { images?: unknown; tools?: unknown };
          delete compact.images;
          delete compact.tools;
          return compact as WsMessage;
        }),
      ])
    ),
    unreadByTeam: state.unreadByTeam,
    lastActiveByTeam: state.lastActiveByTeam,
  }),
}));
