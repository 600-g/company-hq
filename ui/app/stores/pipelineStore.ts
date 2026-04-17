"use client";
import { create } from "zustand";

/** Phase 7: 현재 진행 중 파이프라인 상태. 팀메이커 pipelineStore 등가물 (경량). */
export type StepStatus = "pending" | "running" | "done" | "error";

export interface PipelineBatch {
  teams: string[];
  parallel: boolean;
  startedAt: number;
  endedAt?: number;
  results?: Record<string, { status: StepStatus; summary?: string; error?: string }>;
}

export interface PipelineState {
  dispatchId: string | null;
  batches: PipelineBatch[];
  directMode: boolean;

  start: (dispatchId: string, directMode?: boolean) => void;
  addBatch: (b: Omit<PipelineBatch, "startedAt">) => void;
  markTeamDone: (teamIds: string[]) => void;
  finish: () => void;
  clear: () => void;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  dispatchId: null,
  batches: [],
  directMode: false,
  start: (dispatchId, directMode = false) => set({ dispatchId, batches: [], directMode }),
  addBatch: (b) => set((s) => ({
    batches: [...s.batches, { ...b, startedAt: Date.now() }],
  })),
  markTeamDone: (teamIds) => set((s) => ({
    batches: s.batches.map(b => ({
      ...b,
      results: {
        ...(b.results || {}),
        ...Object.fromEntries(teamIds.filter(t => b.teams.includes(t)).map(t => [t, { status: "done" as const }])),
      },
    })),
  })),
  finish: () => set((s) => ({
    batches: s.batches.map(b => b.endedAt ? b : { ...b, endedAt: Date.now() }),
  })),
  clear: () => set({ dispatchId: null, batches: [], directMode: false }),
}));
