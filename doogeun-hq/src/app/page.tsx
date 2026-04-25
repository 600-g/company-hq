"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 루트 → /hub 자동 이동. (이전 랜딩 페이지는 아카이브됨) */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/hub");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-[var(--muted)]">
      두근컴퍼니 HQ 로 이동 중...
    </div>
  );
}
