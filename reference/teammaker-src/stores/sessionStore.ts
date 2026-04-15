import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session } from "@/types/session";
import type { ChatMessage } from "@/types/chat";
import type { DeskStatus } from "@/types/agent";
import { generateProjectName } from "@/lib/nameGenerator";
import { abortCurrentWork } from "@/lib/session-abort";
import { trackEvent } from "@/lib/analytics";
import { useBillingStore } from "@/stores/billingStore";

/** Snapshot current agent statuses from agentStore */
function snapshotAgentStatuses(): Record<string, DeskStatus> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAgentStore } = require("@/stores/agentStore");
  const agents = useAgentStore.getState().agents as Map<string, { id: string; status: DeskStatus }>;
  const statuses: Record<string, DeskStatus> = {};
  for (const [id, agent] of agents) {
    statuses[id] = agent.status;
  }
  return statuses;
}

/** Restore agent statuses from a session's snapshot (default to "idle") */
function restoreAgentStatuses(statuses?: Record<string, DeskStatus>): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAgentStore } = require("@/stores/agentStore");
  const agentStore = useAgentStore.getState();
  for (const agent of agentStore.agents.values()) {
    const saved = statuses?.[agent.id] ?? "idle";
    if (agent.status !== saved) {
      agentStore.setAgentStatus(agent.id, saved);
    }
  }
}

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;

  activeSession: () => Session | null;
  createSession: () => string;
  updateSessionDirectory: (sessionId: string, workingDirectory: string) => void;
  updateSessionStorageType: (sessionId: string, storageType: Session["storageType"]) => void;
  updateSessionSupabaseProjectId: (sessionId: string, supabaseProjectId: string) => void;
  updateSessionGithubRepo: (sessionId: string, githubRepo: string) => void;
  switchSession: (sessionId: string) => void;
  addMessageToSession: (
    sessionId: string,
    message: Omit<ChatMessage, "id" | "timestamp">
  ) => void;
  deleteSession: (sessionId: string) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,

      activeSession: () => {
        const { sessions, activeSessionId } = get();
        return sessions.find((s) => s.id === activeSessionId) ?? null;
      },

      createSession: () => {
        const { sessions: existingSessions, activeSessionId: currentActiveId } = get();
        const sessionLimit = useBillingStore.getState().getSessionLimit();
        if (existingSessions.length >= sessionLimit) {
          return currentActiveId ?? existingSessions[0]?.id ?? "";
        }
        trackEvent("session_created");
        const id = crypto.randomUUID();
        const now = Date.now();
        const existingNames = get().sessions.map((s) => s.projectName);
        const projectName = generateProjectName(existingNames);
        const session: Session = {
          id,
          title: projectName,
          projectName,
          workingDirectory: "",
          messages: [],
          createdAt: now,
          updatedAt: now,
        };

        // Save agent status snapshot for current session
        const current = get().activeSessionId;
        if (current) {
          const statuses = snapshotAgentStatuses();
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === current ? { ...s, agentStatuses: statuses } : s
            ),
          }));
        }

        set((state) => ({
          sessions: [session, ...state.sessions],
          activeSessionId: id,
        }));
        // New session has no state — reset all agents to idle
        restoreAgentStatuses(undefined);

        // Create project directory via API
        fetch("/api/fs/create-project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectName }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.dirPath) {
              get().updateSessionDirectory(id, data.dirPath);
            }
          })
          .catch(console.error);

        return id;
      },

      updateSessionDirectory: (sessionId, workingDirectory) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, workingDirectory } : s
          ),
        })),

      updateSessionStorageType: (sessionId, storageType) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, storageType, updatedAt: Date.now() } : s
          ),
        })),

      updateSessionSupabaseProjectId: (sessionId, supabaseProjectId) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, supabaseProjectId, updatedAt: Date.now() } : s
          ),
        })),

      updateSessionGithubRepo: (sessionId, githubRepo) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, githubRepo, updatedAt: Date.now() } : s
          ),
        })),

      switchSession: (sessionId) => {
        const current = get().activeSessionId;
        if (current && current !== sessionId) {
          abortCurrentWork();
          // Save agent status snapshot for current session
          const statuses = snapshotAgentStatuses();
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === current ? { ...s, agentStatuses: statuses } : s
            ),
          }));
        }
        set({ activeSessionId: sessionId });
        // Restore agent statuses for the new session
        const targetSession = get().sessions.find((s) => s.id === sessionId);
        restoreAgentStatuses(targetSession?.agentStatuses);
      },

      addMessageToSession: (sessionId, message) => {
        const newMessage: ChatMessage = {
          ...message,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        };
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s;
            const messages = [...s.messages, newMessage];
            const title =
              s.title === "" && message.type === "user"
                ? message.content.trim().slice(0, 80)
                : s.title;
            return { ...s, messages, title, updatedAt: Date.now() };
          }),
        }));
      },

      deleteSession: (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        const isActive = get().activeSessionId === sessionId;
        trackEvent("session_deleted");

        // Abort in-progress work when deleting active session
        if (isActive) {
          abortCurrentWork();
        }

        // Delete project folder
        if (session?.workingDirectory) {
          fetch("/api/fs/delete-project", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dirPath: session.workingDirectory }),
          }).catch(console.error);
        }

        set((state) => {
          const sessions = state.sessions.filter((s) => s.id !== sessionId);
          const newActiveId =
            state.activeSessionId === sessionId
              ? sessions[0]?.id ?? null
              : state.activeSessionId;
          return { sessions, activeSessionId: newActiveId };
        });

        // Restore agent statuses for the newly active session after deletion
        if (isActive) {
          const newActive = get().sessions.find((s) => s.id === get().activeSessionId);
          restoreAgentStatuses(newActive?.agentStatuses);
        }
      },
    }),
    { name: "teammaker-sessions" },
  )
);
