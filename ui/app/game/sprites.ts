/**
 * Pixel Agents + Pixel Forge 기반 스프라이트 시스템
 * 캐릭터 0~5: Pixel Agents MIT (112x96, 16x16 프레임, 7열x6행) — 2등신 원본 복구
 * 캐릭터 6: 정장 캐릭터 (224x384, 32x64 프레임, 7열x6행) — CPO 전용
 * 가구: 개별 PNG (desk, PC, chair 등)
 * 바닥: 16x16 타일
 */

import * as Phaser from "phaser";

// ═══════════════════════════════════
// 프리로드
// ═══════════════════════════════════

export function preloadAssets(scene: Phaser.Scene) {
  // 캐릭터 0~5: Pixel Agents 2등신 원본 (16×16 프레임, 7열×6행)
  for (const i of [0, 1, 2, 3, 4, 5]) {
    scene.load.spritesheet(`char_${i}`, `/assets/char_${i}.png`, {
      frameWidth: 16,
      frameHeight: 16,
    });
  }
  // 캐릭터 6: CPO 전용 정장 (32×64 프레임, 7열×6행)
  scene.load.spritesheet("char_6", "/assets/char_6.png", {
    frameWidth: 32,
    frameHeight: 64,
  });

  // 가구
  scene.load.image("desk_front", "/assets/furniture/DESK/DESK_FRONT.png");
  scene.load.image("desk_side", "/assets/furniture/DESK/DESK_SIDE.png");
  scene.load.image("pc_on1", "/assets/furniture/PC/PC_FRONT_ON_1.png");
  scene.load.image("pc_on2", "/assets/furniture/PC/PC_FRONT_ON_2.png");
  scene.load.image("pc_on3", "/assets/furniture/PC/PC_FRONT_ON_3.png");
  scene.load.image("pc_off", "/assets/furniture/PC/PC_FRONT_OFF.png");
  scene.load.image("pc_back", "/assets/furniture/PC/PC_BACK.png");
  scene.load.image("chair_front", "/assets/furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_FRONT.png");
  scene.load.image("chair_back", "/assets/furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_BACK.png");
  scene.load.image("plant", "/assets/furniture/PLANT/PLANT.png");
  scene.load.image("large_plant", "/assets/furniture/LARGE_PLANT/LARGE_PLANT.png");
  scene.load.image("bookshelf", "/assets/furniture/BOOKSHELF/BOOKSHELF.png");
  scene.load.image("whiteboard", "/assets/furniture/WHITEBOARD/WHITEBOARD.png");
  scene.load.image("cactus", "/assets/furniture/CACTUS/CACTUS.png");
  scene.load.image("bin", "/assets/furniture/BIN/BIN.png");
  scene.load.image("pot", "/assets/furniture/POT/POT.png");
  scene.load.image("coffee_table", "/assets/furniture/COFFEE_TABLE/COFFEE_TABLE.png");

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
  scene.load.image("o_server_rack", "/assets/original/office/server_rack.png");
  scene.load.image("o_server_small", "/assets/original/office/server_small.png");
  scene.load.image("o_window_day", "/assets/original/office/window_day.png");
  scene.load.image("o_window_night", "/assets/original/office/window_night.png");
  scene.load.image("o_whiteboard", "/assets/original/office/whiteboard.png");
  scene.load.image("o_water_cooler", "/assets/original/office/water_cooler.png");
  scene.load.image("o_coffee", "/assets/original/office/coffee_machine.png");
  scene.load.image("o_clock", "/assets/original/office/wall_clock.png");
  scene.load.image("o_ac", "/assets/original/office/ac_unit.png");
  scene.load.image("o_fire_ext", "/assets/original/office/fire_extinguisher.png");

  // 바닥/벽
  scene.load.image("floor_tile", "/assets/floors/floor_0.png");
  scene.load.image("wall_tile", "/assets/walls/wall_0.png");

  // 나무 (계절별 x 크기별: 15종)
  for (const s of ["spring", "summer", "autumn", "winter", "evergreen"]) {
    for (const sz of ["sm", "md", "lg"]) {
      scene.load.image(`tree_${s}_${sz}`, `/assets/trees/tree_${s}_${sz}.png`);
    }
  }
}

// ═══════════════════════════════════
// 애니메이션 등록
// 캐릭터 시트 레이아웃 (7열 x 6행):
// char_0~5: Pixel Agents 16x16 | char_6: CPO 32x64
// 행0: 아래 idle + walk (front)
// 행1: 왼쪽
// 행2: 오른쪽
// 행3: 위(back)
// 행4: 앉기/타이핑
// 행5: 기타
// ═══════════════════════════════════

export function registerCharAnims(scene: Phaser.Scene) {
  for (let i of [0, 1, 2, 3, 4, 5, 6]) {
    const key = `char_${i}`;
    const cols = 7;

    // idle (아래 보기)
    scene.anims.create({
      key: `${key}_idle`,
      frames: [{ key, frame: 0 }],
      frameRate: 1,
      repeat: -1,
    });

    // walk down
    scene.anims.create({
      key: `${key}_walk_down`,
      frames: [
        { key, frame: 0 },
        { key, frame: 1 },
        { key, frame: 0 },
        { key, frame: 2 },
      ],
      frameRate: 6,
      repeat: -1,
    });

    // walk left
    scene.anims.create({
      key: `${key}_walk_left`,
      frames: [
        { key, frame: cols },
        { key, frame: cols + 1 },
        { key, frame: cols },
        { key, frame: cols + 2 },
      ],
      frameRate: 6,
      repeat: -1,
    });

    // walk right
    scene.anims.create({
      key: `${key}_walk_right`,
      frames: [
        { key, frame: cols * 2 },
        { key, frame: cols * 2 + 1 },
        { key, frame: cols * 2 },
        { key, frame: cols * 2 + 2 },
      ],
      frameRate: 6,
      repeat: -1,
    });

    // walk up
    scene.anims.create({
      key: `${key}_walk_up`,
      frames: [
        { key, frame: cols * 3 },
        { key, frame: cols * 3 + 1 },
        { key, frame: cols * 3 },
        { key, frame: cols * 3 + 2 },
      ],
      frameRate: 6,
      repeat: -1,
    });

    // typing — 오른쪽 향함 (왼쪽 책상, col0~2=RIGHT 프레임)
    scene.anims.create({
      key: `${key}_type`,
      frames: [
        { key, frame: cols * 4 },
        { key, frame: cols * 4 + 1 },
        { key, frame: cols * 4 + 2 },
      ],
      frameRate: 4,
      repeat: -1,
    });

    // typing — 왼쪽 향함 (오른쪽 책상, col3~5=LEFT 프레임)
    scene.anims.create({
      key: `${key}_type_left`,
      frames: [
        { key, frame: cols * 4 + 3 },
        { key, frame: cols * 4 + 4 },
        { key, frame: cols * 4 + 5 },
      ],
      frameRate: 4,
      repeat: -1,
    });
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

