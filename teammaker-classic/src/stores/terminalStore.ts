import { create } from "zustand";
import type { Artifact } from "@/types/artifact";

export interface TerminalLine {
  text: string;
  stream: "stdout" | "stderr";
  timestamp: number;
}

export interface TerminalProcess {
  id: string;
  command: string;
  cwd: string;
  status: "running" | "exited";
  exitCode?: number;
  lines: TerminalLine[];
  detectedUrl?: string;
  sourceArtifacts?: Artifact[];
}

interface TerminalState {
  processes: TerminalProcess[];
  activeProcessId: string | null;

  addProcess: (proc: Omit<TerminalProcess, "lines" | "status" | "detectedUrl">) => void;
  appendLine: (id: string, line: TerminalLine) => void;
  setExited: (id: string, code: number) => void;
  setActive: (id: string | null) => void;
  clearProcess: (id: string) => void;
  setDetectedUrl: (id: string, url: string) => void;
}

export const useTerminalStore = create<TerminalState>()((set) => ({
  processes: [],
  activeProcessId: null,

  addProcess: (proc) =>
    set((state) => ({
      processes: [
        ...state.processes,
        { ...proc, status: "running", lines: [] },
      ],
      activeProcessId: proc.id,
    })),

  appendLine: (id, line) =>
    set((state) => ({
      processes: state.processes.map((p) =>
        p.id === id ? { ...p, lines: [...p.lines, line] } : p
      ),
    })),

  setExited: (id, code) =>
    set((state) => ({
      processes: state.processes.map((p) =>
        p.id === id ? { ...p, status: "exited", exitCode: code } : p
      ),
    })),

  setActive: (id) => set({ activeProcessId: id }),

  clearProcess: (id) =>
    set((state) => ({
      processes: state.processes.filter((p) => p.id !== id),
      activeProcessId:
        state.activeProcessId === id ? null : state.activeProcessId,
    })),

  setDetectedUrl: (id, url) =>
    set((state) => ({
      processes: state.processes.map((p) =>
        p.id === id ? { ...p, detectedUrl: url } : p
      ),
    })),
}));
