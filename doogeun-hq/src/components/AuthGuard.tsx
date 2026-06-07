"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { apiBase } from "@/lib/utils";

/** 로그인 안 된 사용자는 /auth 로 리다이렉트.
 *   - zustand persist 의 onFinishHydration 콜백으로 정확히 hydration 완료 후 판정
 *     (이전 setTimeout(50ms) 는 race condition 유발 — 매 배포마다 로그인 풀린 원인)
 *   - 로그인 페이지(/auth) 는 통과
 */
const PUBLIC_ROUTES = new Set(["/auth", "/auth/", "/setup", "/setup/"]);

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const [hydrated, setHydrated] = useState(false);

  // zustand persist hydration 완료 정확히 기다리기.
  //   chat/agents 등 큰 store 가 동시 hydrate 중이면 1초로 부족 → 사용자 강제 로그아웃 발생.
  //   ✅ 5초 fallback + fallback 도달 시 hasHydrated 재확인 + 미완료면 강제 rehydrate.
  useEffect(() => {
    if (useAuthStore.persist?.hasHydrated?.()) {
      setHydrated(true);
      return;
    }
    const unsub = useAuthStore.persist?.onFinishHydration?.(() => setHydrated(true));
    const fallback = setTimeout(() => {
      // 5초 후 — hasHydrated 다시 확인 (race 윈도우)
      if (useAuthStore.persist?.hasHydrated?.()) {
        setHydrated(true);
        return;
      }
      // 진짜 안 끝났으면 강제 rehydrate 1회 + 추가 0.5초 대기
      try { useAuthStore.persist?.rehydrate?.(); } catch { /* ignore */ }
      setTimeout(() => setHydrated(true), 500);
    }, 5000);
    return () => {
      try { unsub?.(); } catch { /* ignore */ }
      clearTimeout(fallback);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const path = pathname || "/";
    if (PUBLIC_ROUTES.has(path)) return;
    if (!user || !token) {
      // 안전망 1: localStorage 직접 확인 (zustand store reactivity race 방지)
      try {
        const raw = localStorage.getItem("doogeun-hq-auth");
        if (raw) {
          const parsed = JSON.parse(raw);
          const persistedToken = parsed?.state?.token;
          const persistedUser = parsed?.state?.user;
          if (persistedToken && persistedUser) {
            useAuthStore.setState({ token: persistedToken, user: persistedUser });
            return;
          }
        }
      } catch { /* JSON 파싱 실패 — 다음 fallback 진행 */ }

      // 안전망 2: cookie 에서 토큰 복원 (캐시 삭제로 localStorage 날아가도 cookie 는 보존)
      try {
        const cookieMatch = document.cookie.match(/(?:^|;\s*)doogeun-hq-token=([^;]+)/);
        const cookieToken = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
        if (cookieToken) {
          // 백엔드에 verify 요청 → user 정보 복원 → 다시 로그인
          (async () => {
            try {
              const res = await fetch(`${apiBase()}/api/auth/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: cookieToken }),
              });
              const d = await res.json();
              if (d.ok && d.user_id) {
                useAuthStore.getState().login(cookieToken, {
                  id: d.user_id,
                  nickname: d.nickname || "사용자",
                  role: d.role || "member",
                  loggedInAt: Date.now(),
                });
                return;
              }
            } catch { /* ignore */ }
            router.replace(`/auth?next=${encodeURIComponent(path)}`);
          })();
          return;
        }
      } catch { /* ignore */ }

      router.replace(`/auth?next=${encodeURIComponent(path)}`);
    }
  }, [hydrated, user, token, pathname, router]);

  const path = pathname || "/";
  if (PUBLIC_ROUTES.has(path)) return <>{children}</>;
  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-[var(--muted)]">
        로그인 확인 중...
      </div>
    );
  }
  if (!user || !token) {
    // hydration 끝났는데 진짜 로그인 X → /auth 리다이렉트 진행 중. 흰화면 방지
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-[var(--muted)]">
        로그인 페이지로 이동 중...
      </div>
    );
  }
  return <>{children}</>;
}
