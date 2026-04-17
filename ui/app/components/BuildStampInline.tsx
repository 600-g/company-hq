"use client";
import { useEffect, useState } from "react";

interface Props {
  appVersion: string;
  showBrand?: boolean;
}

const TOAST_KEY = "hq-cache-clear-toast";
// 지울 localStorage 키 (레이아웃/좌표/히스토리 등 재구축 가능한 것만).
// hq-auth-token / hq-auth-user / nickname 등 로그인 상태는 절대 건드리지 않음.
const LS_KEYS = ["hq-build-id", "hq-floor-teams-order", "hq-chat-history", "hq-floor-layout", "hq-arcade-pos", "hq-server-pos"];
const AUTH_KEEP_KEYS = ["hq-auth-token", "hq-auth-user"];

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

  // 형식: <sha8> · <timestamp 뒤 4자리>  → 같은 커밋 재배포도 배포마다 숫자 바뀜
  const buildLabel = !build ? "…" : build === "PLACEHOLDER" ? "dev" : (() => {
    const parts = build.split("-");
    const sha = parts[0];
    const ts = parts[1] || "";
    return ts ? `${sha}·${ts.slice(-4)}` : sha;
  })();
  const tone =
    buildLabel === "dev" ? "text-yellow-500/70"
    : buildLabel === "…" ? "text-gray-700"
    : "text-green-500/70";

  const clearAllCaches = async () => {
    if (clearing) return;
    setClearing(true);
    let lsCleared = 0, cachesCleared = 0, swUnreg = 0, authKept = 0;
    try {
      // 1) 로그인 유지: 보존 키 스냅샷
      const preserved: Record<string, string> = {};
      try {
        for (const k of AUTH_KEEP_KEYS) {
          const v = localStorage.getItem(k);
          if (v !== null) { preserved[k] = v; authKept++; }
        }
      } catch {}
      setStatus("🔐 로그인 보존");
      await new Promise(r => setTimeout(r, 150));

      // 2) localStorage 정리 (보존 키 제외)
      try {
        LS_KEYS.forEach(k => {
          if (localStorage.getItem(k) !== null) {
            localStorage.removeItem(k);
            lsCleared++;
          }
        });
      } catch {}
      setStatus(`🧹 LocalStorage · ${lsCleared}`);
      await new Promise(r => setTimeout(r, 200));

      // 3) Cache Storage
      try {
        if ("caches" in window) {
          const ks = await caches.keys();
          cachesCleared = ks.length;
          await Promise.all(ks.map(k => caches.delete(k)));
        }
      } catch {}
      setStatus(`💾 Cache Storage · ${cachesCleared}`);
      await new Promise(r => setTimeout(r, 200));

      // 4) Service Worker
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          swUnreg = regs.length;
          await Promise.all(regs.map(r => r.unregister()));
        }
      } catch {}
      setStatus(`⚙️ Service Worker · ${swUnreg}`);
      await new Promise(r => setTimeout(r, 200));

      // 5) 로그인 복원 (SW unregister가 localStorage 건드릴 수 있어 재기록)
      try {
        for (const [k, v] of Object.entries(preserved)) {
          if (localStorage.getItem(k) !== v) localStorage.setItem(k, v);
        }
      } catch {}

      const summary = `로그인 유지:${authKept} · LS:${lsCleared} · Cache:${cachesCleared} · SW:${swUnreg}`;
      setStatus(`✅ 완료`);
      try { sessionStorage.setItem(TOAST_KEY, `✅ 캐시 정리됨 — ${summary}`); } catch {}
      await new Promise(r => setTimeout(r, 500));
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
