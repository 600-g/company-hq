import { create } from "zustand";

export type BubbleVariant = "loading" | "result";

export interface SpeechBubble {
  id: string;
  targetType: "manager" | "agent";
  targetId?: string;
  text: string;
  variant: BubbleVariant;
  createdAt: number;
}

interface BubbleState {
  bubbles: SpeechBubble[];
  addBubble: (bubble: Omit<SpeechBubble, "id" | "createdAt">) => string;
  updateBubble: (id: string, text: string) => void;
  removeBubble: (id: string) => void;
  clearBubbles: () => void;
  clearBubblesForTarget: (targetType: "manager" | "agent", targetId?: string) => void;
}

const RESULT_DURATION = 6000;

export const useBubbleStore = create<BubbleState>()((set) => ({
  bubbles: [],

  addBubble: (bubble) => {
    const id = crypto.randomUUID();
    const newBubble: SpeechBubble = { ...bubble, id, createdAt: Date.now() };

    set((state) => ({
      bubbles: [...state.bubbles, newBubble],
    }));

    // Result bubbles auto-dismiss; loading bubbles persist until removed
    if (bubble.variant === "result") {
      setTimeout(() => {
        set((state) => ({
          bubbles: state.bubbles.filter((b) => b.id !== id),
        }));
      }, RESULT_DURATION);
    }

    return id;
  },

  updateBubble: (id, text) =>
    set((state) => ({
      bubbles: state.bubbles.map((b) =>
        b.id === id ? { ...b, text } : b,
      ),
    })),

  removeBubble: (id) =>
    set((state) => ({
      bubbles: state.bubbles.filter((b) => b.id !== id),
    })),

  clearBubbles: () => set({ bubbles: [] }),

  clearBubblesForTarget: (targetType, targetId) =>
    set((state) => ({
      bubbles: state.bubbles.filter(
        (b) =>
          !(b.targetType === targetType &&
            (targetType === "manager" || b.targetId === targetId))
      ),
    })),
}));
