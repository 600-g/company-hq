"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ClaudeModel = "haiku" | "sonnet" | "opus";

interface TokenEntry {
  configured: boolean;
  masked?: string;
}

export interface SettingsState {
  apiKey: string | null;
  maskedApiKey: string;
  selectedModel: ClaudeModel;

  tokens: {
    GITHUB_TOKEN: TokenEntry;
    VERCEL_TOKEN: TokenEntry;
    CF_TOKEN: TokenEntry;
    SUPABASE_ACCESS_TOKEN: TokenEntry;
  };

  locale: "ko" | "en";
  testMode: boolean;
  /** 에이전트 응답이 정상 완료되면 자동으로 배포 파이프라인 실행 */
  autoDeploy: boolean;
  /** 에이전트 기본 응답 언어 (개별 에이전트가 spriteKey 처럼 자체 override 가능) */
  agentLanguage: "ko" | "en" | "ja" | "zh";
  /** NPC 기본 언어 (배경 캐릭 인사/말풍선용) */
  npcLanguage: "ko" | "en" | "ja" | "zh";

  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  setModel: (m: ClaudeModel) => void;
  setToken: (key: keyof SettingsState["tokens"], value: string) => void;
  clearToken: (key: keyof SettingsState["tokens"]) => void;
  setLocale: (l: "ko" | "en") => void;
  setTestMode: (b: boolean) => void;
  setAutoDeploy: (b: boolean) => void;
  setAgentLanguage: (l: "ko" | "en" | "ja" | "zh") => void;
  setNpcLanguage: (l: "ko" | "en" | "ja" | "zh") => void;
  reset: () => void;
}

const maskKey = (k: string): string => {
  if (!k || k.length < 8) return "";
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
};

const emptyTokens: SettingsState["tokens"] = {
  GITHUB_TOKEN: { configured: false },
  VERCEL_TOKEN: { configured: false },
  CF_TOKEN: { configured: false },
  SUPABASE_ACCESS_TOKEN: { configured: false },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: null,
      maskedApiKey: "",
      selectedModel: "sonnet",
      tokens: emptyTokens,
      locale: "ko",
      testMode: false,
      autoDeploy: false,
      agentLanguage: "ko",
      npcLanguage: "ko",

      setApiKey: (key) => set({ apiKey: key, maskedApiKey: maskKey(key) }),
      clearApiKey: () => set({ apiKey: null, maskedApiKey: "" }),
      setModel: (m) => set({ selectedModel: m }),
      setToken: (key, value) =>
        set((s) => ({
          tokens: { ...s.tokens, [key]: { configured: true, masked: maskKey(value) } },
        })),
      clearToken: (key) =>
        set((s) => ({ tokens: { ...s.tokens, [key]: { configured: false } } })),
      setLocale: (l) => set({ locale: l }),
      setTestMode: (b) => set({ testMode: b }),
      setAutoDeploy: (b) => set({ autoDeploy: b }),
      setAgentLanguage: (l) => set({ agentLanguage: l }),
      setNpcLanguage: (l) => set({ npcLanguage: l }),
      reset: () =>
        set({
          apiKey: null,
          maskedApiKey: "",
          selectedModel: "sonnet",
          tokens: emptyTokens,
          locale: "ko",
          testMode: false,
          autoDeploy: false,
          agentLanguage: "ko",
          npcLanguage: "ko",
        }),
    }),
    { name: "doogeun-hq-settings" }
  )
);
