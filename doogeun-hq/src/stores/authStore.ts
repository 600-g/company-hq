"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  id: string;
  nickname: string;
  role: "owner" | "admin" | "manager" | "member" | "guest";
  loggedInAt: number;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isOwner: () => boolean;
  isAdmin: () => boolean;
  isLoggedIn: () => boolean;
}

// 캐시 삭제 후에도 살아남도록 cookie 백업
function persistTokenCookie(token: string | null) {
  if (typeof document === "undefined") return;
  if (token) {
    const d = new Date();
    d.setTime(d.getTime() + 90 * 24 * 60 * 60 * 1000);
    document.cookie = `doogeun-hq-token=${encodeURIComponent(token)}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
  } else {
    document.cookie = `doogeun-hq-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  }
}

const ROLE_LEVEL: Record<AuthUser["role"], number> = { owner: 5, admin: 4, manager: 3, member: 2, guest: 1 };

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      login: (token, user) => {
        persistTokenCookie(token);
        set({ token, user: { ...user, loggedInAt: Date.now() } });
      },
      logout: () => {
        persistTokenCookie(null);
        // 사용자 전환 시 옛 사용자의 잔존 데이터 모두 제거 — 채팅·에이전트·권한 캐시·세션 등
        if (typeof window !== "undefined") {
          try {
            // zustand persist 키 (per-user 데이터)
            localStorage.removeItem("doogeun-hq-chat");
            localStorage.removeItem("doogeun-hq-agents");
            localStorage.removeItem("doogeun-hq-layout");
            localStorage.removeItem("doogeun-hq-handoff");
            localStorage.removeItem("doogeun-hq-pipeline");
            localStorage.removeItem("doogeun-hq-notify");
            localStorage.removeItem("doogeun-hq-draft-input");
            localStorage.removeItem("doogeun-hq-pinned-agents");
            localStorage.removeItem("doogeun-hq-applied-build");
            // sessionStorage 권한 캐시
            sessionStorage.removeItem("doogeun-hq-capabilities");
          } catch { /* ignore */ }
        }
        set({ token: null, user: null });
      },
      isOwner: () => get().user?.role === "owner",
      isAdmin: () => (ROLE_LEVEL[get().user?.role || "guest"] || 0) >= 4,
      isLoggedIn: () => !!get().token && !!get().user,
    }),
    {
      name: "doogeun-hq-auth",
      version: 1,
      partialize: (s) => ({ token: s.token, user: s.user }),
    }
  )
);
