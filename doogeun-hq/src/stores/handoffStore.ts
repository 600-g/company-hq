"use client";

import { create } from "zustand";

/** 캐릭터 walk 애니메이션 트리거 (TM handoffStore 경량 이식).
 *   - walkTo: 관리자/다른 에이전트 책상으로 이동 (대기 + 핸드오프 시각화)
 *   - walkHome: 자리 복귀
 *   - 파이어앤포켓 패턴 — HubOffice 가 이벤트 감지 후 트윈 재생, 끝나면 clearWalk()
 */

export type WalkDestination = "manager" | "home" | { x: number; y: number };

export interface WalkEvent {
  id: string;
  agentId: string;
  dest: WalkDestination;
  startedAt: number;
}

interface HandoffStore {
  activeWalk: WalkEvent | null;
  walkQueue: WalkEvent[];
  _resolve: (() => void) | null;

  triggerWalk(agentId: string, dest: WalkDestination): Promise<void>;
  clearWalk(): void;
  cancelAll(): void;
}

export const useHandoffStore = create<HandoffStore>((set, get) => ({
  activeWalk: null,
  walkQueue: [],
  _resolve: null,

  triggerWalk(agentId, dest) {
    return new Promise<void>((resolve) => {
      const event: WalkEvent = {
        id: `walk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        agentId,
        dest,
        startedAt: Date.now(),
      };
      const state = get();
      // 이미 진행 중이면 큐에 쌓고, 현재 resolve 만 별도 관리 (단일 active)
      if (state.activeWalk) {
        set({ walkQueue: [...state.walkQueue, event] });
        // 순서 보장 위해 큐에서 꺼내질 때 resolve
        const pump = () => {
          const s = get();
          if (s.activeWalk?.id === event.id) {
            const prev = s._resolve;
            set({
              _resolve: () => {
                prev?.();
                resolve();
              },
            });
          } else {
            setTimeout(pump, 60);
          }
        };
        setTimeout(pump, 60);
        return;
      }
      set({ activeWalk: event, _resolve: resolve });
    });
  },

  clearWalk() {
    const { _resolve, walkQueue } = get();
    _resolve?.();
    // 큐에 다음 있으면 즉시 착수
    if (walkQueue.length > 0) {
      const [next, ...rest] = walkQueue;
      set({ activeWalk: next, walkQueue: rest, _resolve: null });
    } else {
      set({ activeWalk: null, _resolve: null });
    }
  },

  cancelAll() {
    const { _resolve } = get();
    _resolve?.();
    set({ activeWalk: null, walkQueue: [], _resolve: null });
  },
}));
