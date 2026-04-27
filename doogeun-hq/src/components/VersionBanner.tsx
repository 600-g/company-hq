"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, RefreshCw, X } from "lucide-react";

/** 페이지 로드 시점의 build (window 에 한 번 박힘 — polling 비교 기준) */
declare global {
  interface Window {
    __DOOGEUN_LOADED_BUILD__?: string;
  }
}

interface VersionInfo {
  build: string;
  version: string;
  ts: number;
}

/** 현재 버전 표시 + 새 빌드 자동 감지 + 사용자 클릭 reload.
 *  서비스 끊김 없이 사용자가 원할 때만 적용 (자동 reload X — 채팅 중 데이터 손실 방지).
 */
export default function VersionBanner() {
  const [loaded, setLoaded] = useState<VersionInfo | null>(null);
  const [latest, setLatest] = useState<VersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 마운트 시 1회: 현재 로드된 build 저장 + 즉시 새로 fetch
  useEffect(() => {
    let mounted = true;
    const fetchVersion = async (): Promise<VersionInfo | null> => {
      try {
        const r = await fetch("/version.json", { cache: "no-store" });
        if (!r.ok) return null;
        const d = await r.json();
        if (typeof d?.build !== "string") return null;
        return { build: d.build, version: d.version || "?", ts: d.ts || 0 };
      } catch { return null; }
    };

    (async () => {
      const v = await fetchVersion();
      if (!mounted || !v) return;
      // 이 페이지의 "현재 로드된" build — window 에 한 번만 박음
      if (!window.__DOOGEUN_LOADED_BUILD__) {
        window.__DOOGEUN_LOADED_BUILD__ = v.build;
      }
      setLoaded({ build: window.__DOOGEUN_LOADED_BUILD__!, version: v.version, ts: v.ts });
      setLatest(v);
    })();

    // 60초 간격 polling
    pollTimer.current = setInterval(async () => {
      if (!mounted) return;
      const v = await fetchVersion();
      if (v) setLatest(v);
    }, 60_000);

    return () => {
      mounted = false;
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  if (!loaded) return null;

  const hasUpdate = latest && latest.build !== loaded.build && !dismissed;

  return (
    <>
      {/* 좌상단 또는 우상단 — 항상 작은 버전 배지 */}
      <div className="fixed bottom-2 left-2 z-[60] flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono bg-gray-900/80 border border-gray-700/60 text-gray-400 backdrop-blur pointer-events-none select-none">
        v{loaded.version}
        <span className="text-gray-600">·</span>
        <span className="text-[9px] opacity-70">{loaded.build.slice(0, 9)}</span>
      </div>

      {/* 새 빌드 감지 시 — 우하단 update 카드 */}
      {hasUpdate && (
        <div className="fixed bottom-4 right-4 z-[300] max-w-xs animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="rounded-lg border border-sky-400/50 bg-gray-950/95 backdrop-blur shadow-2xl overflow-hidden">
            <div className="flex items-start gap-2 p-3">
              <div className="shrink-0 w-7 h-7 rounded-full bg-sky-500/20 border border-sky-400/40 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-sky-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold text-sky-100">새 빌드 사용 가능</div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  v{latest.version} · <span className="font-mono">{latest.build.slice(0, 9)}</span>
                </div>
                <div className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                  지금 적용하면 페이지 새로고침. 채팅 중이면 입력 보존됨.
                </div>
                <div className="flex gap-1.5 mt-2">
                  <button
                    onClick={() => location.reload()}
                    className="flex-1 h-7 rounded-md text-[11px] font-bold bg-sky-500/20 border border-sky-400/60 text-sky-100 hover:bg-sky-500/30 transition-colors flex items-center justify-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    적용
                  </button>
                  <button
                    onClick={() => setDismissed(true)}
                    className="px-2 h-7 rounded-md text-[11px] border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
                  >
                    나중에
                  </button>
                </div>
              </div>
              <button
                onClick={() => setDismissed(true)}
                className="shrink-0 text-gray-500 hover:text-gray-200"
                title="닫기"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
