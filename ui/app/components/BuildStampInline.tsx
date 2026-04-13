"use client";
import { useEffect, useState } from "react";

interface Props {
  appVersion: string;
}

export default function BuildStampInline({ appVersion }: Props) {
  const [build, setBuild] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok || cancelled) return;
        const j = await r.json();
        if (!cancelled) setBuild(j.build ?? null);
      } catch {}
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const buildLabel = !build ? "…" : build === "PLACEHOLDER" ? "dev" : build.split("-")[0];
  const tone =
    buildLabel === "dev" ? "text-yellow-500/70"
    : buildLabel === "…" ? "text-gray-700"
    : "text-green-500/70";

  const clearAllCaches = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      try {
        ["hq-build-id", "hq-floor-teams-order", "hq-chat-history", "hq-floor-layout", "hq-arcade-pos", "hq-server-pos"]
          .forEach(k => localStorage.removeItem(k));
      } catch {}
      try {
        if ("caches" in window) {
          const ks = await caches.keys();
          await Promise.all(ks.map(k => caches.delete(k)));
        }
      } catch {}
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
      } catch {}
      location.replace(`${location.pathname}?cb=${Date.now()}`);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="mt-2 flex items-center justify-center gap-1.5 text-[8px] text-gray-700 font-mono">
      <span>v{appVersion}</span>
      <span className="opacity-50">·</span>
      <span className={tone} title={build ?? "loading"}>{buildLabel}</span>
      <button
        type="button"
        onClick={clearAllCaches}
        disabled={clearing}
        className="ml-1 opacity-60 hover:opacity-100 active:opacity-100 disabled:opacity-30 transition-opacity"
        title="캐시 초기화 + 강제 새로고침"
      >
        {clearing ? "…" : "🔄"}
      </button>
      <span className="opacity-50">·</span>
      <span>(주)두근 컴퍼니</span>
    </div>
  );
}
