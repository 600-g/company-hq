import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useSessionStore } from "@/stores/sessionStore";

interface ProjectState {
  workingDirectory: string | null;
  setWorkingDirectory: (dir: string | null) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      workingDirectory: null,
      setWorkingDirectory: (dir) => set({ workingDirectory: dir }),
    }),
    { name: "teammaker-project" }
  )
);

// Sync workingDirectory when active session changes
useSessionStore.subscribe((state) => {
  const activeSession = state.sessions.find(
    (s) => s.id === state.activeSessionId
  );
  if (activeSession?.workingDirectory) {
    useProjectStore.getState().setWorkingDirectory(activeSession.workingDirectory);
  }
});
