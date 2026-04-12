"use client";
import { useEffect } from "react";

const KEY = "hq-build-id";

export default function VersionCheck() {
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const { build } = await r.json();
        if (!build || build === "PLACEHOLDER") return;
        const stored = localStorage.getItem(KEY);
        if (!stored) { localStorage.setItem(KEY, build); return; }
        if (stored !== build && !cancelled) {
          localStorage.setItem(KEY, build);
          // 캐시 싹 비우고 강제 리로드
          try {
            if ("caches" in window) {
              const keys = await caches.keys();
              await Promise.all(keys.map(k => caches.delete(k)));
            }
            if ("serviceWorker" in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              await Promise.all(regs.map(r => r.unregister()));
            }
          } catch {}
          location.replace(`${location.pathname}?v=${build}`);
        }
      } catch {}
    };
    check();
    const id = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  return null;
}
