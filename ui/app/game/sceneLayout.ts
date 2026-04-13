/**
 * 씬 레이아웃 선언적 spec + 자동 검증기
 *
 * 목적: 좌표/스케일을 한 곳에 모아 "건물 위 나무" 같은 회귀 방지.
 * 규칙:
 *  - 건물은 BUILDING_SPECS 에 정의 → footprint 자동 계산
 *  - 장식(가로등/부쉬/바위/나무)은 DECOR_SPECS 에 정의
 *  - validateLayout() 가 건물 footprint 위에 decor 있으면 console.warn
 *  - LoginScene 은 이 spec 참조해 placement 수행
 */

export interface Footprint { x0: number; y0: number; x1: number; y1: number; }

export interface BuildingSpec {
  id: string;                        // 식별자 (로그용)
  key: string;                       // Phaser 텍스처 키
  centerX: number;                   // origin 중앙 x
  baselineY: number;                 // origin 하단 y (발밑)
  baseW: number;                     // 원본 asset 너비
  baseH: number;                     // 원본 asset 높이
  scale: number;
  isHQ?: boolean;
}

export interface DecorSpec {
  kind: "lamp" | "bush" | "rock" | "tree_top" | "tree_corner" | "flower_bed" | "npc" | "signpost" | "mailbox" | "berry" | "bench" | "potplant";
  x: number;                         // 배치 x (origin depends on kind)
  y: number;                         // 배치 y
  w: number;                         // 화면상 너비 (충돌 검사용)
  h: number;                         // 화면상 높이
}

// 장면 상수
export const W = 960;
export const H = 540;
export const BACK_ROW_BASELINE_Y = 250;
export const FRONT_ROW_BASELINE_Y = H - 40;
export const ROAD_Y = 270;
export const ROAD_HEIGHT = 60;

// ────────────────────────────────────────
// 건물 5채 (뒷줄) + 3채 (앞줄 - 마트/공원/카페)
// ────────────────────────────────────────
export const BUILDING_SPECS: BuildingSpec[] = [
  // 뒷줄
  { id: "red",    key: "palet_red",    centerX: 100, baselineY: BACK_ROW_BASELINE_Y, baseW: 128, baseH: 160, scale: 1.2 },
  { id: "green",  key: "palet_green",  centerX: 270, baselineY: BACK_ROW_BASELINE_Y, baseW: 128, baseH: 160, scale: 1.2 },
  { id: "hq",     key: "city_hq",      centerX: 480, baselineY: BACK_ROW_BASELINE_Y, baseW: 224, baseH: 192, scale: 1.0, isHQ: true },
  { id: "blue",   key: "palet_blue",   centerX: 695, baselineY: BACK_ROW_BASELINE_Y, baseW: 128, baseH: 160, scale: 1.1 },
  { id: "purple", key: "city_purple",  centerX: 865, baselineY: BACK_ROW_BASELINE_Y, baseW: 144, baseH: 192, scale: 1.1 },
  // 앞줄 (공원은 가상 footprint - 중앙 6x6 타일)
  { id: "mart",   key: "city_mart",    centerX: 170, baselineY: FRONT_ROW_BASELINE_Y, baseW: 160, baseH: 192, scale: 1.0 },
  { id: "park",   key: "",             centerX: 480, baselineY: FRONT_ROW_BASELINE_Y, baseW: 192, baseH: 192, scale: 1.0 },
  { id: "cafe",   key: "bld_main_1f",  centerX: 820, baselineY: FRONT_ROW_BASELINE_Y, baseW: 128, baseH: 160, scale: 1.0 },
];

export function footprintOf(b: BuildingSpec): Footprint {
  const w = b.baseW * b.scale;
  const h = b.baseH * b.scale;
  return {
    x0: b.centerX - w / 2,
    y0: b.baselineY - h,
    x1: b.centerX + w / 2,
    y1: b.baselineY,
  };
}

function rectOverlap(a: Footprint, b: Footprint): boolean {
  return !(a.x1 <= b.x0 || a.x0 >= b.x1 || a.y1 <= b.y0 || a.y0 >= b.y1);
}

function decorFootprint(d: DecorSpec): Footprint {
  // decor 중심 기준, w×h 박스
  return {
    x0: d.x - d.w / 2, y0: d.y - d.h / 2,
    x1: d.x + d.w / 2, y1: d.y + d.h / 2,
  };
}

/**
 * 빌드/런타임에 호출 — 모든 장식이 건물 footprint 밖인지 검사.
 * @returns 충돌 리포트 (빈 배열이면 clean)
 */
export function validateLayout(decors: DecorSpec[]): string[] {
  const buildings = BUILDING_SPECS.filter(b => b.key || b.id === "park").map(b => ({ id: b.id, fp: footprintOf(b) }));
  const errors: string[] = [];
  for (const d of decors) {
    const dFp = decorFootprint(d);
    for (const b of buildings) {
      // 건물 footprint 중 "몸통" (하단 50%) 만 엄격 검사. 지붕은 허용 (건물 뒤로 감)
      const bodyFp: Footprint = {
        x0: b.fp.x0, y0: (b.fp.y0 + b.fp.y1) / 2,
        x1: b.fp.x1, y1: b.fp.y1,
      };
      if (rectOverlap(dFp, bodyFp)) {
        errors.push(`⚠️ ${d.kind}(${d.x},${d.y}) overlaps building '${b.id}' body [${bodyFp.x0.toFixed(0)},${bodyFp.y0.toFixed(0)}-${bodyFp.x1.toFixed(0)},${bodyFp.y1.toFixed(0)}]`);
      }
    }
  }
  return errors;
}

/**
 * 안전한 decor x 구간 (건물 몸통 밖) 계산.
 * @param y decor baseline y
 * @param w decor 폭
 * @returns 배치 가능한 x 범위 리스트
 */
export function safeXGaps(y: number, w: number): [number, number][] {
  const intrudes = BUILDING_SPECS
    .filter(b => b.key || b.id === "park")
    .map(b => footprintOf(b))
    .filter(fp => y > (fp.y0 + fp.y1) / 2 && y < fp.y1 + 20) // body + 하단 20px 여유
    .map(fp => [fp.x0 - w / 2, fp.x1 + w / 2] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  const gaps: [number, number][] = [];
  let cursor = 0;
  for (const [bs, be] of intrudes) {
    if (bs > cursor) gaps.push([cursor, bs]);
    cursor = Math.max(cursor, be);
  }
  if (cursor < W) gaps.push([cursor, W]);
  return gaps.filter(([a, b]) => b - a >= w);
}
