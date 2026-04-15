import { create } from "zustand";

interface UIState {
  isAgentCreateOpen: boolean;
  isAgentConfigOpen: boolean;
  isDetailPanelOpen: boolean;
  isPaletteCollapsed: boolean;
  showTerminalPanel: boolean;
  onboardingStep: number | null;
  hasCompletedOnboarding: boolean;

  // Agent creation flow state
  pendingAgentPosition: { x: number; y: number } | null;

  openAgentCreate: (position?: { x: number; y: number }) => void;
  closeAgentCreate: () => void;
  openAgentConfig: () => void;
  closeAgentConfig: () => void;
  openDetailPanel: () => void;
  closeDetailPanel: () => void;
  togglePalette: () => void;
  openTerminalPanel: () => void;
  closeTerminalPanel: () => void;
  advanceOnboarding: () => void;
  completeOnboarding: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  isAgentCreateOpen: false,
  isAgentConfigOpen: false,
  isDetailPanelOpen: false,
  isPaletteCollapsed: false,
  showTerminalPanel: false,
  onboardingStep: 0,
  hasCompletedOnboarding: false,
  pendingAgentPosition: null,

  openAgentCreate: (position) =>
    set({
      isAgentCreateOpen: true,
      pendingAgentPosition: position ?? null,
    }),
  closeAgentCreate: () =>
    set({ isAgentCreateOpen: false, pendingAgentPosition: null }),
  openAgentConfig: () =>
    set({ isAgentConfigOpen: true, isAgentCreateOpen: false }),
  closeAgentConfig: () => set({ isAgentConfigOpen: false }),
  openDetailPanel: () =>
    set({ isDetailPanelOpen: true }),
  closeDetailPanel: () => set({ isDetailPanelOpen: false }),
  togglePalette: () =>
    set((state) => ({ isPaletteCollapsed: !state.isPaletteCollapsed })),
  openTerminalPanel: () => set({ showTerminalPanel: true }),
  closeTerminalPanel: () => set({ showTerminalPanel: false }),
  advanceOnboarding: () =>
    set((state) => ({
      onboardingStep:
        state.onboardingStep !== null ? state.onboardingStep + 1 : null,
    })),
  completeOnboarding: () =>
    set({ onboardingStep: null, hasCompletedOnboarding: true }),
}));
