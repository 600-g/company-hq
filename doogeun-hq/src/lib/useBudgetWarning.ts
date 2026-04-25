"use client";

import { useEffect, useRef } from "react";
import { apiBase } from "@/lib/utils";
import { useNotifStore } from "@/stores/notifyStore";
import { showLocalNotify } from "@/lib/pushNotify";

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2분
const RATE_LIMIT_SEEN_KEY = "doogeun-hq-rate-limit-seen";

function loadLastSeen(): number {
  if (typeof window === "undefined") return 0;
  try { return parseFloat(localStorage.getItem(RATE_LIMIT_SEEN_KEY) || "0") || 0; }
  catch { return 0; }
}
function saveLastSeen(ts: number) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(RATE_LIMIT_SEEN_KEY, String(ts)); } catch {}
}

/** Max 플랜 rate_limit_event 만 알림. 모호한 "컨텍스트 %" 는 제거됨. */
export function useBudgetWarning() {
  const notify = useNotifStore((s) => s.push);
  const lastRateLimitTsRef = useRef<number>(loadLastSeen());

  useEffect(() => {
    let stopped = false;

    const check = async () => {
      try {
        const bRes = await fetch(`${apiBase()}/api/budget`);
        if (!bRes.ok) return;
        const b = await bRes.json();
        const rl = b.max_plan_rate_limit as { status?: string; type?: string; resets_at?: number; recorded_at?: number } | null;
        if (!rl || !rl.recorded_at) return;
        if (rl.recorded_at <= lastRateLimitTsRef.current) return;
        if (!rl.status || rl.status === "allowed") return;

        lastRateLimitTsRef.current = rl.recorded_at;
        saveLastSeen(rl.recorded_at);

        let resetStr = "";
        if (rl.resets_at) {
          const d = new Date(rl.resets_at * 1000);
          const hh = d.getHours().toString().padStart(2, "0");
          const mm = d.getMinutes().toString().padStart(2, "0");
          resetStr = ` (리셋 ${hh}:${mm})`;
        }
        const level = (rl.status === "exceeded" || rl.status === "blocked") ? "error" : "warning";
        const title = `${level === "error" ? "🔴" : "⚠️"} Max 플랜 ${rl.type} 한도: ${rl.status}${resetStr}`;
        const body = `Claude CLI 가 발송한 rate_limit_event 한 번만 표시.`;
        notify(level, title, body, "rate-limit");
        showLocalNotify({ title, body, tag: `rate-limit-${rl.type}-${rl.recorded_at}` });
      } catch {}
    };

    check();
    const id = setInterval(() => { if (!stopped) check(); }, POLL_INTERVAL_MS);
    return () => { stopped = true; clearInterval(id); };
  }, [notify]);
}
