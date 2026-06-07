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
        // 사용자 전환 시 옛 사용자의 잔존 데이터 모두 제거.
        // zustand persist 가 in-memory state 변경 시 즉시 다시 저장하므로 단순 removeItem 만으론 부족.
        // → localStorage 통째로 초기화 (theme/auth 만 보존) + 강제 reload 로 in-memory state 완전 폐기.
        if (typeof window !== "undefined") {
          try {
            // 보존할 키들 (사용자별 데이터 아님)
            const PRESERVE = new Set([
              "doogeun-hq-theme",            // 다크/라이트 테마 (사용자 무관 UX 선호)
              "doogeun-hq-version-dismiss",  // 업데이트 모달 dismiss
            ]);
            for (const key of Object.keys(localStorage)) {
              if (key.startsWith("doogeun-hq-") && !PRESERVE.has(key)) {
                localStorage.removeItem(key);
              }
            }
            sessionStorage.clear();
          } catch { /* ignore */ }
        }
        set({ token: null, user: null });
        // 강제 reload → zustand in-memory state 완전 폐기 + 새 사용자 fresh start
        if (typeof window !== "undefined") {
          setTimeout(() => { window.location.replace("/auth"); }, 50);
        }
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
