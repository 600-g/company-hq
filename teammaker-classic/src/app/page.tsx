"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSettingsStore } from "@/stores/settingsStore";
import { trackEvent } from "@/lib/analytics";

export default function Home() {
  const router = useRouter();
  const isApiKeyValid = useSettingsStore((s) => s.isApiKeyValid);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    trackEvent("app_launched");
    loadSettings().then(() => setLoaded(true));
  }, [loadSettings]);

  if (!loaded) return null;

  return (
    <div className="min-h-screen bg-[#0f0f1f] text-gray-200 flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold text-yellow-400">🏢 Company HQ</h1>
      <p className="text-sm text-gray-400">모드를 선택하세요</p>

      <div className="flex flex-col lg:flex-row gap-4 mt-4">
        {/* 최신 — 두근컴퍼니 통합 */}
        <button
          onClick={() => router.push("/doogeun")}
          className="w-72 p-5 rounded-lg border-2 border-yellow-500/60 bg-yellow-500/10 hover:bg-yellow-500/20 text-left transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-2xl">🏢 두근컴퍼니</div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/30 text-yellow-200 font-bold">최신</span>
          </div>
          <div className="text-xs text-yellow-300/90 mb-1">픽셀 오피스 · 팀메이커 언어 이식 중</div>
          <div className="text-[11px] text-gray-400 mt-2">
            두근컴퍼니 UX + 팀메이커 채팅 방식 퓨전 버전
          </div>
        </button>

        {/* 아카이빙 — 우리 구버전 */}
        <a
          href="https://600g.net"
          target="_blank"
          rel="noopener noreferrer"
          className="w-72 p-5 rounded-lg border-2 border-gray-500/50 bg-gray-500/5 hover:bg-gray-500/15 text-left transition-all block"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-2xl">📦 두근컴퍼니 구버전</div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/30 text-gray-300 font-bold">아카이브</span>
          </div>
          <div className="text-xs text-gray-400 mb-1">기존 배포본 · 600g.net</div>
          <div className="text-[11px] text-gray-500 mt-2">
            Option B 이식 전 원본 UI · 운영 안정성 확인된 버전
          </div>
        </a>

        {/* 아카이빙 — 팀메이커 원본 */}
        <button
          onClick={() => router.push(isApiKeyValid ? "/office" : "/setup")}
          className="w-72 p-5 rounded-lg border-2 border-cyan-500/50 bg-cyan-500/5 hover:bg-cyan-500/15 text-left transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-2xl">🎯 팀메이커 Classic</div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/30 text-cyan-200 font-bold">아카이브</span>
          </div>
          <div className="text-xs text-cyan-300/80 mb-1">PixiJS · 에이전트 파이프라인 원본</div>
          <div className="text-[11px] text-gray-500 mt-2">
            {isApiKeyValid ? "API 키 연결됨 · 바로 이동" : "API 키 설정 필요"}
          </div>
        </button>
      </div>

      <div className="mt-6 text-[11px] text-gray-600 flex gap-3">
        <a href="/settings" className="hover:text-gray-400">⚙️ 설정</a>
        <span className="opacity-40">·</span>
        <a href="/pixel" className="hover:text-gray-400">🎮 픽셀 테스트</a>
      </div>
    </div>
  );
}
