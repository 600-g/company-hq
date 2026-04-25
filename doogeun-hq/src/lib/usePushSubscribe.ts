"use client";

import { useEffect } from "react";
import { apiBase } from "@/lib/utils";
import { subscribePush } from "@/lib/pushNotify";
import { useNotifStore } from "@/stores/notifyStore";

const SUB_SENT_KEY = "doogeun-hq-push-sub-endpoint";

/**
 * Web Push 자동 구독 + SW 메시지 → in-app toast 연결.
 *  · hub 진입 시 1회 실행 (localStorage 로 endpoint dedupe)
 *  · 119 guard 알림 (tag: "119-alert") 도착 시 SW → postMessage → toast 노출
 *  · 브라우저/탭 포커스 여부와 무관하게 OS 노출은 SW 가 이미 처리
 */
export function usePushSubscribe() {
  const notify = useNotifStore((s) => s.push);

  useEffect(() => {
    // 1) SW 메시지 → toast (앱 열려 있을 때)
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || d.type !== "push") return;
      const tag = d.tag || "";
      const level = tag.includes("119") || tag.includes("alert") ? "error" : "info";
      notify(level, d.title || "알림", d.body || "", tag || "push");
    };
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMsg);
    }

    // 2) VAPID 구독 (이미 등록된 endpoint 면 스킵)
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${apiBase()}/api/push/vapid-key`);
        if (!r.ok) return;
        const { publicKey } = await r.json();
        if (!publicKey || cancelled) return;

        const lastSent = typeof window !== "undefined" ? localStorage.getItem(SUB_SENT_KEY) : null;

        await subscribePush(publicKey, async (sub) => {
          // sub endpoint 가 이전과 같으면 재등록 스킵
          if (sub.endpoint === lastSent) return;
          const res = await fetch(`${apiBase()}/api/push/subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription: sub.toJSON() }),
          });
          if (res.ok) {
            try { localStorage.setItem(SUB_SENT_KEY, sub.endpoint); } catch {}
          }
        });
      } catch {}
    })();

    return () => {
      cancelled = true;
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onMsg);
      }
    };
  }, [notify]);
}
