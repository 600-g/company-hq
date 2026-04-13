#!/usr/bin/env node
/**
 * 씬 레이아웃 정적 검증기 - CI/PR 에서 실행해 배포 전 충돌 차단.
 * 빌드 전에: node scripts/validate-scene.mjs
 */
import { readFileSync } from "fs";

// sceneLayout.ts 를 런타임 임포트하려면 tsx 필요. 간단 재정의.
const W = 960, H = 540;
const BACK_Y = 250, FRONT_Y = H - 40, ROAD_Y = 270, ROAD_H = 60;

const BUILDINGS = [
  { id: "red",    cx: 100, by: BACK_Y,  w: 128, h: 160, s: 1.2 },
  { id: "green",  cx: 270, by: BACK_Y,  w: 128, h: 160, s: 1.2 },
  { id: "hq",     cx: 480, by: BACK_Y,  w: 224, h: 192, s: 1.0 },
  { id: "blue",   cx: 695, by: BACK_Y,  w: 128, h: 160, s: 1.1 },
  { id: "purple", cx: 865, by: BACK_Y,  w: 144, h: 192, s: 1.1 },
  { id: "mart",   cx: 170, by: FRONT_Y, w: 160, h: 192, s: 1.0 },
  { id: "park",   cx: 480, by: FRONT_Y, w: 192, h: 192, s: 1.0 },
  { id: "cafe",   cx: 820, by: FRONT_Y, w: 128, h: 160, s: 1.0 },
];

const fp = b => ({ x0: b.cx - (b.w * b.s) / 2, y0: b.by - b.h * b.s, x1: b.cx + (b.w * b.s) / 2, y1: b.by });
const body = f => ({ x0: f.x0, y0: (f.y0 + f.y1) / 2, x1: f.x1, y1: f.y1 });
const overlap = (a, b) => !(a.x1 <= b.x0 || a.x0 >= b.x1 || a.y1 <= b.y0 || a.y0 >= b.y1);

const fps = BUILDINGS.map(b => ({ id: b.id, body: body(fp(b)), full: fp(b) }));

// 장식 좌표 (LoginScene.ts 에 정의된 것과 sync 필요)
const decors = [
  // Bushes
  { kind: "bush", x: 50, y: 475, w: 38, h: 38 },
  { kind: "bush", x: 320, y: 475, w: 38, h: 38 },
  { kind: "bush", x: 660, y: 475, w: 38, h: 38 },
  { kind: "bush", x: 920, y: 475, w: 38, h: 38 },
  // NPCs (static)
  { kind: "npc", x: 290, y: 514, w: 24, h: 36 },
  { kind: "npc", x: 450, y: 514, w: 24, h: 36 },
  { kind: "npc", x: 540, y: 514, w: 24, h: 36 },
  { kind: "npc", x: 680, y: 514, w: 24, h: 36 },
  // Berry trees
  { kind: "berry", x: 350, y: 470, w: 38, h: 77 },
  { kind: "berry", x: 610, y: 470, w: 38, h: 77 },
  // Flower beds (centers)
  { kind: "flower_bed", x: 40, y: 460, w: 32, h: 32 },
  { kind: "flower_bed", x: 920, y: 460, w: 32, h: 32 },
  // Corner trees
  { kind: "tree_corner", x: 12, y: 530, w: 42, h: 83 },
  { kind: "tree_corner", x: 948, y: 530, w: 42, h: 83 },
];

let errors = 0;
for (const d of decors) {
  const dFp = { x0: d.x - d.w / 2, y0: d.y - d.h / 2, x1: d.x + d.w / 2, y1: d.y + d.h / 2 };
  for (const b of fps) {
    if (b.id === "park") continue; // 공원은 decor 허용
    if (overlap(dFp, b.body)) {
      console.error(`❌ ${d.kind}(${d.x},${d.y}) 건물 '${b.id}' body 침범 [${b.body.x0.toFixed(0)},${b.body.y0.toFixed(0)} - ${b.body.x1.toFixed(0)},${b.body.y1.toFixed(0)}]`);
      errors++;
    }
  }
}

if (errors === 0) {
  console.log(`✅ ${decors.length}개 decor 모두 건물 footprint 밖`);
  process.exit(0);
} else {
  console.error(`\n충돌 ${errors}건. 좌표 수정 필요.`);
  process.exit(1);
}
