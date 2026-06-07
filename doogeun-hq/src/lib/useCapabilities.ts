"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api";

/** 현재 사용자의 capability 집합을 백엔드에서 가져와 캐싱.
 *
 * /api/auth/me/setup 응답의 capabilities 배열을 그대로 Set 으로 저장.
 * 5분 캐싱 (sessionStorage).
 *
 * 사용 예:
 *   const { has, ready } = useCapabilities();
 *   if (!ready) return <Loading/>;
 *   if (!has("edit_scene")) return <NoPermission/>;
 */

const STORAGE_KEY = "doogeun-hq-capabilities";
const TTL_MS = 5 * 60 * 1000;

interface CachedCaps {
  caps: string[];
  ts: number;
}

function readCache(): CachedCaps | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCaps;
    if (Date.now() - parsed.ts > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(caps: string[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ caps, ts: Date.now() }));
  } catch { /* ignore */ }
}

export function clearCapabilitiesCache() {
  if (typeof window === "undefined") return;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export function useCapabilities() {
  // 캐시는 초기 깜빡임 방지용 — 마운트 즉시 서버에서 fresh 재페치 (사용자 전환 시 stale 방어)
  const [caps, setCaps] = useState<Set<string>>(() => {
    const cached = readCache();
    return cached ? new Set(cached.caps) : new Set();
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/api/auth/me/setup");
        if (cancelled) return;
        if (res.ok) {
          const d = await res.json();
          if (d?.ok && Array.isArray(d.capabilities)) {
            const list: string[] = d.capabilities;
            writeCache(list);
            setCaps(new Set(list));
          }
        } else if (res.status === 401 || res.status === 403) {
          // 토큰 무효 또는 권한 없음 → 캐시 무효화 (옛 사용자 권한 흔적 제거)
          clearCapabilitiesCache();
          setCaps(new Set());
        }
      } catch { /* ignore */ }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  return {
    has: (cap: string) => caps.has(cap),
    hasAny: (...arr: string[]) => arr.some((c) => caps.has(c)),
    all: caps,
    ready,
  };
}
