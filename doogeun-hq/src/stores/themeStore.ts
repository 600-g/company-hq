"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      setTheme: (t) => {
        set({ theme: t });
        if (typeof document !== "undefined") document.documentElement.setAttribute("data-theme", t);
      },
      toggle: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        set({ theme: next });
        if (typeof document !== "undefined") document.documentElement.setAttribute("data-theme", next);
      },
    }),
    {
      name: "doogeun-hq-theme",
      onRehydrateStorage: () => (state) => {
        if (typeof document !== "undefined" && state) {
          document.documentElement.setAttribute("data-theme", state.theme);
        }
      },
    }
  )
);
