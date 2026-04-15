import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Agent, DeskStatus } from "@/types/agent";

interface AgentState {
  agents: Map<string, Agent>;
  selectedAgentId: string | null;

  addAgent: (agent: Agent) => void;
  removeAgent: (agentId: string) => void;
  updateAgent: (agentId: string, updates: Partial<Agent>) => void;
  selectAgent: (agentId: string | null) => void;
  setAgentStatus: (agentId: string, status: DeskStatus) => void;
  updateAgentPosition: (agentId: string, position: { x: number; y: number }) => void;
  getAgent: (agentId: string) => Agent | undefined;
}

export const useAgentStore = create<AgentState>()(persist((set, get) => ({
  agents: new Map(),
  selectedAgentId: null,

  addAgent: (agent) => {
    set((state) => {
      const agents = new Map(state.agents);
      agents.set(agent.id, agent);
      return { agents };
    });
    import("@/lib/analytics").then(({ trackEvent }) => trackEvent("agent_created", { name: agent.name }));
  },

  removeAgent: (agentId) => {
    set((state) => {
      const agents = new Map(state.agents);
      agents.delete(agentId);
      return { agents };
    });
    import("@/lib/analytics").then(({ trackEvent }) => trackEvent("agent_deleted"));
  },

  updateAgent: (agentId, updates) =>
    set((state) => {
      const agents = new Map(state.agents);
      const agent = agents.get(agentId);
      if (agent) {
        agents.set(agentId, { ...agent, ...updates });
      }
      return { agents };
    }),

  selectAgent: (agentId) => set({ selectedAgentId: agentId }),

  setAgentStatus: (agentId, status) =>
    set((state) => {
      const agents = new Map(state.agents);
      const agent = agents.get(agentId);
      if (agent) {
        agents.set(agentId, { ...agent, status });
      }
      return { agents };
    }),

  updateAgentPosition: (agentId, position) =>
    set((state) => {
      const agents = new Map(state.agents);
      const agent = agents.get(agentId);
      if (agent) {
        agents.set(agentId, { ...agent, position });
      }
      return { agents };
    }),

  getAgent: (agentId) => get().agents.get(agentId),
}), {
  name: "teammaker-agents",
  storage: {
    getItem: (name) => {
      const str = localStorage.getItem(name);
      if (!str) return null;
      const parsed = JSON.parse(str);
      // Restore Map from array of entries
      if (parsed.state?.agents) {
        parsed.state.agents = new Map(parsed.state.agents);
      }
      return parsed;
    },
    setItem: (name, value) => {
      // Serialize Map as array of entries
      const serializable = {
        ...value,
        state: {
          ...value.state,
          agents: Array.from((value.state as AgentState).agents.entries()),
        },
      };
      localStorage.setItem(name, JSON.stringify(serializable));
    },
    removeItem: (name) => localStorage.removeItem(name),
  },
}));
