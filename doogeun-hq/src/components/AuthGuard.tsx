"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";

/** 로그인 안 된 사용자는 /auth 로 리다이렉트.
 *   - persist 하이드레이션 경합 방지 위해 1프레임 대기 후 판정
 *   - 로그인 페이지(/auth) 는 통과
 */
const PUBLIC_ROUTES = new Set(["/auth", "/auth/", "/setup", "/setup/"]);

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const [ready, setReady] = useState(false);

  // persist 하이드레이션 완료 후 판정
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const path = pathname || "/";
    if (PUBLIC_ROUTES.has(path)) return;
    if (!user || !token) {
      router.replace(`/auth?next=${encodeURIComponent(path)}`);
    }
  }, [ready, user, token, pathname, router]);

  const path = pathname || "/";
  if (PUBLIC_ROUTES.has(path)) return <>{children}</>;
  if (!ready || !user || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-[var(--muted)]">
        로그인 확인 중...
      </div>
    );
  }
  return <>{children}</>;
}
