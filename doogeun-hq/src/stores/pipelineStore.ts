"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 디스패치 파이프라인 상태 추적 (TM pipelineStore 경량 이식) */

export type StepStatus = "pending" | "running" | "completed" | "failed";

export interface PipelineStep {
  agentId: string;
  agentName: string;
  agentEmoji?: string;
  prompt?: string;
  status: StepStatus;
  retryCount: number;
  startedAt?: number;
  completedAt?: number;
  summary?: string;
  error?: string;
}

export interface PipelineState {
  id: string;
  spec: string;
  dispatchId?: string;
  steps: PipelineStep[];
  status: StepStatus;
  createdAt: number;
  updatedAt: number;
}

interface PipelineStore {
  active: PipelineState | null;
  start(spec: string, steps: Omit<PipelineStep, "status" | "retryCount">[], dispatchId?: string): PipelineState;
  updateStep(index: number, patch: Partial<PipelineStep>): void;
  setStepStatus(index: number, status: StepStatus, meta?: { summary?: string; error?: string }): void;
  incrementRetry(index: number): void;
  completeAll(): void;
  clear(): void;
  findStepIndex(agentId: string): number;
}

export const usePipelineStore = create<PipelineStore>()(
  persist(
    (set, get) => ({
      active: null,

      start(spec, steps, dispatchId) {
        const state: PipelineState = {
          id: crypto.randomUUID(),
          spec,
          dispatchId,
          steps: steps.map((s) => ({ ...s, status: "pending", retryCount: 0 })),
          status: "running",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set({ active: state });
        return state;
      },

      updateStep(index, patch) {
        const active = get().active;
        if (!active) return;
        const steps = [...active.steps];
        if (!steps[index]) return;
        steps[index] = { ...steps[index], ...patch };
        set({ active: { ...active, steps, updatedAt: Date.now() } });
      },

      setStepStatus(index, status, meta) {
        const active = get().active;
        if (!active) return;
        const steps = [...active.steps];
        if (!steps[index]) return;
        const step = { ...steps[index], status };
        if (status === "running") step.startedAt = Date.now();
        if (status === "completed" || status === "failed") step.completedAt = Date.now();
        if (meta?.summary) step.summary = meta.summary;
        if (meta?.error) step.error = meta.error;
        steps[index] = step;

        const allCompleted = steps.every((s) => s.status === "completed");
        const anyFailed = steps.some((s) => s.status === "failed");
        const pipelineStatus: StepStatus = allCompleted ? "completed" : anyFailed ? "failed" : "running";

        set({ active: { ...active, steps, status: pipelineStatus, updatedAt: Date.now() } });
      },

      incrementRetry(index) {
        const active = get().active;
        if (!active) return;
        const steps = [...active.steps];
        if (!steps[index]) return;
        steps[index] = {
          ...steps[index],
          retryCount: steps[index].retryCount + 1,
          status: "running",
          error: undefined,
        };
        set({ active: { ...active, steps, updatedAt: Date.now() } });
      },

      completeAll() {
        const active = get().active;
        if (!active) return;
        const steps = active.steps.map((s) =>
          s.status === "running" || s.status === "pending"
            ? { ...s, status: "completed" as const, completedAt: Date.now() }
            : s,
        );
        set({ active: { ...active, steps, status: "completed", updatedAt: Date.now() } });
      },

      clear() {
        set({ active: null });
      },

      findStepIndex(agentId) {
        return get().active?.steps.findIndex((s) => s.agentId === agentId) ?? -1;
      },
    }),
    {
      name: "doogeun-hq-pipeline",
      partialize: (state) => ({ active: state.active }),
    },
  ),
);
