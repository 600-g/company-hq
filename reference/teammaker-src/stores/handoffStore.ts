import { create } from "zustand";

export interface HandoffEvent {
  id: string;
  fromAgentId: string;
  toAgentId: string;
}

export interface AgentWalkEvent {
  id: string;
  agentId: string;
}

interface HandoffStore {
  activeHandoff: HandoffEvent | null;
  triggerHandoff: (fromAgentId: string, toAgentId: string) => Promise<void>;
  /** Called by canvas when animation finishes */
  clearHandoff: () => void;
  /** Resolve function for the current handoff promise */
  _resolve: (() => void) | null;

  /** Walk-to-manager animation state */
  walkToManagerAgent: AgentWalkEvent | null;
  _walkToManagerResolve: (() => void) | null;
  triggerWalkToManager: (agentId: string) => Promise<void>;
  clearWalkToManager: () => void;

  /** Walk-from-manager animation state */
  walkFromManagerAgent: AgentWalkEvent | null;
  _walkFromManagerResolve: (() => void) | null;
  triggerWalkFromManager: (agentId: string) => Promise<void>;
  clearWalkFromManager: () => void;
}

export const useHandoffStore = create<HandoffStore>((set, get) => ({
  activeHandoff: null,
  _resolve: null,

  triggerHandoff: (fromAgentId, toAgentId) =>
    new Promise<void>((resolve) => {
      set({
        activeHandoff: {
          id: `${Date.now()}`,
          fromAgentId,
          toAgentId,
        },
        _resolve: resolve,
      });
    }),

  clearHandoff: () => {
    const { _resolve } = get();
    _resolve?.();
    set({ activeHandoff: null, _resolve: null });
  },

  // Walk to manager
  walkToManagerAgent: null,
  _walkToManagerResolve: null,

  triggerWalkToManager: (agentId) =>
    new Promise<void>((resolve) => {
      set({
        walkToManagerAgent: { id: `wtm-${Date.now()}`, agentId },
        _walkToManagerResolve: resolve,
      });
    }),

  clearWalkToManager: () => {
    const { _walkToManagerResolve } = get();
    _walkToManagerResolve?.();
    set({ walkToManagerAgent: null, _walkToManagerResolve: null });
  },

  // Walk from manager
  walkFromManagerAgent: null,
  _walkFromManagerResolve: null,

  triggerWalkFromManager: (agentId) =>
    new Promise<void>((resolve) => {
      set({
        walkFromManagerAgent: { id: `wfm-${Date.now()}`, agentId },
        _walkFromManagerResolve: resolve,
      });
    }),

  clearWalkFromManager: () => {
    const { _walkFromManagerResolve } = get();
    _walkFromManagerResolve?.();
    set({ walkFromManagerAgent: null, _walkFromManagerResolve: null });
  },
}));
