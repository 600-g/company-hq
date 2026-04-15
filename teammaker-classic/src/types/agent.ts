export type DeskStatus = "idle" | "working" | "complete" | "error";

export interface Agent {
  id: string;
  name: string;
  description: string;
  role: string;
  outputHint?: string;
  status: DeskStatus;
  position: { x: number; y: number };
  currentTaskId?: string;
  currentTask?: string;
}
