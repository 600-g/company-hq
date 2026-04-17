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
          // 편집 중이면 리로드 보류 — 토스트만 남겨 사용자가 수동으로 새로고침
          const isEditing = ((window as unknown as { __hqEditingUntil?: number }).__hqEditingUntil ?? 0) > Date.now();
          window.dispatchEvent(new CustomEvent("hq:toast", {
            detail: {
              text: isEditing
                ? `🔄 새 버전 (${build.slice(0, 8)}) — 편집 끝나면 수동 새로고침`
                : `🔄 새 버전 (${build.slice(0, 8)}) 배포됨 — 15초 후 새로고침`,
              variant: "info",
              ms: 15000,
            },
          }));
          if (isEditing) return;
          // 15초 후 부드럽게 리로드 (급하지 않게)
          setTimeout(() => {
            if (cancelled) return;
            // 리로드 직전 한 번 더 편집 중 체크
            const stillEditing = ((window as unknown as { __hqEditingUntil?: number }).__hqEditingUntil ?? 0) > Date.now();
            if (stillEditing) return;
            try {
              if ("caches" in window) caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k))));
            } catch {}
            location.replace(`${location.pathname}?v=${build}`);
          }, 15000);
        }
      } catch {}
    };
    check();
    const id = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  return null;
}
