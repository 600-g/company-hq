"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

const KEEP_KEYS = ["doogeun-hq-auth", "doogeun-hq-settings"];

/** 강제 새로고침 — 로그인/설정 보존, 나머지 localStorage + Cache Storage + SW unregister + hard reload */
export default function CacheBust() {
  const [clearing, setClearing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const clear = async () => {
    if (clearing) return;
    setClearing(true);
    let kept = 0, lsCleared = 0, cachesCleared = 0, swUnreg = 0;
    try {
      // 보존 키 스냅샷
      const keep: Record<string, string> = {};
      for (const k of KEEP_KEYS) {
        const v = localStorage.getItem(k);
        if (v !== null) { keep[k] = v; kept++; }
      }
      setStatus("🔐 로그인/설정 보존");
      await new Promise((r) => setTimeout(r, 150));

      // localStorage 전부 삭제 (keep 제외)
      const allKeys = [...Array(localStorage.length).keys()].map((i) => localStorage.key(i) || "").filter(Boolean);
      for (const k of allKeys) if (!(k in keep)) { localStorage.removeItem(k); lsCleared++; }
      setStatus(`🧹 LocalStorage ${lsCleared}`);
      await new Promise((r) => setTimeout(r, 200));

      // Cache Storage
      if ("caches" in window) {
        const ks = await caches.keys();
        cachesCleared = ks.length;
        await Promise.all(ks.map((k) => caches.delete(k)));
      }
      setStatus(`💾 Cache ${cachesCleared}`);
      await new Promise((r) => setTimeout(r, 200));

      // Service Worker
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        swUnreg = regs.length;
        await Promise.all(regs.map((r) => r.unregister()));
      }
      setStatus(`⚙️ SW ${swUnreg}`);
      await new Promise((r) => setTimeout(r, 200));

      // 보존 키 복원
      for (const [k, v] of Object.entries(keep)) if (localStorage.getItem(k) !== v) localStorage.setItem(k, v);

      setStatus("✅ 완료");
      await new Promise((r) => setTimeout(r, 400));
      location.replace(`${location.pathname}?cb=${Date.now()}`);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-1 text-[11px] text-gray-500 font-mono">
      <span>유지 {KEEP_KEYS.length}</span>
      <Button variant="ghost" size="icon" onClick={clear} disabled={clearing} title="캐시 전체 초기화 + 강제 새로고침 (로그인 유지)">
        <RefreshCw className={`w-3.5 h-3.5 ${clearing ? "animate-spin" : ""}`} />
      </Button>
      {status && <span className="text-cyan-400 ml-1">{status}</span>}
    </div>
  );
}
