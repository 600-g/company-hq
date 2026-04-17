"use client";
import { useEffect, useState } from "react";

interface Props {
  appVersion: string;
  showBrand?: boolean;
}

const TOAST_KEY = "hq-cache-clear-toast";
const LS_KEYS = ["hq-build-id", "hq-floor-teams-order", "hq-chat-history", "hq-floor-layout", "hq-arcade-pos", "hq-server-pos"];

export default function BuildStampInline({ appVersion, showBrand = false }: Props) {
  const [build, setBuild] = useState<string | null>(null);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [postClearToast, setPostClearToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok || cancelled) return;
        const j = await r.json();
        if (!cancelled) {
          setBuild(j.build ?? null);
          if (j.version) setServerVersion(j.version);
        }
      } catch {}
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // 새로고침 직후 sessionStorage에서 결과 보고
  useEffect(() => {
    try {
      const t = sessionStorage.getItem(TOAST_KEY);
      if (t) {
        sessionStorage.removeItem(TOAST_KEY);
        setPostClearToast(t);
        const tid = setTimeout(() => setPostClearToast(null), 4000);
        return () => clearTimeout(tid);
      }
    } catch {}
  }, []);

  const buildLabel = !build ? "…" : build === "PLACEHOLDER" ? "dev" : build.split("-")[0];
  const tone =
    buildLabel === "dev" ? "text-yellow-500/70"
    : buildLabel === "…" ? "text-gray-700"
    : "text-green-500/70";

  const clearAllCaches = async () => {
    if (clearing) return;
    setClearing(true);
    let lsCleared = 0, cachesCleared = 0, swUnreg = 0;
    try {
      try {
        LS_KEYS.forEach(k => {
          if (localStorage.getItem(k) !== null) {
            localStorage.removeItem(k);
            lsCleared++;
          }
        });
      } catch {}
      try {
        if ("caches" in window) {
          const ks = await caches.keys();
          cachesCleared = ks.length;
          await Promise.all(ks.map(k => caches.delete(k)));
        }
      } catch {}
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          swUnreg = regs.length;
          await Promise.all(regs.map(r => r.unregister()));
        }
      } catch {}
      const summary = `LS:${lsCleared} · Cache:${cachesCleared} · SW:${swUnreg}`;
      setStatus(summary);
      try { sessionStorage.setItem(TOAST_KEY, `✅ 캐시 정리됨 — ${summary}`); } catch {}
      // 잠깐 보여준 뒤 리로드
      await new Promise(r => setTimeout(r, 1200));
      location.replace(`${location.pathname}?cb=${Date.now()}`);
    } finally {
      setClearing(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1 font-mono relative">
      <span className="text-gray-500">v{serverVersion ?? appVersion}</span>
      <span className="opacity-50">·</span>
      <span className={tone} title={build ?? "loading"}>{buildLabel}</span>
      <button
        type="button"
        onClick={clearAllCaches}
        disabled={clearing}
        className="opacity-60 hover:opacity-100 active:opacity-100 disabled:opacity-30 transition-opacity"
        title="캐시 초기화 + 강제 새로고침"
      >
        {clearing ? "…" : "🔄"}
      </button>
      {status && (
        <span className="text-cyan-400 ml-1 animate-pulse">{status}</span>
      )}
      {showBrand && (<>
        <span className="opacity-50">·</span>
        <span>(주)두근 컴퍼니</span>
      </>)}
      {postClearToast && (
        <span className="fixed bottom-3 right-3 z-[9999] px-3 py-1.5 rounded-md bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 text-[13px] font-mono shadow-lg animate-fadeIn">
          {postClearToast}
        </span>
      )}
    </span>
  );
}
