"use client";

/** 인증 토큰 자동 부착 fetch + WS URL 빌더 + 캐시 삭제에도 살아남는 토큰 영속화.
 *
 * - localStorage 외에 cookie ("doogeun-hq-token") 에도 백업 → 사용자가 SW/캐시 삭제해도 보존
 * - Authorization: Bearer 헤더 자동 부착
 * - WS 연결 시 ?token=… 자동 부착
 */

import { apiBase, wsBase } from "./utils";

const TOKEN_COOKIE = "doogeun-hq-token";
const COOKIE_DAYS = 90;

function setCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  // SameSite=Lax — 캐시 삭제로 localStorage 날아가도 쿠키는 살아남음
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function clearCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

/** localStorage + cookie 양쪽에서 토큰 조회 (캐시 삭제 복원용) */
export function readToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("doogeun-hq-auth");
    if (raw) {
      const parsed = JSON.parse(raw);
      const t = parsed?.state?.token;
      if (t) return t;
    }
  } catch {
    /* ignore */
  }
  return getCookie(TOKEN_COOKIE);
}

/** 토큰 저장 (양쪽). 로그인 시 호출. */
export function persistToken(token: string) {
  setCookie(TOKEN_COOKIE, token, COOKIE_DAYS);
}

/** 토큰 + auth state 완전 삭제. 명시 로그아웃 시만 호출. */
export function clearToken() {
  clearCookie(TOKEN_COOKIE);
}

/** 권한 토큰을 자동 부착하는 fetch.
 *  - Authorization: Bearer <token> 헤더 자동
 *  - JSON body 면 Content-Type 자동
 *  - 401 응답 시 onUnauthorized 콜백 호출 (옵션)
 */
export async function authFetch(
  path: string,
  options: RequestInit & { json?: unknown; onUnauthorized?: () => void } = {},
): Promise<Response> {
  const { json, onUnauthorized, ...rest } = options;
  const token = readToken();
  const headers = new Headers(rest.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let body: BodyInit | null | undefined = rest.body;
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }
  const url = path.startsWith("http") ? path : `${apiBase()}${path}`;
  const res = await fetch(url, { ...rest, headers, body });
  if (res.status === 401 && onUnauthorized) onUnauthorized();
  return res;
}

/** WS URL 빌더 — 토큰 + session_id 자동 부착 */
export function buildWsUrl(teamId: string, sessionId?: string | null): string {
  const params = new URLSearchParams();
  const token = readToken();
  if (token) params.set("token", token);
  if (sessionId) params.set("session_id", sessionId);
  const qs = params.toString();
  return `${wsBase()}/ws/chat/${encodeURIComponent(teamId)}${qs ? `?${qs}` : ""}`;
}
