"use client";

import Link from "next/link";

/**
 * 두근컴퍼니 HQ — 새판 홈.
 * 뼈대 재사용 X. 완전 새 Next.js 프로젝트. 코드 참조는 teammaker-classic + company-hq/ui.
 *
 * 라우트 (예정):
 *   /         - 홈 (이 파일)
 *   /setup    - API 키·모델 초기 설정
 *   /auth     - 로그인 + 초대 코드
 *   /office   - 픽셀 오피스 (Phaser, 다층)
 *   /settings - 설정 통합
 *   /server   - 서버실 모니터
 *   /bugs     - 버그 리포트 리스트
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-sky-300 tracking-tight">두근컴퍼니 HQ</h1>
        <p className="text-sm text-[var(--muted)] mt-3">
          새판 빌드 · BUILDING
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 mt-2">
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
          <div className="text-xs text-gray-400 mb-1">기존 배포본 · 600g.net</div>
          <div className="text-[11px] text-gray-500 mt-2 leading-relaxed">
            Next.js + Phaser 픽셀 오피스 · FastAPI · @멘션 통합채팅 원본
          </div>
        </a>

        {/* 2. 팀메이커 Classic */}
        <a
          href="http://localhost:4827/office"
          className="w-64 p-5 rounded-xl border border-cyan-700/60 bg-cyan-900/10 hover:bg-cyan-800/20 hover:border-cyan-500 transition-all text-left block"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-2xl">🎯 팀메이커</div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-700/30 text-cyan-300 font-bold">아카이브</span>
          </div>
          <div className="text-xs text-gray-400 mb-1">PixiJS 파이프라인 원본</div>
          <div className="text-[11px] text-gray-500 mt-2 leading-relaxed">
            refineRequirements → pipeline → handoff · 안정 엔진 참조용
          </div>
        </a>

        {/* 3. 신규 */}
        <Link
          href="/hub"
          className="w-64 p-5 rounded-xl border-2 border-sky-400/60 bg-sky-500/10 hover:bg-sky-500/15 hover:border-sky-300 transition-all text-left block"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-2xl">✨ 신규</div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/25 text-gray-200 font-bold">BUILDING</span>
          </div>
          <div className="text-xs text-gray-200/90 mb-1">두근컴퍼니 HQ — 새판</div>
          <div className="text-[11px] text-blue-100/70 mt-2 leading-relaxed">
            설정 · 로그인 · 버그리포트 · 사진업로드 · 에이전트 MD · 서버실 · 층 · 알림 · i18n · 캐시버스팅
          </div>
        </Link>
      </div>

      <div className="mt-8 p-4 rounded-lg border border-gray-800/60 bg-gray-900/30 max-w-3xl text-center">
        <div className="text-[12px] text-gray-400 mb-2">🏗 이 프로젝트는 완전 새판</div>
        <div className="text-[11px] text-gray-500 leading-relaxed">
          <code className="text-sky-300/80">doogeun-hq/</code> 디렉토리에 <code>create-next-app</code> 으로 신규 생성.
          <br />기존 <code className="text-gray-300">ui/</code>, <code className="text-gray-300">teammaker-classic/</code> 와 물리적으로 분리.
          <br />코드 참조는 하되 <b>import·심링크·복사 없음</b>. 머지 충돌 원천 차단.
        </div>
      </div>
    </div>
  );
}
