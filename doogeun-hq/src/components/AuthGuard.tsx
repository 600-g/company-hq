"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";

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

  // zustand persist hydration 완료 정확히 기다리기
  useEffect(() => {
    // 이미 hydrate 됐으면 즉시 ready
    if (useAuthStore.persist?.hasHydrated?.()) {
      setHydrated(true);
      return;
    }
    // 아직이면 콜백 등록
    const unsub = useAuthStore.persist?.onFinishHydration?.(() => setHydrated(true));
    // 안전망: persist 미지원 환경 대비 1초 후 강제 ready
    const fallback = setTimeout(() => setHydrated(true), 1000);
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
