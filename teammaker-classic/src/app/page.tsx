"use client";

import { useRouter } from "next/navigation";

/**
 * 랜딩 — 3개 카드:
 *  1. 두근컴퍼니 (구버전, 아카이브) — 600g.net
 *  2. 팀메이커 Classic (아카이브) — /office (PixiJS 원본)
 *  3. 신규 (새판) — /new (TM 구조 + 우리 장점 11개 + 픽셀 캐릭터 이식 중)
 */
export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0b0b14] text-gray-200 flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-yellow-300">Company HQ</h1>
        <p className="text-sm text-gray-500 mt-2">아카이브된 버전과 신규 빌드</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* 1. 두근컴퍼니 구버전 */}
        <a
          href="https://600g.net"
          target="_blank"
          rel="noopener noreferrer"
          className="w-64 p-5 rounded-xl border border-gray-700/60 bg-gray-800/20 hover:bg-gray-700/30 hover:border-gray-500 transition-all text-left block"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-2xl">📦 두근컴퍼니</div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-600/30 text-gray-400 font-bold">아카이브</span>
          </div>
          <div className="text-xs text-gray-400 mb-1">우리 기존 배포본 · 600g.net</div>
          <div className="text-[11px] text-gray-500 mt-2 leading-relaxed">
            Next.js + Phaser 픽셀 오피스 · FastAPI 백엔드 · @멘션 통합채팅 원본
          </div>
        </a>

        {/* 2. 팀메이커 Classic */}
        <button
          onClick={() => router.push("/office")}
          className="w-64 p-5 rounded-xl border border-cyan-600/60 bg-cyan-900/10 hover:bg-cyan-800/20 hover:border-cyan-500 transition-all text-left"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-2xl">🎯 팀메이커</div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-700/30 text-cyan-300 font-bold">아카이브</span>
          </div>
          <div className="text-xs text-gray-400 mb-1">PixiJS 에이전트 파이프라인 원본</div>
          <div className="text-[11px] text-gray-500 mt-2 leading-relaxed">
            refineRequirements → pipeline → handoff · 안정된 업무 처리 엔진
          </div>
        </button>

        {/* 3. 신규 */}
        <button
          onClick={() => router.push("/new")}
          className="w-64 p-5 rounded-xl border-2 border-yellow-400/70 bg-yellow-500/10 hover:bg-yellow-500/20 hover:border-yellow-300 transition-all text-left relative"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-2xl">✨ 신규</div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/40 text-yellow-200 font-bold">BUILDING</span>
          </div>
          <div className="text-xs text-yellow-200/90 mb-1">팀메이커 구조 + 우리 장점 이식</div>
          <div className="text-[11px] text-yellow-100/70 mt-2 leading-relaxed">
            설정·버그리포트·사진업로드·스펙정리·i18n·알림·서버실·층분리·에이전트MD·로그인·캐시버스팅
          </div>
        </button>
      </div>

      <div className="mt-4 text-[11px] text-gray-600 flex gap-3">
        <a href="/settings" className="hover:text-gray-400">⚙️ 설정</a>
      </div>
    </div>
  );
}
