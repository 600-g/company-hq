"use client";

/** 가벼운 토스트 — 외부 라이브러리 없이 DOM 직접 조작.
 *  3초 자동 사라짐. 상단 중앙. 다크 테마.
 */

let _container: HTMLDivElement | null = null;

function ensureContainer(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  if (_container && document.body.contains(_container)) return _container;
  const div = document.createElement("div");
  div.id = "doogeun-toast-container";
  div.style.cssText = [
    "position:fixed",
    "top:16px",
    "left:50%",
    "transform:translateX(-50%)",
    "z-index:9999",
    "display:flex",
    "flex-direction:column",
    "gap:6px",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(div);
  _container = div;
  return div;
}

export type ToastKind = "info" | "warn" | "error" | "success";

// 강한 대비 — 다크/라이트 어디서든 잘 보이게 진한 배경 + 두꺼운 보더 + 밝은 텍스트
const STYLES: Record<ToastKind, { bg: string; bd: string; fg: string }> = {
  info:    { bg: "rgba(8,47,73,0.98)",  bd: "rgba(56,189,248,0.9)",  fg: "#e0f2fe" },
  warn:    { bg: "rgba(69,26,3,0.98)",  bd: "rgba(251,191,36,0.95)", fg: "#fef3c7" },
  error:   { bg: "rgba(69,10,10,0.98)", bd: "rgba(239,68,68,0.95)",  fg: "#fee2e2" },
  success: { bg: "rgba(6,46,28,0.98)",  bd: "rgba(52,211,153,0.95)", fg: "#d1fae5" },
};

export function toast(message: string, kind: ToastKind = "info", durationMs = 3000) {
  if (typeof document === "undefined") return;
  const c = ensureContainer();
  if (!c) return;
  const el = document.createElement("div");
  const s = STYLES[kind];
  el.style.cssText = [
    `background:${s.bg}`,
    `border:2px solid ${s.bd}`,
    `color:${s.fg}`,
    "padding:10px 16px",
    "border-radius:10px",
    "font-size:13.5px",
    "font-weight:700",
    "box-shadow:0 6px 20px rgba(0,0,0,0.5)",
    "opacity:0",
    "transform:translateY(-6px)",
    "transition:opacity 200ms,transform 200ms",
    "pointer-events:auto",
    "max-width:90vw",
    "backdrop-filter:blur(8px)",
  ].join(";");
  el.textContent = message;
  c.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-6px)";
    setTimeout(() => { try { c.removeChild(el); } catch { /* */ } }, 250);
  }, durationMs);
}

export const toastNoPermission = (label = "이 동작") =>
  toast(`🔒 ${label} 권한이 없습니다.`, "warn", 3000);
