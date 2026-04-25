/**
 * Pokemon Another Red 포맷 스프라이트 시스템
 * 캐릭터: RPG Maker Essentials (128x192, 32x48 프레임, 4열x4행)
 * 가구: 개별 PNG (desk, PC, chair 등)
 * 바닥: 16x16 타일
 */

import * as Phaser from "phaser";
import TM_TILES_LIST from "./tm-tiles.json";

// NPC 풀 크기 (public/assets/npcs/ 내 npc_01.png ~ npc_NN.png)
export const NPC_POOL_SIZE = 28;

// 고유 primary 캐릭터 풀 크기
// char_0 ~ char_(PRIMARY_CHAR_POOL_SIZE-1)
// 0~19: 기본 RPG 캐릭터
// 20~29: phone001~phone010 (폰 캐릭터)
// 30~207: 이름 있는 트레이너 (RED, BLUE, GREEN, ASH, LEADER_*, ELITEFOUR_* 등)
// char_0~char_344 (비표준 해상도 12개 정리 + SWIMMER 4 + TUBER 4 + 사용자 지정 6 제거 후 재번호)
// 전부 128x192 (32x48 프레임 4x4 grid) 검증 완료
export const PRIMARY_CHAR_POOL_SIZE = 241;

// ═══════════════════════════════════
// 프리로드
// ═══════════════════════════════════

export function preloadAssets(scene: Phaser.Scene) {
  // TeamMaker 전체 사무실 타일 — 레이아웃 렌더링용 (~280개)
  for (const name of TM_TILES_LIST as string[]) {
    scene.load.image(`tm_${name}`, `/assets/teammaker/tiles/office/${name}.png`);
  }
  // TM 가구 스프라이트시트 — 개별 가구는 이 시트에서 크롭
  scene.load.image("tm_furniture_sheet", "/assets/teammaker/tiles/office/furniture-sheet.png");

  // CPO 캐릭터 (32×48 프레임, 4열×4행)
  scene.load.spritesheet("char_cpo", "/assets/chars/char_cpo.png", {
    frameWidth: 32,
    frameHeight: 48,
  });

  // 캐릭터 0~(PRIMARY_CHAR_POOL_SIZE-1) (32×48 프레임, 4열×4행)
  for (let i = 0; i < PRIMARY_CHAR_POOL_SIZE; i++) {
    scene.load.spritesheet(`char_${i}`, `/assets/chars/char_${i}.png`, {
      frameWidth: 32,
      frameHeight: 48,
    });
  }

  // NPC 풀 (npc_01~npc_NN, 동일한 32×48 / 4x4 포맷)
  // 각 팀의 랜덤 NPC 3명 슬롯에 사용됨
  for (let i = 1; i <= NPC_POOL_SIZE; i++) {
    const key = `npc_${String(i).padStart(2, "0")}`;
    scene.load.spritesheet(`char_${key}`, `/assets/npcs/${key}.png`, {
      frameWidth: 32,
      frameHeight: 48,
    });
  }

  // (포켓몬 마스코트 제거됨 — 크기 불일치 렌더 이슈)

  // 말풍선 스킨 (96x48 windowskin atlas: 좌테두리/중앙/우테두리 3프레임, 각 32x48)
  scene.load.spritesheet("speech_bubble", "/assets/pokemon_furniture/speech_bubble.png", {
    frameWidth: 32,
    frameHeight: 48,
  });

  // 가구 (Pokemon Another Red 포맷, 32px 그리드)
  // desk_1.png, desk_2.png 파일 없음 → 기존 파일로 대체 (빗금친 missing-texture 방지)
  scene.load.image("desk_front", "/assets/pokemon_furniture/desk_side_with_drawers.png");
  scene.load.image("desk_side", "/assets/pokemon_furniture/desk_side_wicker_long.png");
  // PC — 단일 이미지 (깜빡임 애니메이션 없음). 하위 호환 위해 모든 키를 동일 이미지로 매핑
  scene.load.image("pc_on1", "/assets/pokemon_furniture/pc.png");
  scene.load.image("pc_on2", "/assets/pokemon_furniture/pc.png");
  scene.load.image("pc_on3", "/assets/pokemon_furniture/pc.png");
  scene.load.image("pc_off", "/assets/pokemon_furniture/pc.png");
  scene.load.image("pc_back", "/assets/pokemon_furniture/pc.png");
  scene.load.image("pc", "/assets/pokemon_furniture/pc.png");
  scene.load.image("monitor", "/assets/pokemon_furniture/monitor.png");
  // server_workstation: drawServerRoom()이 코드 드로잉으로 대체 — 더 이상 로드 불필요
  // scene.load.image("server_workstation", "/assets/pokemon_furniture/computer_crt_pair.png");
  scene.load.image("desk_side_drawers", "/assets/pokemon_furniture/desk_side_with_drawers.png");
  scene.load.image("desk_side_wicker", "/assets/pokemon_furniture/desk_side_wicker_short.png");
  scene.load.image("desk_side_wicker_long", "/assets/pokemon_furniture/desk_side_wicker_long.png");
  scene.load.image("laptop_side_right", "/assets/pokemon_furniture/laptop_side_right.png");
  scene.load.image("laptop_side_left", "/assets/pokemon_furniture/laptop_side_left.png");
  // 측면뷰 단일 노트북 (키보드+화면 모두 보이는 정상 형태, content-bbox trim: 28x24)
  scene.load.image("laptop_side_single", "/assets/pokemon_furniture/laptop_side_single_trim.png");
  // laptop_v 분할: 좌반=V화면, 우반=키보드. 나란히 놓으면 완전체 노트북
  scene.load.image("laptop_v_screen", "/assets/pokemon_furniture/laptop_v_left.png");
  scene.load.image("laptop_v_keys",   "/assets/pokemon_furniture/laptop_v_right.png");
  // 제대로 된 노트북 페어 (같은 크기 32x64)
  scene.load.image("laptop_left", "/assets/pokemon_furniture/laptop_left.png");
  scene.load.image("laptop_right", "/assets/pokemon_furniture/laptop_right.png");
  // V자 오픈 노트북 (탑뷰, 32x32)
  scene.load.image("laptop_v", "/assets/pokemon_furniture/laptop_v.png?v=52x28");
  // 52x28 완전체를 정중앙에서 반갈 → 각 반쪽 26x28 (독립 노트북으로 인식됨)
  scene.load.image("laptop_half_left",  "/assets/pokemon_furniture/laptop_v_half_left.png?v=26x28");
  scene.load.image("laptop_half_right", "/assets/pokemon_furniture/laptop_v_half_right.png?v=26x28");
  // laptop_pair_back_to_back 원본(56x44) 을 좌/우로 분리 + content bbox trim
  //   좌: 28x38 (화면+키보드, 왼쪽 캐릭용)
  //   우: 28x24 (키보드+화면, 오른쪽 캐릭용)
  scene.load.image("laptop_pair_left", "/assets/pokemon_furniture/laptop_pair_left.png");
  scene.load.image("laptop_pair_right", "/assets/pokemon_furniture/laptop_pair_right.png");
  scene.load.image("chair_front", "/assets/pokemon_furniture/chair_front.png");
  scene.load.image("chair_back", "/assets/pokemon_furniture/chair_back.png");
  scene.load.image("plant", "/assets/pokemon_furniture/plant_1.png");
  scene.load.image("plant_1", "/assets/pokemon_furniture/plant_1.png");
  scene.load.image("plant_2", "/assets/pokemon_furniture/plant_2.png");
  scene.load.image("large_plant", "/assets/pokemon_furniture/plant_large.png");
  scene.load.image("plant_large", "/assets/pokemon_furniture/plant_large.png");
  scene.load.image("bookshelf", "/assets/pokemon_furniture/bookshelf.png");
  scene.load.image("cabinet", "/assets/pokemon_furniture/cabinet.png");
  scene.load.image("whiteboard", "/assets/pokemon_furniture/whiteboard.png");
  // 카드/쓰레기통 대체 매핑 (Pokemon 세트엔 없음)
  scene.load.image("cactus", "/assets/pokemon_furniture/plant_2.png");
  scene.load.image("bin", "/assets/pokemon_furniture/plant_2.png");
  scene.load.image("pot", "/assets/pokemon_furniture/plant_2.png");
  scene.load.image("coffee_table", "/assets/pokemon_furniture/coffee_table.png");
  scene.load.image("table", "/assets/pokemon_furniture/table.png");
  scene.load.image("sofa_pk", "/assets/pokemon_furniture/sofa.png");
  scene.load.image("water_cooler_pk", "/assets/pokemon_furniture/water_cooler.png");
  scene.load.image("vending", "/assets/pokemon_furniture/vending.png");
  scene.load.image("printer", "/assets/pokemon_furniture/printer.png");
  scene.load.image("clock", "/assets/pokemon_furniture/clock.png");
  scene.load.image("door", "/assets/pokemon_furniture/door.png");
  scene.load.image("elevator_closed", "/assets/pokemon_furniture/elevator_closed.png");
  scene.load.image("door_office", "/assets/pokemon_furniture/door_office.png");
  scene.load.image("mailbox", "/assets/pokemon_furniture/mailbox.png");
  scene.load.image("bench", "/assets/pokemon_furniture/bench.png");
  scene.load.image("streetlight", "/assets/pokemon_furniture/streetlight.png");

  // 아케이드 / 탱크 슈팅 미니게임 에셋
  scene.load.image("arcade_cabinet", "/assets/pokemon_assets/composites/Game Corner interior/obj_r014_c04_2x1.png");
  // 아케이드 주변 장식용 게임기들
  scene.load.image("arcade_deco_a", "/assets/pokemon_assets/composites/Game Corner interior/obj_r012_c02_2x2.png");
  scene.load.image("arcade_deco_b", "/assets/pokemon_assets/composites/Game Corner interior/obj_r013_c00_3x2.png");
  scene.load.image("arcade_deco_c", "/assets/pokemon_assets/composites/Game Corner interior/obj_r017_c05_2x3.png");
  scene.load.image("arcade_deco_d", "/assets/pokemon_assets/composites/Game Corner interior/obj_r018_c04_1x1.png");
  scene.load.image("tank_body", "/assets/pokemon_assets/Items/IRONBALL.png");
  scene.load.image("tank_turret", "/assets/pokemon_assets/Items/BEASTBALL.png");
  scene.load.image("bullet", "/assets/pokemon_assets/Items/BIGNUGGET.png");
  // 블록 — 파괴 대상 (다양화: Factory + Cave + Ruins)
  scene.load.image("block_base", "/assets/pokemon_assets/composites/Factory interior/obj_r025_c00_2x1.png");
  scene.load.image("block_a", "/assets/pokemon_assets/composites/Factory interior/obj_r010_c01_1x1.png");
  scene.load.image("block_b", "/assets/pokemon_assets/composites/Factory interior/obj_r010_c06_1x1.png");
  scene.load.image("block_c", "/assets/pokemon_assets/composites/Cave/obj_r018_c06_1x1.png");
  scene.load.image("block_d", "/assets/pokemon_assets/composites/Cave/obj_r018_c07_1x1.png");
  scene.load.image("block_e", "/assets/pokemon_assets/composites/Cave/obj_r021_c04_1x1.png");
  scene.load.image("block_big", "/assets/pokemon_assets/composites/Cave/obj_r020_c00_2x2.png");
  // 바닥 타일 (Cave sliced)
  scene.load.image("tank_floor_a", "/assets/pokemon_assets/sliced/Cave/r000_c00.png");
  scene.load.image("tank_floor_b", "/assets/pokemon_assets/sliced/Cave/r000_c01.png");
  scene.load.image("tank_floor_c", "/assets/pokemon_assets/sliced/Cave/r001_c00.png");
  // 배경 요새 (Cave 큰 구조물)
  scene.load.image("tank_bg_cave", "/assets/pokemon_assets/composites/Cave/obj_r024_c04_4x4.png");

  // 오리지널 사무실 에셋 (Pixel Forge)
  scene.load.image("o_laptop", "/assets/original/office/laptop_open.png");
  scene.load.image("o_laptop_closed", "/assets/original/office/laptop_closed.png");
  scene.load.image("o_monitor", "/assets/original/office/monitor_front.png");
  scene.load.image("o_monitor_back", "/assets/original/office/monitor_back.png");
  scene.load.image("o_desk", "/assets/original/office/desk_front.png");
  scene.load.image("o_desk_side", "/assets/original/office/desk_side.png");
  scene.load.image("o_chair_front", "/assets/original/office/chair_front.png");
  scene.load.image("o_chair_back", "/assets/original/office/chair_back.png");
  scene.load.image("o_bookshelf", "/assets/original/office/bookshelf.png");
  // o_server_rack, o_server_small: drawServerRoom()이 코드 드로잉으로 대체 — 미사용
  // scene.load.image("o_server_rack", "/assets/original/office/server_rack.png");
  // scene.load.image("o_server_small", "/assets/original/office/server_small.png");
  scene.load.image("o_window_day", "/assets/original/office/window_day.png");
  scene.load.image("o_window_night", "/assets/original/office/window_night.png");
  scene.load.image("o_whiteboard", "/assets/original/office/whiteboard.png");
  scene.load.image("o_water_cooler", "/assets/original/office/water_cooler.png");
  scene.load.image("o_coffee", "/assets/original/office/coffee_machine.png");
  scene.load.image("o_clock", "/assets/original/office/wall_clock.png");
  scene.load.image("o_ac", "/assets/original/office/ac_unit.png");
  scene.load.image("o_fire_ext", "/assets/original/office/fire_extinguisher.png");

  // 바닥/벽 (Pokemon)
  scene.load.image("floor_tile", "/assets/pokemon_furniture/floor_wood.png");
  scene.load.image("floor_wood", "/assets/pokemon_furniture/floor_wood.png");
  scene.load.image("floor_carpet", "/assets/pokemon_furniture/floor_carpet.png");
  scene.load.image("wall_tile", "/assets/pokemon_furniture/wall_1.png");
  scene.load.image("wall_1", "/assets/pokemon_furniture/wall_1.png");
  scene.load.image("wall_2", "/assets/pokemon_furniture/wall_2.png");

  // 나무 — 계절별 단일 이미지. 하위 호환 위해 sm/md/lg 키도 동일 파일로 매핑
  const seasonMap: Record<string, string> = {
    spring: "/assets/pokemon_furniture/tree_spring.png",
    summer: "/assets/pokemon_furniture/tree_summer.png",
    autumn: "/assets/pokemon_furniture/tree_autumn.png",
    winter: "/assets/pokemon_furniture/tree_winter.png",
    evergreen: "/assets/pokemon_furniture/tree_summer.png",
  };
  for (const [s, path] of Object.entries(seasonMap)) {
    scene.load.image(`tree_${s}`, path);
    for (const sz of ["sm", "md", "lg"]) {
      scene.load.image(`tree_${s}_${sz}`, path);
    }
  }
}

// ═══════════════════════════════════
// 애니메이션 등록
// 캐릭터 시트 레이아웃 (4열 x 4행, RPG Maker Essentials):
// 행0: Down (정면) — idle, walk_left_foot, idle, walk_right_foot
// 행1: Left — 동일 패턴
// 행2: Right — 동일 패턴
// 행3: Up (뒷면) — 동일 패턴
// ═══════════════════════════════════

function registerAnimsForKey(scene: Phaser.Scene, key: string) {
  const cols = 4;

  // idle (아래 보기, 정면)
  scene.anims.create({
    key: `${key}_idle`,
    frames: [{ key, frame: 0 }],
    frameRate: 1,
    repeat: -1,
  });

  // walk down (행0: idle, left_foot, idle, right_foot)
  scene.anims.create({
    key: `${key}_walk_down`,
    frames: [
      { key, frame: 0 },
      { key, frame: 1 },
      { key, frame: 0 },
      { key, frame: 3 },
    ],
    frameRate: 6,
    repeat: -1,
  });

  // walk left (행1)
  scene.anims.create({
    key: `${key}_walk_left`,
    frames: [
      { key, frame: cols },
      { key, frame: cols + 1 },
      { key, frame: cols },
      { key, frame: cols + 3 },
    ],
    frameRate: 6,
    repeat: -1,
  });

  // walk right (행2)
  scene.anims.create({
    key: `${key}_walk_right`,
    frames: [
      { key, frame: cols * 2 },
      { key, frame: cols * 2 + 1 },
      { key, frame: cols * 2 },
      { key, frame: cols * 2 + 3 },
    ],
    frameRate: 6,
    repeat: -1,
  });

  // walk up (행3)
  scene.anims.create({
    key: `${key}_walk_up`,
    frames: [
      { key, frame: cols * 3 },
      { key, frame: cols * 3 + 1 },
      { key, frame: cols * 3 },
      { key, frame: cols * 3 + 3 },
    ],
    frameRate: 6,
    repeat: -1,
  });

  // typing — 정면 프레임으로 대체 (새 포맷에 앉기 애니메이션 없음)
  scene.anims.create({
    key: `${key}_type`,
    frames: [
      { key, frame: 0 },
      { key, frame: 1 },
      { key, frame: 0 },
    ],
    frameRate: 4,
    repeat: -1,
  });

  // typing left — 왼쪽 프레임으로 대체
  scene.anims.create({
    key: `${key}_type_left`,
    frames: [
      { key, frame: cols },
      { key, frame: cols + 1 },
      { key, frame: cols },
    ],
    frameRate: 4,
    repeat: -1,
  });
}

export function registerCharAnims(scene: Phaser.Scene) {
  // CPO 캐릭터
  registerAnimsForKey(scene, "char_cpo");

  // 캐릭터 0~(PRIMARY_CHAR_POOL_SIZE-1)
  for (let i = 0; i < PRIMARY_CHAR_POOL_SIZE; i++) {
    registerAnimsForKey(scene, `char_${i}`);
  }

  // NPC 풀 애니메이션 (char_npc_01 ~ char_npc_NN)
  for (let i = 1; i <= NPC_POOL_SIZE; i++) {
    const key = `npc_${String(i).padStart(2, "0")}`;
    registerAnimsForKey(scene, `char_${key}`);
  }

  // PC 깜빡임 애니메이션
  scene.anims.create({
    key: "pc_blink",
    frames: [
      { key: "pc_on1" },
      { key: "pc_on2" },
      { key: "pc_on3" },
      { key: "pc_on2" },
    ],
    frameRate: 3,
    repeat: -1,
  });
}

// ═══════════════════════════════════
// 고퀄 가구 텍스처 (코드 생성)
// ═══════════════════════════════════

function px(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, alpha = 1) {
  g.fillStyle(color, alpha);
  g.fillRect(x, y, w, h);
}

export function createCustomFurniture(scene: Phaser.Scene) {
  let g: Phaser.GameObjects.Graphics;

  // ── 벽장/캐비닛 (40x60) — 큰 벽면 수납장 ──
  g = scene.add.graphics();
  // 본체
  px(g, 0, 0, 40, 60, 0x5a4a3a);
  px(g, 1, 1, 38, 58, 0x6a5a48);
  // 상단 칸
  px(g, 3, 3, 34, 18, 0x554838);
  px(g, 4, 4, 32, 16, 0x604a38);
  // 책/물건
  px(g, 6, 6, 6, 12, 0x4488cc); // 파란 파일
  px(g, 13, 6, 5, 12, 0xcc4444); // 빨간 바인더
  px(g, 19, 8, 7, 10, 0x44aa66); // 초록 책
  px(g, 27, 6, 6, 12, 0xddaa44); // 노란 폴더
  // 하단 칸
  px(g, 3, 24, 34, 18, 0x554838);
  px(g, 4, 25, 32, 16, 0x604a38);
  px(g, 6, 27, 8, 12, 0x888888); // 회색 박스
  px(g, 16, 27, 6, 12, 0x6666aa); // 보라 책
  px(g, 24, 29, 8, 10, 0xaa8844); // 갈색 파일
  // 서랍
  px(g, 3, 45, 34, 12, 0x554838);
  px(g, 4, 46, 32, 10, 0x5a4a3a);
  // 서랍 손잡이
  px(g, 17, 50, 6, 2, 0x888878);
  // 테두리 하이라이트
  px(g, 0, 0, 40, 1, 0x7a6a58);
  px(g, 0, 0, 1, 60, 0x7a6a58);
  g.generateTexture("wall_cabinet", 40, 60);
  g.destroy();

  // ── 워터쿨러/정수기 (12x28) ──
  g = scene.add.graphics();
  px(g, 2, 0, 8, 8, 0x6699cc); // 물통
  px(g, 3, 1, 6, 6, 0x88bbee);
  px(g, 1, 8, 10, 16, 0xcccccc); // 본체
  px(g, 2, 9, 8, 14, 0xdddddd);
  px(g, 3, 12, 3, 2, 0x4444ff); // 차가운물 버튼
  px(g, 7, 12, 3, 2, 0xff4444); // 뜨거운물 버튼
  px(g, 0, 24, 12, 4, 0xaaaaaa); // 받침
  g.generateTexture("water_cooler", 12, 28);
  g.destroy();

  // ── 소파 (48x20) ──
  g = scene.add.graphics();
  px(g, 0, 4, 48, 16, 0x3a3a5a); // 본체
  px(g, 1, 5, 46, 14, 0x4a4a6e);
  // 등받이
  px(g, 0, 0, 48, 6, 0x333355);
  px(g, 1, 1, 46, 4, 0x3a3a5a);
  // 쿠션 구분
  px(g, 16, 6, 1, 12, 0x3a3a5a);
  px(g, 32, 6, 1, 12, 0x3a3a5a);
  // 팔걸이
  px(g, 0, 4, 3, 16, 0x333355);
  px(g, 45, 4, 3, 16, 0x333355);
  g.generateTexture("sofa", 48, 20);
  g.destroy();

  // ── 러그/카펫 (80x50) ──
  g = scene.add.graphics();
  px(g, 0, 0, 80, 50, 0x6a5a8a, 0.15);
  px(g, 2, 2, 76, 46, 0x7a6a9a, 0.1);
  // 테두리 패턴
  g.lineStyle(1, 0x8a7aaa, 0.15);
  g.strokeRect(4, 4, 72, 42);
  g.generateTexture("rug", 80, 50);
  g.destroy();

  // ── 천장 조명 반사 (원형 그라데이션) ──
  g = scene.add.graphics();
  g.fillStyle(0xffffff, 0.03);
  g.fillCircle(24, 24, 24);
  g.fillStyle(0xffffff, 0.02);
  g.fillCircle(24, 24, 16);
  g.generateTexture("light_glow", 48, 48);
  g.destroy();
}

