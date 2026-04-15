import type { Artifact } from "@/types/artifact";

export type MessageType = "user" | "ai" | "system";

export interface ChatMessage {
  id: string;
  type: MessageType;
  content: string;
  timestamp: number;
  taskId?: string;
  agentName?: string;
  artifacts?: Artifact[];
}
