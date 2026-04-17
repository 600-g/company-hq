/**
 * 사무실 편집 유틸 (TeamMaker officeStore 핵심 포팅).
 *
 * 포트한 부분:
 * - Undo/Redo 히스토리 (max 20 스냅샷)
 * - 레이아웃 Import/Export (JSON)
 * - 리셋 (기본 위치로)
 *
 * 포트 안 한 부분 (Sprint 6+ 대상):
 * - 실시간 가구 편집 팔레트 (TileSelector, Palette)
 * - 벽/바닥 타일 그리기
 * - 레이어 순서 조정 UI
 */

export interface LayoutSnapshot {
  // 오브젝트 위치 (arcade, server 등)
  objects: Record<string, { x: number; y: number }>;
  // 팀 순서 (층별)
  floorTeams: Record<number, string[]>;
  // 타임스탬프 (디버그용)
  at: number;
  // 스냅샷 설명
  label?: string;
}

const MAX_HISTORY = 20;

const LS_OBJECT_KEYS = ["hq-arcade-pos", "hq-server-pos"] as const;
const LS_FLOOR_TEAMS = "hq-floor-teams-order";

// 편집 중 플래그 (서버 폴링/VersionCheck 리로드 차단용).
// 값 = 만료 시각(ms). 현재 시각 < 값이면 "편집 중".
declare global {
  interface Window {
    __hqEditingUntil?: number;
  }
}

const EDITING_GRACE_MS = 30_000;

export function markEditing(extraMs: number = EDITING_GRACE_MS): void {
  if (typeof window === "undefined") return;
  window.__hqEditingUntil = Date.now() + extraMs;
}

export function isEditing(): boolean {
  if (typeof window === "undefined") return false;
  const until = window.__hqEditingUntil ?? 0;
  return until > Date.now();
}

// ── 현재 레이아웃 스냅샷 캡처 ──

export function captureSnapshot(label?: string): LayoutSnapshot {
  const objects: Record<string, { x: number; y: number }> = {};
  for (const key of LS_OBJECT_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) objects[key] = JSON.parse(raw);
    } catch {}
  }
  let floorTeams: Record<number, string[]> = {};
  try {
    const raw = localStorage.getItem(LS_FLOOR_TEAMS);
    if (raw) floorTeams = JSON.parse(raw);
  } catch {}
  return { objects, floorTeams, at: Date.now(), label };
}

// ── 스냅샷 복원 ──

export function restoreSnapshot(snap: LayoutSnapshot): void {
  for (const [key, pos] of Object.entries(snap.objects)) {
    localStorage.setItem(key, JSON.stringify(pos));
  }
  localStorage.setItem(LS_FLOOR_TEAMS, JSON.stringify(snap.floorTeams));
}

// ── 히스토리 스택 ──

interface HistoryState {
  past: LayoutSnapshot[];
  future: LayoutSnapshot[];
}

const historyState: HistoryState = { past: [], future: [] };

/** 변경 전 현재 상태를 히스토리에 추가. redo 스택 리셋. */
export function pushHistory(label?: string): void {
  const snap = captureSnapshot(label);
  historyState.past.push(snap);
  if (historyState.past.length > MAX_HISTORY) {
    historyState.past.shift();
  }
  historyState.future = []; // redo 체인 끊음
  markEditing();
}

export function canUndo(): boolean {
  return historyState.past.length > 0;
}

export function canRedo(): boolean {
  return historyState.future.length > 0;
}

/** 이전 상태로 복원. 현재 상태는 redo 스택으로. */
export function undo(): LayoutSnapshot | null {
  const prev = historyState.past.pop();
  if (!prev) return null;
  const current = captureSnapshot("redo-point");
  historyState.future.push(current);
  restoreSnapshot(prev);
  return prev;
}

export function redo(): LayoutSnapshot | null {
  const next = historyState.future.pop();
  if (!next) return null;
  const current = captureSnapshot("undo-point");
  historyState.past.push(current);
  restoreSnapshot(next);
  return next;
}

export function getHistoryStats(): { past: number; future: number } {
  return { past: historyState.past.length, future: historyState.future.length };
}

// ── Export/Import ──

export function exportLayout(): string {
  const snap = captureSnapshot("export");
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      ...snap,
    },
    null,
    2,
  );
}

export function importLayout(json: string): { ok: boolean; error?: string } {
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== "object") throw new Error("invalid JSON");
    if (!data.objects || !data.floorTeams) throw new Error("missing fields");
    pushHistory("before-import");
    restoreSnapshot({ objects: data.objects, floorTeams: data.floorTeams, at: Date.now() });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "parse error" };
  }
}

// ── 기본값 리셋 ──

export function resetToDefaults(): void {
  pushHistory("before-reset");
  for (const key of LS_OBJECT_KEYS) {
    localStorage.removeItem(key);
  }
  localStorage.removeItem(LS_FLOOR_TEAMS);
}
