"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  id: string;
  nickname: string;
  role: "owner" | "admin" | "member" | "guest";
  loggedInAt: number;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isOwner: () => boolean;
  isLoggedIn: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      login: (token, user) => set({ token, user: { ...user, loggedInAt: Date.now() } }),
      logout: () => set({ token: null, user: null }),
      isOwner: () => get().user?.role === "owner",
      isLoggedIn: () => !!get().token && !!get().user,
    }),
    {
      name: "doogeun-hq-auth",
      version: 1,
      // 함수(login/logout/isOwner/isLoggedIn)는 persist 안 함 — token/user 만 영속
      partialize: (s) => ({ token: s.token, user: s.user }),
    }
  )
);
