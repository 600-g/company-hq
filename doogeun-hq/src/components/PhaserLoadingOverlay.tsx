"use client";

import { useEffect, useState } from "react";

/** Phaser 씬 프리로드 진행률 오버레이 — 첫 진입 시만 (이후 캐시 → 안 뜸) */
export default function PhaserLoadingOverlay() {
  const [progress, setProgress] = useState<number>(0);
  const [done, setDone] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onProgress = (e: Event) => {
      const ev = e as CustomEvent<{ value: number; done?: boolean }>;
      const v = ev.detail?.value ?? 0;
      setProgress(v);
      if (ev.detail?.done) {
        setDone(true);
        // 100% 도달 후 400ms 페이드아웃
        setTimeout(() => setHidden(true), 400);
      }
    };
    window.addEventListener("hq:phaser-progress", onProgress as EventListener);
    // 5초 안에 progress 이벤트 못 받으면 (이미 캐시됨) 자동 숨김
    const timeout = setTimeout(() => setHidden(true), 5000);
    return () => {
      window.removeEventListener("hq:phaser-progress", onProgress as EventListener);
      clearTimeout(timeout);
    };
  }, []);

  if (hidden) return null;

  return (
    <div
      className={`absolute inset-0 z-40 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm transition-opacity duration-400 ${
        done ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center gap-3 max-w-xs w-full px-6">
        <div className="text-2xl">🏢</div>
        <div className="text-[12px] text-gray-300 font-bold">두근컴퍼니 사무실 준비 중</div>
        <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-200"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <div className="text-[10px] text-gray-500 font-mono">
          {Math.round(progress * 100)}% — 캐릭터 + 가구 + 타일 로드
        </div>
      </div>
    </div>
  );
}
