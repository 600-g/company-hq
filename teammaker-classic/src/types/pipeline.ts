import type { Artifact } from "./artifact";

export type StepStatus = "pending" | "running" | "completed" | "failed";

export interface AgentStep {
  agentId: string;
  agentName: string;
  status: StepStatus;
  startedAt?: number;
  completedAt?: number;
  result?: { summary: string; artifacts: Artifact[] };
  error?: string;
  retryCount: number;
}

export type StorageType = "database" | "localStorage" | "none";

export interface SupabaseInfo {
  projectId: string;
  projectUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

export interface PipelineState {
  id: string;
  sessionId: string;
  spec: string;
  projectType?: string;
  framework?: string;
  storageType?: StorageType;
  supabase?: SupabaseInfo;
  steps: AgentStep[];
  status: StepStatus;
  createdAt: number;
  updatedAt: number;
}
