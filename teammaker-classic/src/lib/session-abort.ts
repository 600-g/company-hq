/**
 * Module-level AbortController for cancelling in-flight API calls
 * when a session is switched or deleted.
 *
 * NOTE: Store imports are lazy (dynamic import) to avoid circular dependency:
 * sessionStore → session-abort → chatStore → sessionStore
 */

let controller: AbortController | null = null;

/** Create a new AbortController for the current work session and return its signal. */
export function createSessionAbort(): AbortSignal {
  // Abort any previous controller first
  controller?.abort();
  controller = new AbortController();
  return controller.signal;
}

/** Abort the current work and clean up all running state. */
export function abortCurrentWork(): void {
  // 1. Abort in-flight fetch calls
  controller?.abort();
  controller = null;

  // 2. Lazy-import stores to avoid circular dependency
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAgentStore } = require("@/stores/agentStore");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useBubbleStore } = require("@/stores/bubbleStore");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useChatStore } = require("@/stores/chatStore");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { usePipelineStore } = require("@/stores/pipelineStore");

  // 3. Reset all "working" agents to "idle"
  const agentStore = useAgentStore.getState();
  for (const agent of agentStore.agents.values()) {
    if (agent.status === "working") {
      agentStore.setAgentStatus(agent.id, "idle");
    }
  }

  // 4. Clear all speech bubbles
  useBubbleStore.getState().clearBubbles();

  // 5. Clear active pipeline
  usePipelineStore.getState().clearPipeline();

  // 6. Reset chat phase and typing
  useChatStore.setState({ phase: "idle", isTyping: false, typingStatus: null });
}
