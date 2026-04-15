import { create } from "zustand";
import { useSessionStore } from "@/stores/sessionStore";
import type { ChatMessage } from "@/types/chat";

export type ChatPhase = "idle" | "refining" | "executing";

interface ChatState {
  messages: ChatMessage[];
  isExpanded: boolean;
  isTyping: boolean;
  typingStatus: string | null;
  phase: ChatPhase;

  addMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => void;
  setExpanded: (expanded: boolean) => void;
  setTyping: (typing: boolean) => void;
  setTypingStatus: (status: string | null) => void;
  setPhase: (phase: ChatPhase) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  isExpanded: false,
  isTyping: false,
  typingStatus: null,
  phase: "idle",

  addMessage: (message) => {
    const sessionStore = useSessionStore.getState();
    let { activeSessionId } = sessionStore;

    if (!activeSessionId) {
      activeSessionId = sessionStore.createSession();
    }

    sessionStore.addMessageToSession(activeSessionId, message);

    const activeSession = useSessionStore.getState().activeSession();
    set({ messages: activeSession?.messages ?? [] });
  },

  setExpanded: (expanded) => set({ isExpanded: expanded }),
  setTyping: (typing) => set({ isTyping: typing, ...(typing ? {} : { typingStatus: null }) }),
  setTypingStatus: (status) => set({ typingStatus: status }),
  setPhase: (phase) => set({ phase }),
  clearMessages: () => set({ messages: [], phase: "idle" }),
}));

// Sync messages when active session changes (e.g. switching sessions or rehydrate)
let _prevActiveSessionId: string | null = null;
useSessionStore.subscribe((state) => {
  const activeSession = state.sessions.find(
    (s) => s.id === state.activeSessionId
  );
  const sessionChanged = state.activeSessionId !== _prevActiveSessionId;
  _prevActiveSessionId = state.activeSessionId;

  const sessionMessages = activeSession?.messages ?? [];

  if (sessionChanged) {
    // Reset phase only on session switch
    useChatStore.setState({
      messages: sessionMessages,
      phase: "idle",
    });
  } else {
    // Within same session: sync only messages (preserve phase)
    // Also sync here on persist rehydrate (when chatStore messages are empty)
    const currentMessages = useChatStore.getState().messages;
    if (currentMessages.length === 0 && sessionMessages.length > 0) {
      useChatStore.setState({ messages: sessionMessages });
    } else if (sessionMessages !== currentMessages) {
      useChatStore.setState({ messages: sessionMessages });
    }
  }
});
