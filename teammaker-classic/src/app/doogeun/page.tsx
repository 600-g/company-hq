"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

// Phaser는 window 필요 → CSR only
const OfficeGame = dynamic(() => import("@/components/doogeun/OfficeGame"), { ssr: false });

/**
 * 두근컴퍼니 픽셀 오피스 (Option B Phase 0 스켈레톤)
 *
 * ─ 현재 상태 ─
 * 팀메이커 베이스에 우리 Phaser 기반 픽셀 오피스를 이식하는 중간 랜딩.
 * 다음 단계에서 `src/components/doogeun/OfficeGame.tsx` 로 Phaser 엔진을 올리고
 * `ui/app/game/OfficeScene.ts` (1800줄+) 를 여기로 포팅 예정.
 *
 * ─ 체크리스트 ─
 * [x] Phaser 패키지 설치 (package.json)
 * [x] /doogeun 라우트 스켈레톤
 * [ ] public/doogeun/assets/ 에셋 복사 (628MB, 선별 필요)
 * [ ] OfficeGame.tsx (Phaser 초기화 래퍼, dynamic SSR=false)
 * [ ] OfficeScene.ts 이식 (+ sprites.ts, tm-furniture-catalog.ts, bubbles.ts 등)
 * [ ] 우리 FastAPI 엔드포인트 호출부 매핑 (/api/layout/*, /api/teams, /api/dispatch/*)
 * [ ] 또는 TM Next.js API로 점진 마이그레이션
 */
export default function DoogeunPage() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(true); }, []);

  return (
    <div className="min-h-screen bg-[#0f0f1f] text-gray-200 flex flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold text-yellow-400">🏢 두근컴퍼니 픽셀 오피스</h1>
      <p className="text-sm text-gray-400 max-w-md text-center">
        Option B 이식 진행 중. Phaser 기반 픽셀 오피스가 이 라우트에 탑재될 예정.
      </p>
      {loaded ? <OfficeGame /> : (
        <div className="w-[960px] max-w-full h-[540px] border border-[#2a2a4a] rounded-lg bg-[#06060e] flex items-center justify-center">
          <div className="text-xl text-gray-500">로딩...</div>
        </div>
      )}
      <div className="flex gap-3 mt-2">
        <Link
          href="/office"
          className="px-3 py-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 text-sm"
        >
          팀메이커 오피스 (PixiJS)
        </Link>
        <Link
          href="/"
          className="px-3 py-1.5 rounded border border-gray-500/40 bg-gray-500/10 text-gray-300 hover:bg-gray-500/20 text-sm"
        >
          홈
        </Link>
        <a
          href="https://600g.net"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded border border-yellow-500/40 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20 text-sm"
        >
          현재 배포본 (구 ui/)
        </a>
      </div>
    </div>
  );
}
