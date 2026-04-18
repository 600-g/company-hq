"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AgentStatus = "idle" | "working" | "complete" | "error";

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  description: string;
  /** MD 기반 시스템 프롬프트 (사용자가 직접 붙여넣기 가능) */
  systemPromptMd: string;
  /** 작업 디렉토리 (ui/app/... 같은 절대/상대 경로) */
  workingDirectory?: string;
  /** GitHub 레포 "owner/name" */
  githubRepo?: string;
  status: AgentStatus;
  floor: number;
  /** 오피스 내 위치 */
  position?: { x: number; y: number };
  createdAt: number;
  updatedAt: number;
  /** 활동 타임라인 (스펙 정리용) */
  activity: { ts: number; text: string }[];
}

interface AgentState {
  agents: Agent[];
  addAgent: (a: Omit<Agent, "id" | "createdAt" | "updatedAt" | "activity" | "status" | "floor">) => Agent;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  removeAgent: (id: string) => void;
  logActivity: (id: string, text: string) => void;
  getById: (id: string) => Agent | null;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      agents: [],
      addAgent: (a) => {
        const now = Date.now();
        const agent: Agent = {
          ...a,
          id: crypto.randomUUID(),
          status: "idle",
          floor: 1,
          createdAt: now,
          updatedAt: now,
          activity: [{ ts: now, text: `에이전트 생성 — ${a.name}` }],
        };
        set((s) => ({ agents: [...s.agents, agent] }));
        return agent;
      },
      updateAgent: (id, patch) =>
        set((s) => ({
          agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a)),
        })),
      removeAgent: (id) => set((s) => ({ agents: s.agents.filter((a) => a.id !== id) })),
      logActivity: (id, text) =>
        set((s) => ({
          agents: s.agents.map((a) =>
            a.id === id
              ? {
                  ...a,
                  activity: [...a.activity, { ts: Date.now(), text }].slice(-100),
                  updatedAt: Date.now(),
                }
              : a
          ),
        })),
      getById: (id) => get().agents.find((a) => a.id === id) ?? null,
    }),
    { name: "doogeun-hq-agents" }
  )
);
