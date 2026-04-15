import { create } from "zustand";
import { DEFAULT_MODEL } from "@/lib/models";

interface TokenStatus {
  VERCEL_TOKEN: boolean;
  SUPABASE_ACCESS_TOKEN: boolean;
  GITHUB_TOKEN: boolean;
}

interface SettingsState {
  maskedKey: string | null;
  isApiKeyValid: boolean;
  testMode: boolean;
  selectedModel: string;
  tokens: TokenStatus;

  setApiKey: (key: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  setApiKeyValid: (valid: boolean) => void;
  setTestMode: (enabled: boolean) => void;
  setSelectedModel: (model: string) => void;
  loadSettings: () => Promise<void>;
  loadTokens: () => Promise<void>;
  saveToken: (key: keyof TokenStatus, value: string) => Promise<boolean>;
  deleteToken: (key: keyof TokenStatus) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  maskedKey: null,
  isApiKeyValid: false,
  testMode: typeof window !== "undefined" && localStorage.getItem("testMode") === "true",
  selectedModel: typeof window !== "undefined" ? (localStorage.getItem("selectedModel") || DEFAULT_MODEL) : DEFAULT_MODEL,
  tokens: { VERCEL_TOKEN: false, SUPABASE_ACCESS_TOKEN: false, GITHUB_TOKEN: false },

  setApiKey: async (key) => {
    const { trackEvent } = await import("@/lib/analytics");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: key }),
    });
    if (res.ok) {
      const data = await res.json();
      set({ maskedKey: data.maskedKey, isApiKeyValid: true });
      trackEvent("api_key_set");
    }
  },

  clearApiKey: async () => {
    await fetch("/api/settings", { method: "DELETE" });
    set({ maskedKey: null, isApiKeyValid: false });
  },

  setApiKeyValid: (valid) => set({ isApiKeyValid: valid }),

  setTestMode: (enabled) => {
    localStorage.setItem("testMode", String(enabled));
    set({ testMode: enabled });
  },

  setSelectedModel: (model) => {
    localStorage.setItem("selectedModel", model);
    set({ selectedModel: model });
    import("@/lib/analytics").then(({ trackEvent }) => trackEvent("model_changed", { model }));
  },

  loadSettings: async () => {
    try {
      const [settingsRes, tokensRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/settings/tokens"),
      ]);
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        set({
          maskedKey: data.maskedKey,
          isApiKeyValid: data.hasKey,
        });
      }
      if (tokensRes.ok) {
        const data = await tokensRes.json();
        set({ tokens: data.tokens });
      }
    } catch {
      // server not available yet
    }
  },

  loadTokens: async () => {
    try {
      const res = await fetch("/api/settings/tokens");
      if (res.ok) {
        const data = await res.json();
        set({ tokens: data.tokens });
      }
    } catch {
      // server not available yet
    }
  },

  saveToken: async (key, value) => {
    const res = await fetch("/api/settings/tokens", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (res.ok) {
      set((state) => ({ tokens: { ...state.tokens, [key]: true } }));
      return true;
    }
    return false;
  },

  deleteToken: async (key) => {
    const res = await fetch("/api/settings/tokens", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    if (res.ok) {
      set((state) => ({ tokens: { ...state.tokens, [key]: false } }));
    }
  },
}));
