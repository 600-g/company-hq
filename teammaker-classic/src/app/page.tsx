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

      <div className="flex flex-col sm:flex-row gap-4 mt-4">
        <button
          onClick={() => router.push("/doogeun")}
          className="w-72 p-5 rounded-lg border-2 border-yellow-500/60 bg-yellow-500/10 hover:bg-yellow-500/20 text-left transition-all"
        >
          <div className="text-2xl mb-2">🏢 두근컴퍼니</div>
          <div className="text-xs text-yellow-300/90 mb-1">픽셀 오피스 · 통합 채팅 · @멘션</div>
          <div className="text-[11px] text-gray-400 mt-2">
            FastAPI 백엔드 · Phaser 픽셀 씬 · 다수 에이전트 동시 관리
          </div>
        </button>

        <button
          onClick={() => router.push(isApiKeyValid ? "/office" : "/setup")}
          className="w-72 p-5 rounded-lg border-2 border-cyan-500/60 bg-cyan-500/10 hover:bg-cyan-500/20 text-left transition-all"
        >
          <div className="text-2xl mb-2">🎯 TeamMaker Classic</div>
          <div className="text-xs text-cyan-300/90 mb-1">PixiJS · 에이전트 파이프라인</div>
          <div className="text-[11px] text-gray-400 mt-2">
            {isApiKeyValid ? "API 키 연결됨 · 바로 이동" : "API 키 설정 필요"}
          </div>
        </button>
      </div>

      <div className="mt-6 text-[11px] text-gray-600 flex gap-3">
        <a href="/settings" className="hover:text-gray-400">⚙️ 설정</a>
        <span className="opacity-40">·</span>
        <a href="/pixel" className="hover:text-gray-400">🎮 픽셀 테스트</a>
        <span className="opacity-40">·</span>
        <a href="https://600g.net" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400">
          🌐 배포본 (구)
        </a>
      </div>
    </div>
  );
}
