export type TaskStatus = "queued" | "routing" | "in_progress" | "complete" | "error";

export interface SubTask {
  id: string;
  agentId: string;
  description: string;
  status: TaskStatus;
  result?: string;
}

export interface Task {
  id: string;
  input: string;
  agentIds: string[];
  subTasks: SubTask[];
  status: TaskStatus;
  result?: string;
  createdAt: number;
  completedAt?: number;
}
