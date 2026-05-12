"use client";

/**
 * 클라이언트 진단 로그 수집 (링 버퍼).
 *  - console.log / info / warn / error 인터셉트
 *  - 메모리에 최근 N개만 보관 (토큰 X, 네트워크 X)
 *  - 버그 리포트 전송 시 logs 배열에 동봉
 *  - unhandledrejection / window.onerror 도 캡처
 */

export interface DiagLog {
  level: "log" | "info" | "warn" | "error";
  msg: string;
  ts: string;
  url?: string;
  ua?: string;
}

const RING_SIZE = 500;
const ring: DiagLog[] = [];

let initialized = false;

function push(level: DiagLog["level"], args: unknown[]) {
  try {
    const msg = args
      .map((a) => {
        if (typeof a === "string") return a;
        try { return JSON.stringify(a); } catch { return String(a); }
      })
      .join(" ")
      .slice(0, 2000); // 개별 메시지 최대 2KB
    ring.push({
      level,
      msg,
      ts: new Date().toISOString(),
      url: typeof window !== "undefined" ? window.location.pathname : undefined,
      ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : undefined,
    });
    if (ring.length > RING_SIZE) ring.shift();
  } catch {}
}

export function initDiag() {
  if (initialized) return;
  if (typeof window === "undefined") return;
  initialized = true;

  const origLog = console.log;
  const origInfo = console.info;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = (...args: unknown[]) => { push("log", args); origLog.apply(console, args); };
  console.info = (...args: unknown[]) => { push("info", args); origInfo.apply(console, args); };
  console.warn = (...args: unknown[]) => { push("warn", args); origWarn.apply(console, args); };
  console.error = (...args: unknown[]) => { push("error", args); origError.apply(console, args); };

  window.addEventListener("error", (e) => {
    push("error", [`[window.onerror] ${e.message}`, e.filename, e.lineno, e.colno]);
    maybeChunkReload(e.message, e.filename);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = (e as PromiseRejectionEvent).reason;
    const msg = reason?.message || String(reason || "");
    push("error", [`[unhandledrejection] ${msg || "?"}`]);
    maybeChunkReload(msg);
  });
}

// 배포 직후 옛 chunk 해시가 404 되어 "페이지 못 불러옴" 발생 시 자동 새로고침.
// 무한 루프 방지: sessionStorage 1회 가드 (새 탭/시크릿 = 리셋)
function maybeChunkReload(msg?: string, filename?: string) {
  if (typeof window === "undefined") return;
  const text = `${msg || ""} ${filename || ""}`;
  const isChunkErr = /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i.test(text);
  if (!isChunkErr) return;
  try {
    if (sessionStorage.getItem("chunk-reload-once")) return;
    sessionStorage.setItem("chunk-reload-once", "1");
  } catch {}
  setTimeout(() => location.reload(), 100);
}

/** 현재 링 버퍼 스냅샷 (버그 리포트 전송 시 호출) */
export function getRecentLogs(limit = 500): DiagLog[] {
  return ring.slice(-limit);
}
