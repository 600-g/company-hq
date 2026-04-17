/**
 * 브라우저 진단 로그 수집 — console.info/warn/error 인터셉트 후 서버로 포워드.
 * 원본 console.* 동작은 유지 (UX 영향 없음).
 *
 * 사용: 앱 루트에서 initDiag() 1회 호출.
 */

interface LogEntry {
  level: "info" | "warn" | "error" | "debug";
  msg: string;
  ts: string;
  ua: string;
  url: string;
  user: string;
}

const BUFFER: LogEntry[] = [];
const RING: LogEntry[] = [];      // 최근 N개 링버퍼 (리포트용)
const RING_MAX = 500;
const BATCH_MAX = 100;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let inited = false;

function _apiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h === "127.0.0.1" || h.endsWith(".local") || h.startsWith("192.168.");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

function _user(): string {
  try {
    const raw = localStorage.getItem("hq-auth-user");
    if (!raw) return "";
    const u = JSON.parse(raw);
    return u?.nickname || u?.id || "";
  } catch { return ""; }
}

function _stringify(args: unknown[]): string {
  return args.map(a => {
    if (a == null) return String(a);
    if (typeof a === "string") return a;
    if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ""}`;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(" ").slice(0, 2000);
}

function _push(level: LogEntry["level"], args: unknown[]) {
  const entry: LogEntry = {
    level,
    msg: _stringify(args),
    ts: new Date().toISOString(),
    ua: navigator.userAgent.slice(0, 200),
    url: location.pathname + location.search,
    user: _user(),
  };
  RING.push(entry);
  if (RING.length > RING_MAX) RING.shift();
  BUFFER.push(entry);
  _scheduleFlush();
}

function _scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(_flush, 2000);
}

async function _flush() {
  flushTimer = null;
  if (BUFFER.length === 0) return;
  const batch = BUFFER.splice(0, BATCH_MAX);
  try {
    await fetch(`${_apiBase()}/api/diag/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: batch }),
      keepalive: true,
    });
  } catch { /* 실패해도 무시 (네트워크 불안정 시) */ }
  if (BUFFER.length > 0) _scheduleFlush();
}

export function getRecentLogs(): LogEntry[] {
  return [...RING];
}

export async function submitBugReport(title: string, note: string): Promise<{ ok: boolean; issueUrl?: string }> {
  const body = {
    title,
    note,
    logs: getRecentLogs(),
    meta: {
      ua: navigator.userAgent,
      url: location.href,
      build: (() => {
        try { return localStorage.getItem("hq-build-id") || ""; } catch { return ""; }
      })(),
      user: _user(),
      screen: `${screen.width}x${screen.height}`,
      viewport: `${innerWidth}x${innerHeight}`,
      ts: new Date().toISOString(),
    },
  };
  try {
    const r = await fetch(`${_apiBase()}/api/diag/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    return { ok: !!d.ok, issueUrl: d.issue_url || undefined };
  } catch {
    return { ok: false };
  }
}

export function initDiag(): void {
  if (inited || typeof window === "undefined") return;
  inited = true;

  const orig = {
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    log: console.log.bind(console),
  };

  console.info = (...args: unknown[]) => { orig.info(...args); _push("info", args); };
  console.warn = (...args: unknown[]) => { orig.warn(...args); _push("warn", args); };
  console.error = (...args: unknown[]) => { orig.error(...args); _push("error", args); };
  // console.log 은 너무 많아 제외 (info/warn/error만 수집)

  // 처리되지 않은 에러/promise
  window.addEventListener("error", (ev) => {
    _push("error", [`[window.error] ${ev.message}`, ev.filename + ":" + ev.lineno]);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    _push("error", ["[unhandledrejection]", ev.reason]);
  });

  // 페이지 떠날 때 남은 버퍼 flush
  window.addEventListener("beforeunload", () => {
    if (BUFFER.length > 0) {
      const url = `${_apiBase()}/api/diag/log`;
      try {
        navigator.sendBeacon(url, new Blob([JSON.stringify({ entries: BUFFER.splice(0) })], { type: "application/json" }));
      } catch { /* ignore */ }
    }
  });
}
