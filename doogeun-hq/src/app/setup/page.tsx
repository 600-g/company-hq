"use client";

import Link from "next/link";

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col items-center justify-center gap-6 p-8">
      <div className="text-center max-w-lg">
        <h1 className="text-2xl font-bold text-blue-300">초기 설정</h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          다음 세션에 API 키 / 모델 / 토큰 / 푸시 / 자동화 통합 설정이 들어옵니다.
        </p>
      </div>

      <div className="p-6 rounded-xl border border-gray-700/60 bg-gray-900/30 w-full max-w-md">
        <div className="text-[13px] text-gray-400 mb-3 font-bold">📋 체크리스트 (대기)</div>
        <ul className="space-y-2 text-[12px] text-gray-500">
          <li>☐ Anthropic API 키 등록</li>
          <li>☐ 모델 선택 (Haiku / Sonnet / Opus)</li>
          <li>☐ GitHub 토큰 (레포 생성·배포)</li>
          <li>☐ Vercel / Cloudflare Pages 토큰</li>
          <li>☐ Supabase 프로젝트 연결</li>
          <li>☐ 푸시 알림 VAPID 구독</li>
        </ul>
      </div>

      <Link href="/" className="text-[13px] text-gray-500 hover:text-blue-400">← 홈</Link>
    </div>
  );
}
