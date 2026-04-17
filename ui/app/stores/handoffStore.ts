"use client";
import { create } from "zustand";

/** Phase 7: 핸드오프 애니메이션 상태. 팀메이커 handoffStore 등가물 (경량). */
export interface HandoffEvent {
  id: string;
  from: string;
  to: string;
  at: number;
}

export interface HandoffState {
  active: HandoffEvent | null;
  history: HandoffEvent[];

  trigger: (from: string, to: string) => string;
  clear: () => void;
}

export const useHandoffStore = create<HandoffState>((set) => ({
  active: null,
  history: [],
  trigger: (from, to) => {
    const id = `${Date.now()}-${from}-${to}`;
    const ev: HandoffEvent = { id, from, to, at: Date.now() };
    set((s) => ({ active: ev, history: [...s.history, ev].slice(-50) }));
    // 디스패치 이벤트 (OfficeScene 리스너가 이미 hq:walk 처리)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("hq:walk", { detail: { from, to } }));
    }
    return id;
  },
  clear: () => set({ active: null }),
}));
