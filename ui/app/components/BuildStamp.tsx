"use client";
import { useEffect, useState } from "react";

interface BuildInfo {
  build: string;
  fetchedAt: number;
}

export default function BuildStamp() {
  const [info, setInfo] = useState<BuildInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok || cancelled) return;
        const j = await r.json();
        if (!cancelled) setInfo({ build: j.build ?? "?", fetchedAt: Date.now() });
      } catch {
        if (!cancelled) setInfo({ build: "offline", fetchedAt: Date.now() });
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const buildLabel = (() => {
    if (!info) return "…";
    if (info.build === "PLACEHOLDER") return "dev";
    if (info.build === "offline") return "offline";
    return info.build.split("-")[0];
  })();

  const tone =
    buildLabel === "dev" ? "bg-yellow-400/20 text-yellow-300 border-yellow-400/40"
    : buildLabel === "offline" ? "bg-red-400/20 text-red-300 border-red-400/40"
    : "bg-green-400/20 text-green-300 border-green-400/40";

  const clearAllCaches = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      try {
        const keys = ["hq-build-id", "hq-floor-teams-order", "hq-chat-history", "hq-floor-layout"];
        keys.forEach(k => localStorage.removeItem(k));
      } catch {}
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
      } catch {}
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
      } catch {}
      const url = `${location.pathname}?cb=${Date.now()}`;
      location.replace(url);
    } finally {
      setClearing(false);
    }
  };

  const copyHash = async () => {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.build);
    } catch {}
  };

  return (
    <div className="fixed bottom-1.5 right-1.5 z-[9999] text-[10px] select-none">
      {open ? (
        <div className={`flex items-center gap-1 px-2 py-1 rounded border ${tone} backdrop-blur bg-[#0f0f1f]/80`}>
          <span className="font-mono opacity-90" title={info?.build}>build: {buildLabel}</span>
          <button
            type="button"
            onClick={copyHash}
            className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 active:bg-white/30"
            title="해시 복사"
          >
            📋
          </button>
          <button
            type="button"
            onClick={clearAllCaches}
            disabled={clearing}
            className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 active:bg-white/30 disabled:opacity-50"
            title="캐시 초기화 + 강제 새로고침"
          >
            {clearing ? "…" : "🔄"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-1 py-0.5 rounded hover:bg-white/10"
            title="접기"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`font-mono px-1.5 py-0.5 rounded border ${tone} backdrop-blur bg-[#0f0f1f]/60 hover:bg-[#0f0f1f]/90`}
          title={`build: ${info?.build ?? "loading"} · 클릭해서 캐시 초기화 메뉴`}
        >
          {buildLabel}
        </button>
      )}
    </div>
  );
}
