/**
 * HubOffice 보조 유틸 — 순수 함수 + 상수
 * 추출 시점: 2026-05-08 안정화 1단계-2
 *
 * 주의: Phaser 의존 없음. 상태 없음. 테스트 가능.
 */

import { type Agent } from "@/stores/agentStore";
import { type PlacedFurniture } from "@/stores/layoutStore";
import { getFurnitureDef, WALKABLE_CATEGORIES } from "@/game/tm-furniture-catalog";

// ── 상수 ────────────────────────────────────────────────────────
export const MANAGER_FALLBACK = { x: 640, y: 420 } as const;
export const WALK_SPEED = 180; // px/sec
export const CHAR_COUNT = 241; // char_0 ~ char_240 (중복 103 제거 + 재번호)
export const NPC_COUNT = 28;   // npc_01 ~ npc_28
export const FLOOR_TILE_COUNT = 9; // floor_0 ~ floor_8
export const WINDOW_ZONE_HEIGHT = 64; // 그리드 32*2 — 창가/하늘 영역
export const DEFAULT_FLOOR_TILE_KEY = "doogeun_floor_default";

// ── 가구 셀 분석 ────────────────────────────────────────────────
/** TM 정책 이식 — 배치된 가구 중 "통과 불가" 셀 집합 반환 (키 "col,row").
 *  · WALKABLE_CATEGORIES + isSeat + label "쇼파/sofa/bench" 는 통과 가능
 */
export function buildBlockedCells(placed: PlacedFurniture[]): Set<string> {
  const blocked = new Set<string>();
  for (const item of placed) {
    const def = getFurnitureDef(item.defId);
    if (!def) continue;
    const lbl = (def.label || "").toLowerCase();
    const walkSet = new Set((def.walkableCells || []).map(([x, y]) => `${x},${y}`));
    const bottomRow = def.heightCells - 1;

    const isDeskLike = def.category === "desk";
    // 책상 h≥2 만 반쪽 walkable (상단 row walk, 하단 row block)
    const halfWalkable = isDeskLike && def.heightCells >= 2;

    if (!halfWalkable) {
      if (WALKABLE_CATEGORIES.has(def.category)) continue;
      if (def.isSeat) continue;
      if (/쇼파|sofa|bench|소파|의자|chair|쇼쇼파|걸상|좌석/.test(lbl)) continue;
    }

    for (let dr = 0; dr < def.heightCells; dr++) {
      for (let dc = 0; dc < def.widthCells; dc++) {
        if (walkSet.has(`${dc},${dr}`)) continue;
        if (halfWalkable) {
          const isBottom = dr === bottomRow;
          if (!isBottom) continue;
        }
        blocked.add(`${item.col + dc},${item.row + dr}`);
      }
    }
  }
  return blocked;
}

/** 의자/쇼파 셀 집합 반환 — blocked여도 앉을 수 있는 예외 셀 */
export function buildSeatCells(placed: PlacedFurniture[]): Set<string> {
  const seats = new Set<string>();
  for (const item of placed) {
    const def = getFurnitureDef(item.defId);
    if (!def) continue;
    const lbl = (def.label || "").toLowerCase();
    if (!def.isSeat && !/쇼파|sofa|bench|소파|의자|chair|좌석/.test(lbl)) continue;
    for (let dr = 0; dr < def.heightCells; dr++) {
      for (let dc = 0; dc < def.widthCells; dc++) {
        seats.add(`${item.col + dc},${item.row + dr}`);
      }
    }
  }
  return seats;
}

/** 가장 가까운 free 셀 탐색 (BFS, 원 주변 최대 200셀).
 *  seatCells 전달 시 — blocked이어도 의자/쇼파 위는 통과 허용 */
export function nearestFree(
  col: number,
  row: number,
  blocked: Set<string>,
  maxRow: number,
  seatCells?: Set<string>
): { col: number; row: number } {
  const minRow = Math.ceil(WINDOW_ZONE_HEIGHT / 32);
  const canPlace = (c: number, r: number) => {
    const k = `${c},${r}`;
    return (!blocked.has(k) || seatCells?.has(k)) && r >= minRow && r < maxRow;
  };
  if (canPlace(col, row)) return { col, row };
  const visited = new Set<string>([`${col},${row}`]);
  const queue: Array<{ c: number; r: number }> = [{ c: col, r: row }];
  const dirs = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (canPlace(cur.c, cur.r)) {
      return { col: cur.c, row: cur.r };
    }
    if (visited.size > 200) break;
    for (const [dc, dr] of dirs) {
      const nc = cur.c + dc, nr = cur.r + dr;
      const k = `${nc},${nr}`;
      if (visited.has(k)) continue;
      visited.add(k);
      if (nc < 0 || nc >= 40 || nr < minRow || nr >= maxRow) continue;
      queue.push({ c: nc, r: nr });
    }
  }
  return { col, row };
}

// ── 매니저 / 캐릭터 / 바닥 ──────────────────────────────────────
/** CPO 여부 판정 */
export function isManagerAgent(a: Agent): boolean {
  const s = `${a.id} ${a.role} ${a.name}`.toLowerCase();
  return s.includes("cpo") || s.includes("관리자") || s.includes("매니저");
}

/** CPO 를 모든 층에서 감지 (floor 무시) — 관리자는 어디든 있어야 함 */
export function findManagerAgent(agents: Agent[]): Agent | null {
  return agents.find(isManagerAgent) ?? null;
}

/** 에이전트 ID 해시로 sprite 자동 할당 (재방문 시 동일)
 *  - CPO/관리자 → char_cpo (특수)
 *  - 그 외 일반 에이전트 → char_0~char_(CHAR_COUNT-1)
 */
export function pickSpriteKey(a: Agent): string {
  if (a.spriteKey) return a.spriteKey;
  const s = `${a.id} ${a.role} ${a.name}`.toLowerCase();
  if (s.includes("cpo") || s.includes("관리자") || s.includes("매니저")) return "char_cpo";
  let h = 0;
  for (let i = 0; i < a.id.length; i++) h = (h * 31 + a.id.charCodeAt(i)) | 0;
  return `char_${Math.abs(h) % CHAR_COUNT}`;
}

/** 기본 바닥 타일 — 구 두근컴퍼니 1번째 타일 */
export function pickFloorTile(_floor: number): string {
  void _floor;
  return DEFAULT_FLOOR_TILE_KEY;
}
