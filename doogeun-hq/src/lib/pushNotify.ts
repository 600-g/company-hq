"use client";

/**
 * Web Push 알림 유틸.
 *   - Notification permission 요청
 *   - Service Worker 등록 (/sw-notify.js)
 *   - VAPID 구독 → 서버 등록 (선택)
 *   - 로컬 알림 트리거 (서버 push 없이도 동작)
 */

const SW_PATH = "/sw-notify.js";
const SW_SCOPE = "/";

export interface NotifyPayload {
  title: string;
  body?: string;
  tag?: string;
  url?: string;
}

let swRegPromise: Promise<ServiceWorkerRegistration | null> | null = null;

function getSW(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  if (swRegPromise) return swRegPromise;
  swRegPromise = navigator.serviceWorker
    .register(SW_PATH, { scope: SW_SCOPE })
    .catch((err) => { console.warn("[pushNotify] SW register failed", err); return null; });
  return swRegPromise;
}

export async function ensureNotifyPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    const p = await Notification.requestPermission();
    return p;
  } catch {
    return "denied";
  }
}

/** 로컬 알림 (서버 push 없이 SW message로) */
export async function showLocalNotify(payload: NotifyPayload): Promise<boolean> {
  if (typeof window === "undefined" || document.hasFocus()) return false;
  const perm = Notification.permission;
  if (perm !== "granted") return false;
  const reg = await getSW();
  if (!reg || !reg.active) {
    // 폴백: 직접 Notification 객체
    try {
      new Notification(payload.title, { body: payload.body, icon: "/icon-192.png", tag: payload.tag });
      return true;
    } catch { return false; }
  }
  reg.active.postMessage({ type: "notify", ...payload });
  return true;
}

/** VAPID 구독 — 서버가 VAPID public key 제공할 때만 */
export async function subscribePush(vapidPublicKey: string, onEndpoint: (sub: PushSubscription) => void | Promise<void>) {
  const reg = await getSW();
  if (!reg) return;
  const perm = await ensureNotifyPermission();
  if (perm !== "granted") return;
  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) { await onEndpoint(existing); return; }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    await onEndpoint(sub);
  } catch (e) {
    console.warn("[pushNotify] subscribe failed", e);
  }
}

function urlBase64ToUint8Array(b64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}
