"use client";

import { useEffect, useRef } from "react";
import { apiBase } from "@/lib/utils";
import { useAgentStore, type Agent } from "@/stores/agentStore";
import { useLayoutStore } from "@/stores/layoutStore";

type ServerState = {
  agents: Agent[];
  layout: { floors: Record<number, unknown[]> };
  version: number;
  updated_at: string | null;
};

/** doogeun-hq 상태 서버 동기화 (HTTP-only, WS 없음 — CF Tunnel 안정)
 *  - 마운트: GET /api/doogeun/state → 로컬 스토어에 병합 (서버 우선)
 *  - 로컬 변경 감지 → 디바운스 1초 → PUT
 *  - 30초 polling — 다른 디바이스 변경 감지 (WS 대체)
 *  - 에러는 조용히 무시 (로컬은 localStorage 로 계속 작동)
 */
export function useStateSync() {
  const lastSyncedRef = useRef<string>("");     // 마지막 직렬화 (중복 요청 방지)
  const applyingRemoteRef = useRef(false);       // 원격 적용 중 → 로컬 subscribe 에서 PUT 안 함
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let mounted = true;

    // ── 초기 로드 (서버 → 로컬). 로컬이 비어있는 게 아니라면 서버가 기준
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/doogeun/state`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted || !data?.ok || !data.state) return;
        applyRemote(data.state);
      } catch {
        // 로컬 localStorage 로 작동 계속 — 에러 무시
      }
    })();

    // ── 로컬 변경 → 디바운스 → PUT
    const scheduleSync = () => {
      if (applyingRemoteRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const agents = useAgentStore.getState().agents;
        const floors = useLayoutStore.getState().floors;
        const serialized = JSON.stringify({ agents, floors });
        if (serialized === lastSyncedRef.current) return;
        try {
          const res = await fetch(`${apiBase()}/api/doogeun/state`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agents, layout: { floors } }),
          });
          if (res.ok) lastSyncedRef.current = serialized;
        } catch {
          // 네트워크 에러 — 다음 변경 시 재시도
        }
      }, 3000);  // 1s → 3s — Mac 부담 ↓ (네트워크/디스크 I/O 1/3)
    };

    const unsubAgents = useAgentStore.subscribe(scheduleSync);
    const unsubLayout = useLayoutStore.subscribe(scheduleSync);

    // ── 30초 polling (다른 디바이스 변경 감지)
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${apiBase()}/api/doogeun/state`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted || !data?.ok || !data.state) return;
        const serverSerialized = JSON.stringify({
          agents: data.state.agents ?? [],
          floors: data.state.layout?.floors ?? {},
        });
        // 로컬이 서버와 다르고, 우리가 직전에 PUT 한 것도 아니면 → 원격 변경으로 간주
        if (serverSerialized !== lastSyncedRef.current) {
          applyRemote(data.state);
        }
      } catch {
        // ignore
      }
    }, 60_000);   // 30s → 60s — Mac FastAPI GET 호출 1/2

    return () => {
      mounted = false;
      unsubAgents();
      unsubLayout();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  function applyRemote(state: ServerState) {
    applyingRemoteRef.current = true;
    try {
      // 🛡 빈 데이터 우선 방지 — 서버가 비어있으면 로컬 보존
      // 시나리오: 마운트 첫 GET 시 서버가 빈 상태면 로컬 가구가 날아감 → PUT 으로 빈 상태 굳음
      const localAgents = useAgentStore.getState().agents;
      const localFloors = useLayoutStore.getState().floors;
      const localHasFloors = Object.keys(localFloors || {}).length > 0;
      const remoteHasFloors = state.layout?.floors && Object.keys(state.layout.floors).length > 0;

      // agents: 서버 비어있고 로컬 있으면 로컬 유지
      if (Array.isArray(state.agents) && (state.agents.length > 0 || localAgents.length === 0)) {
        useAgentStore.setState({ agents: state.agents });
      }
      // floors: 서버 비어있고 로컬 있으면 로컬 유지 (가구 데이터 손실 방지 — 핵심)
      if (state.layout?.floors && typeof state.layout.floors === "object" && (remoteHasFloors || !localHasFloors)) {
        useLayoutStore.setState({ floors: state.layout.floors as Record<number, never[]> });
      }
      // lastSynced 기준은 "현재 로컬 상태" (서버 무시 시 즉시 PUT 트리거되도록)
      const finalAgents = useAgentStore.getState().agents;
      const finalFloors = useLayoutStore.getState().floors;
      lastSyncedRef.current = JSON.stringify({ agents: finalAgents, floors: finalFloors });
    } finally {
      setTimeout(() => { applyingRemoteRef.current = false; }, 50);
    }
  }
}
