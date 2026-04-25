import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 백엔드 API base — 로컬은 FastAPI 8000, 프로덕션은 api.600g.net */
export function apiBase(): string {
  if (typeof window === "undefined") return "http://localhost:8000";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h === "127.0.0.1" || h.endsWith(".local") || h.startsWith("192.168.");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

/** WebSocket base — 로컬 ws://8000, 프로덕션 wss://api.600g.net (CF Tunnel WS 지원 안하면 HTTP 폴백) */
export function wsBase(): string {
  if (typeof window === "undefined") return "ws://localhost:8000";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h === "127.0.0.1" || h.endsWith(".local") || h.startsWith("192.168.");
  return isLocal ? `ws://${h}:8000` : "wss://api.600g.net";
}
