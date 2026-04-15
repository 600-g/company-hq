import type { ChatMessage } from "@/types/chat";
import type { DeskStatus } from "@/types/agent";

export interface Session {
  id: string;
  title: string;
  projectName: string;
  workingDirectory: string;
  messages: ChatMessage[];
  /** Per-agent status snapshot (saved on session switch) */
  agentStatuses?: Record<string, DeskStatus>;
  storageType?: "database" | "localStorage" | "none";
  supabaseProjectId?: string;
  githubRepo?: string;
  createdAt: number;
  updatedAt: number;
}
