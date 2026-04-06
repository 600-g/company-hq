/**
 * 로그인 야외 씬 — 정면뷰 거리 씬 (포켓몬 마을 입장 스타일)
 * walk_left / walk_right 프레임 = 캐릭터 옆모습 → 정면뷰에 자연스럽게 맞음
 */
import * as Phaser from "phaser";

const W = 960;
const H = 540;
const GROUND_Y = Math.floor(H * 0.72);  // 지면 Y
const ROAD_Y   = GROUND_Y + 28;         // 도로 시작 Y
const DPR = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 3) : 2;
const TEXT_RES = 8;
const FONT = "'Pretendard Variable', Pretendard, -apple-system, sans-serif";

const sR = (a: number, b: number) =>
  (((a * 1664525 + b * 1013904223) | 0) >>> 1) / 0x7fffffff;

type Walker = {
  sprite: Phaser.GameObjects.Sprite;
  x: number;
  speed: number;
  dir: 1 | -1;
  phase: number;
  y: number;
  charIdx: number;
};

export default class LoginScene extends Phaser.Scene {
  private weatherCode = 0;
  private season: "spring" | "summer" | "autumn" | "winter" = "spring";
  private tod: "day" | "sunset" | "night" = "day";

  private walkers: Walker[] = [];
  private rainDrops:  { x: number; y: number; speed: number; len: number }[] = [];
  private snowFlakes: { x: number; y: number; speed: number; size: number; dx: number }[] = [];
  private petals:     { x: number; y: number; s: number; dx: number }[] = [];
  private leaves:     { x: number; y: number; s: number; dx: number; r: number; rs: number }[] = [];
  private particleG!: Phaser.GameObjects.Graphics;

  private showReturnBtn = false;

  constructor() { super({ key: "LoginScene" }); }

  init(data: { weatherCode?: number; showReturnBtn?: boolean }) {
    this.weatherCode = data.weatherCode ?? 0;
    this.showReturnBtn = data.showReturnBtn ?? false;
    const now = new Date();
    const mon = now.getMonth() + 1;
    const hr  = now.getHours();
    this.season = mon >= 3 && mon <= 5 ? "spring"
                : mon >= 6 && mon <= 8 ? "summer"
                : mon >= 9 && mon <= 11 ? "autumn" : "winter";
    this.tod = hr >= 6 && hr < 17 ? "day" : hr >= 17 && hr < 20 ? "sunset" : "night";
  }

  preload() {
    // 캐릭터 스프라이트시트 (사무실과 동일한 파일 — 2× 업스케일 32×64)
    for (let i = 0; i < 4; i++) {
      this.load.spritesheet(`char_${i}`, `/assets/char_${i}.png`, {
        frameWidth: 32, frameHeight: 64,
      });
    }
    // 계절별 나무 이미지
    const leafKey = this.season === "winter" ? "evergreen" : this.season;
    (["sm", "md", "lg"] as const).forEach(sz =>
      this.load.image(`tree_${sz}`, `/assets/trees/tree_${leafKey}_${sz}.png`)
    );
    if (this.season === "winter") {
      (["sm", "md", "lg"] as const).forEach(sz =>
        this.load.image(`tree_bare_${sz}`, `/assets/trees/tree_winter_${sz}.png`)
      );
    }
  }

  create() {
    const isN = this.tod === "night";
    const isS = this.tod === "sunset";
    const wc  = this.weatherCode;
    const isRain = (wc >= 51 && wc <= 82) || wc >= 95;
    const isSnow = wc >= 71 && wc <= 77;

    this.drawSky(isN, isS, isRain);
    this.drawBackBuildings(isN);
    this.drawStreet(isN);
    this.drawMainBuilding(isN);
    this.drawSideBuildings(isN);
    this.drawTrees(isN);
    this.drawStreetLights(isN, isS);
    this.createWalkAnims();
    this.createWalkers(isN);
    this.createClouds(isN, isS, isRain);

    this.particleG = this.add.graphics().setDepth(50);
    if (isRain)
      for (let i = 0; i < 55; i++)
        this.rainDrops.push({ x: Math.random() * W, y: Math.random() * H, speed: 3 + Math.random() * 3, len: 8 + Math.random() * 10 });
    if (isSnow || this.season === "winter")
      for (let i = 0; i < 35; i++)
        this.snowFlakes.push({ x: Math.random() * W, y: Math.random() * H, speed: 0.3 + Math.random() * 0.5, size: 1.5 + Math.random() * 2, dx: (Math.random() - 0.5) * 0.4 });
    if (this.season === "spring" && !isRain)
      for (let i = 0; i < 12; i++)
        this.petals.push({ x: Math.random() * W, y: -Math.random() * H, s: 0.3 + Math.random() * 0.3, dx: 0.3 + Math.random() * 0.4 });
    if (this.season === "autumn" && !isRain)
      for (let i = 0; i < 10; i++)
        this.leaves.push({ x: Math.random() * W, y: -Math.random() * H, s: 0.4 + Math.random() * 0.4, dx: 0.2 + Math.random() * 0.3, r: Math.random() * 6, rs: (Math.random() - 0.5) * 0.04 });

    this.cameras.main.setBounds(0, 0, W, H);
    this.time.addEvent({ delay: 40, loop: true, callback: () => this.moveWalkers() });

    // 사무실 복귀 — 건물 문 클릭 (EXIT에서 진입 시만)
    if (this.showReturnBtn) {
      this.cameras.main.fadeIn(300, 0, 0, 0);
      // 건물 문 영역에 인터랙티브 히트박스
      const doorX = W / 2, doorY = GROUND_Y - 13;
      const doorHit = this.add.rectangle(doorX, doorY, 44, 30, 0x000000, 0).setDepth(200).setInteractive({ useHandCursor: true });
      const doorLabel = this.add.text(doorX, doorY - 22, "▶ 입장", {
        fontSize: "9px", fontFamily: FONT, color: "#f5c842", resolution: TEXT_RES,
        backgroundColor: "#0008", padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setDepth(201).setAlpha(0);

      doorHit.on("pointerover", () => doorLabel.setAlpha(1));
      doorHit.on("pointerout",  () => doorLabel.setAlpha(0));
      doorHit.on("pointerdown", () => {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () => {
          this.scene.stop("LoginScene");
          this.scene.resume("OfficeScene");
          const officeScene = this.scene.get("OfficeScene");
          if (officeScene) officeScene.cameras.main.fadeIn(300, 0, 0, 0);
        });
      });
    }
  }

  // ═══════════════════════════════
  private drawSky(isN: boolean, isS: boolean, isRain: boolean) {
    const g = this.add.graphics().setDepth(0);
    let t: number, b: number;
    if      (isN)    { t = 0x0a0e1a; b = 0x141e35; }
    else if (isS)    { t = 0x1a1040; b = 0xe06040; }
    else if (isRain) { t = 0x404855; b = 0x606870; }
    else             { t = 0x3498db; b = 0x87ceeb; }
    g.fillGradientStyle(t, t, b, b, 1);
    g.fillRect(0, 0, W, GROUND_Y);

    // 별 (야간)
    if (isN) {
      for (let i = 0; i < 80; i++) {
        const sx = sR(i, 100) * W, sy = sR(i, 200) * GROUND_Y * 0.6;
        const bright = 0.15 + sR(i, 300) * 0.6;
        const sz = sR(i, 400) > 0.9 ? 2 : 1;
        g.fillStyle(0xddeeff, bright);
        g.fillRect(sx | 0, sy | 0, sz, sz);
      }
      // 달
      const mx = W * 0.82, my = GROUND_Y * 0.15;
      g.fillStyle(0xf8f0d0, 0.04); g.fillCircle(mx, my, 28);
      g.fillStyle(0xf8f0d0, 0.08); g.fillCircle(mx, my, 16);
      g.fillStyle(0xfff8e0, 0.9); g.fillCircle(mx, my, 9);
    }
    // 태양
    if (!isN && !isRain) {
      const sx = isS ? W * 0.15 : W * 0.78, sy = isS ? GROUND_Y * 0.35 : GROUND_Y * 0.15;
      g.fillStyle(isS ? 0xff6633 : 0xffee88, 0.06); g.fillCircle(sx, sy, 30);
      g.fillStyle(isS ? 0xff8844 : 0xffdd66, 0.12); g.fillCircle(sx, sy, 18);
      g.fillStyle(0xffffff, 0.85); g.fillCircle(sx, sy, 8);
    }
    // 석양 그라데이션 밴드
    if (isS) {
      g.fillStyle(0xff6030, 0.08);
      g.fillRect(0, GROUND_Y * 0.55, W, GROUND_Y * 0.15);
      g.fillStyle(0xff9050, 0.05);
      g.fillRect(0, GROUND_Y * 0.7, W, GROUND_Y * 0.1);
    }
  }

  // ═══════════════════════════════
  private drawBackBuildings(isN: boolean) {
    const g = this.add.graphics().setDepth(1);
    // 원경 스카이라인 — 연한 실루엣
    const bc = isN ? 0x0e1520 : 0x7f8c8d;
    const ba = isN ? 0.7 : 0.2;
    const buildings = [
      { x: 20,  w: 22, h: 55 }, { x: 50,  w: 30, h: 80 }, { x: 88,  w: 18, h: 45 },
      { x: 110, w: 35, h: 95 }, { x: 155, w: 25, h: 60 }, { x: 185, w: 40, h: 110 },
      { x: 230, w: 20, h: 50 }, { x: 260, w: 32, h: 75 }, { x: 300, w: 28, h: 85 },
      { x: 340, w: 22, h: 55 }, { x: 370, w: 38, h: 100 },
      { x: 550, w: 35, h: 90 }, { x: 590, w: 22, h: 65 }, { x: 620, w: 42, h: 105 },
      { x: 670, w: 28, h: 50 }, { x: 705, w: 30, h: 80 }, { x: 745, w: 20, h: 60 },
      { x: 775, w: 38, h: 95 }, { x: 820, w: 25, h: 70 }, { x: 855, w: 35, h: 85 },
      { x: 900, w: 28, h: 55 }, { x: 930, w: 22, h: 75 },
    ];
    buildings.forEach(b => {
      g.fillStyle(bc, ba);
      g.fillRect(b.x, GROUND_Y - b.h, b.w, b.h);
      // 야간 창문 불빛
      if (isN) {
        for (let wy = GROUND_Y - b.h + 6; wy < GROUND_Y - 6; wy += 8) {
          for (let wx = b.x + 3; wx < b.x + b.w - 3; wx += 6) {
            if (sR(wx, wy) > 0.5) {
              g.fillStyle(0xf0d860, 0.12 + sR(wx + 1, wy) * 0.18);
              g.fillRect(wx, wy, 3, 3);
            }
          }
        }
      }
    });
    // 남산타워
    const tx = W * 0.52, tBase = GROUND_Y - 95;
    g.fillStyle(bc, ba + 0.15);
    g.fillRect(tx - 2, tBase - 55, 4, 55);
    g.fillRect(tx - 10, tBase, 20, 12);
    g.fillRect(tx - 1, tBase - 72, 2, 17);
    // 타워 빨간 점멸등
    if (isN) {
      g.fillStyle(0xff3333, 0.6);
      g.fillCircle(tx, tBase - 72, 2);
    }
  }

  // ═══════════════════════════════
  private drawStreet(isN: boolean) {
    const g = this.add.graphics().setDepth(2);
    // 인도 — 깔끔한 보도블록
    const sidewalkCol = isN ? 0x2a2a35 : 0xbdc3c7;
    g.fillStyle(sidewalkCol, 1);
    g.fillRect(0, GROUND_Y, W, ROAD_Y - GROUND_Y);
    // 보도블록 패턴
    for (let x = 0; x < W; x += 24) {
      g.fillStyle(isN ? 0x252530 : 0xb0b6ba, 1);
      g.fillRect(x, GROUND_Y, 1, ROAD_Y - GROUND_Y);
    }
    // 경계석
    g.fillStyle(isN ? 0x3a3a45 : 0x95a5a6, 1);
    g.fillRect(0, ROAD_Y - 3, W, 4);

    // 도로 — 아스팔트
    g.fillStyle(isN ? 0x1a1a22 : 0x2c3e50, 1);
    g.fillRect(0, ROAD_Y, W, H - ROAD_Y);
    // 아스팔트 텍스처
    for (let i = 0; i < 60; i++) {
      g.fillStyle(isN ? 0x202028 : 0x354a5e, 0.3);
      g.fillRect(sR(i, 50) * W, ROAD_Y + sR(i, 60) * (H - ROAD_Y), 2 + sR(i, 70) * 4, 1);
    }
    // 중앙선 (점선)
    for (let x = 0; x < W; x += 32) {
      g.fillStyle(0xf1c40f, isN ? 0.3 : 0.6);
      g.fillRect(x, ROAD_Y + (H - ROAD_Y) / 2 - 1, 16, 2);
    }
    // 겨울 눈
    if (this.season === "winter") {
      g.fillStyle(0xe8eef4, 0.25);
      g.fillRect(0, GROUND_Y, W, 12);
    }
  }

  // ═══════════════════════════════
  private drawMainBuilding(isN: boolean) {
    const g  = this.add.graphics().setDepth(5);
    const bx = W / 2 - 90, bw = 180, bh = 180;
    const by = GROUND_Y - bh;

    // 건물 본체 — 모던 파사드
    g.fillStyle(isN ? 0x1a2030 : 0x2c3e50, 1);
    g.fillRect(bx, by, bw, bh);
    // 유리 외벽
    g.fillStyle(isN ? 0x151c28 : 0x34495e, 1);
    g.fillRect(bx + 2, by + 2, bw - 4, bh - 2);

    // 층별 유리창 (4층)
    for (let f = 0; f < 4; f++) {
      const fy = by + 18 + f * 38;
      // 층 구분 선 (슬래브)
      g.fillStyle(isN ? 0x222c3a : 0x455a6e, 1);
      g.fillRect(bx + 2, fy - 2, bw - 4, 3);

      for (let c = 0; c < 4; c++) {
        const fx = bx + 8 + c * 42;
        // 유리 — 하늘 반사 느낌
        const lit = isN ? sR(f * 4 + c, 777) > 0.35 : true;
        if (isN && lit) {
          g.fillGradientStyle(0xf0c840, 0xf0a020, 0xf0c840, 0xf0a020, 0.35);
        } else if (isN) {
          g.fillStyle(0x0a1018, 0.8);
        } else {
          g.fillGradientStyle(0x6db3d0, 0x5a9ab8, 0x88cce8, 0x78bcd8, 0.55);
        }
        g.fillRect(fx, fy, 36, 28);
        // 창틀
        g.fillStyle(isN ? 0x1a2535 : 0x2c3e50, 1);
        g.fillRect(fx + 17, fy, 2, 28);
        g.fillRect(fx, fy + 13, 36, 2);
        // 유리 반사 하이라이트
        if (!isN) {
          g.fillStyle(0xffffff, 0.08);
          g.fillRect(fx + 1, fy + 1, 16, 12);
        }
      }
    }

    // 입구 — 자동문 느낌
    const dx = bx + bw / 2 - 22, dw = 44, dh = 32;
    g.fillStyle(0x0a0e18, 1);
    g.fillRect(dx, GROUND_Y - dh, dw, dh);
    // 유리문
    g.fillStyle(isN ? 0x1a2838 : 0x5588aa, 0.6);
    g.fillRect(dx + 2, GROUND_Y - dh + 2, dw / 2 - 3, dh - 4);
    g.fillRect(dx + dw / 2 + 1, GROUND_Y - dh + 2, dw / 2 - 3, dh - 4);
    // 문 반사
    if (!isN) {
      g.fillStyle(0xffffff, 0.1);
      g.fillRect(dx + 3, GROUND_Y - dh + 3, 8, dh - 6);
    }
    // 입구 조명
    g.fillStyle(0xf0d860, isN ? 0.25 : 0.06);
    g.fillRect(dx - 8, GROUND_Y - dh - 4, dw + 16, 4);

    // 간판 — 깔끔한 LED 스타일
    const signW = 120, signH = 18;
    g.fillStyle(0x0a0e18, 0.95);
    g.fillRoundedRect(bx + bw / 2 - signW / 2, by + 3, signW, signH, 3);
    g.lineStyle(1, isN ? 0xf0d860 : 0x2c3e50, 0.4);
    g.strokeRoundedRect(bx + bw / 2 - signW / 2, by + 3, signW, signH, 3);
    this.add.text(W / 2, by + 12, "(주)두근 컴퍼니", {
      fontSize: "10px", fontFamily: FONT,
      color: isN ? "#f0d860" : "#ecf0f1", resolution: TEXT_RES,
    }).setOrigin(0.5).setDepth(6);

    // 옥상 구조물
    g.fillStyle(isN ? 0x151c28 : 0x2c3e50, 1);
    g.fillRect(bx + 30, by - 12, 40, 12);
    g.fillRect(bx + bw - 55, by - 8, 25, 8);
  }

  // ═══════════════════════════════
  private drawSideBuildings(isN: boolean) {
    const g = this.add.graphics().setDepth(4);
    // 현대식 도시 건물
    const palette = isN
      ? [0x141c28, 0x18222e, 0x121a25, 0x162030]
      : [0x2c3e50, 0x34495e, 0x3a536b, 0x2e4053];
    const leftB  = [
      { x: 0,   w: 75, h: 135 },
      { x: 80,  w: 58, h: 105 },
      { x: 142, w: 68, h: 155 },
      { x: 215, w: 82, h:  95 },
    ];
    const rightB = [
      { x: W - 75,  w: 75, h: 125 },
      { x: W - 135, w: 58, h: 145 },
      { x: W - 205, w: 68, h: 100 },
      { x: W - 285, w: 78, h: 115 },
    ];
    [...leftB, ...rightB].forEach((b, i) => {
      const by = GROUND_Y - b.h;
      const col = palette[i % palette.length];
      // 건물 본체
      g.fillStyle(col, 1);
      g.fillRect(b.x, by, b.w, b.h);
      // 옥상 라인
      g.fillStyle(isN ? 0x1a2535 : 0x455a6e, 1);
      g.fillRect(b.x, by, b.w, 3);
      // 창문 — 세련된 그리드
      for (let wy = by + 8; wy < GROUND_Y - 10; wy += 12) {
        for (let wx = b.x + 5; wx < b.x + b.w - 5; wx += 10) {
          const lit = isN ? sR(wx, wy) > 0.4 : false;
          if (isN) {
            g.fillStyle(lit ? 0xf0c840 : 0x0a1018, lit ? 0.3 : 0.6);
          } else {
            g.fillStyle(0x5dade2, 0.35);
          }
          g.fillRect(wx, wy, 7, 8);
          // 창틀
          g.fillStyle(col, 1);
          g.fillRect(wx + 3, wy, 1, 8);
        }
      }
      // 1층 상가 느낌
      if (b.h > 100) {
        g.fillStyle(isN ? 0xf0c840 : 0xecf0f1, isN ? 0.15 : 0.2);
        g.fillRect(b.x + 3, GROUND_Y - 22, b.w - 6, 18);
      }
    });
  }

  // ═══════════════════════════════
  private drawTrees(isN: boolean) {
    const positions = [50, 190, 310, 650, 770, 910];
    const isWinter  = this.season === "winter";
    const sizes: ("sm" | "md" | "lg")[] = ["md", "lg", "sm", "sm", "lg", "md"];
    const scales = [2.8, 3.2, 2.2, 2.2, 3.2, 2.8];

    positions.forEach((tx, i) => {
      const sz  = sizes[i];
      const key = isWinter && i % 2 === 1 ? `tree_bare_${sz}` : `tree_${sz}`;
      const tree = this.add.image(tx, GROUND_Y, key)
        .setOrigin(0.5, 1.0)   // 피봇: 바닥 중앙 → 바람 흔들림이 자연스러움
        .setScale(scales[i])
        .setDepth(7);

      if (isN) tree.setTint(0x1a2a3a);

      this.tweens.add({
        targets: tree,
        angle: { from: -2.5, to: 2.5 },
        duration: 2000 + i * 380,
        yoyo: true, repeat: -1, ease: "Sine.easeInOut",
        delay: i * 220,
      });
    });
  }

  // ═══════════════════════════════
  private drawStreetLights(isN: boolean, isS: boolean) {
    [130, 340, 530, 730, 880].forEach(x => {
      const g = this.add.graphics().setDepth(8);
      g.fillStyle(isN ? 0x3a4555 : 0x7f8c8d, 1);
      g.fillRect(x - 1, GROUND_Y - 50, 3, 50);
      g.fillStyle(isN ? 0x4a5060 : 0x6a7080, 1);
      g.fillRect(x - 5, GROUND_Y - 52, 11, 3);

      if (isN || isS) {
        const glow = this.add.graphics().setDepth(7.5);
        glow.fillStyle(0xf0d860, 0.06); glow.fillCircle(x, GROUND_Y - 50, 28);
        glow.fillStyle(0xf0d860, 0.15); glow.fillCircle(x, GROUND_Y - 50, 6);
        this.tweens.add({
          targets: glow, alpha: 0.7,
          duration: 2000 + Math.random() * 1500,
          yoyo: true, repeat: -1, ease: "Sine.easeInOut",
        });
      }
    });
  }

  // ═══════════════════════════════
  private createWalkAnims() {
    const cols = 7;
    for (let i = 0; i < 4; i++) {
      const k = `char_${i}`;
      if (this.anims.exists(`${k}_walk_left`)) continue;
      // walk_left: row1 (옆모습 왼쪽) — 정면뷰 거리씬에 딱 맞음
      this.anims.create({
        key: `${k}_walk_left`,
        frames: [
          { key: k, frame: cols },
          { key: k, frame: cols + 1 },
          { key: k, frame: cols },
          { key: k, frame: cols + 2 },
        ],
        frameRate: 6, repeat: -1,
      });
      // walk_right: row2 (옆모습 오른쪽)
      this.anims.create({
        key: `${k}_walk_right`,
        frames: [
          { key: k, frame: cols * 2 },
          { key: k, frame: cols * 2 + 1 },
          { key: k, frame: cols * 2 },
          { key: k, frame: cols * 2 + 2 },
        ],
        frameRate: 6, repeat: -1,
      });
    }
  }

  // ═══════════════════════════════
  private createWalkers(isN: boolean) {
    for (let i = 0; i < 12; i++) {
      const dir      = (sR(i, 50) > 0.5 ? 1 : -1) as 1 | -1;
      const charIdx  = i % 4;
      const animKey  = dir > 0 ? `char_${charIdx}_walk_right` : `char_${charIdx}_walk_left`;

      const startX = dir > 0
        ? -(20 + sR(i, 60) * W * 0.5)
        : W + 20 + sR(i, 61) * W * 0.5;

      // 원근감: 앞줄(큰) / 뒷줄(작은) 3단계 (2× 스프라이트 보정: 0.5배)
      const row    = i % 3;                   // 0=뒤, 1=중, 2=앞
      const scale  = (0.85 + row * 0.15) * 0.5; // 0.425 / 0.5 / 0.575
      const walkY  = GROUND_Y + 4 + row * 10; // 깊이별 Y

      const sprite = this.add.sprite(startX, walkY, `char_${charIdx}`, 0)
        .setOrigin(0.5, 1.0)   // 발바닥 기준
        .setScale(scale)
        .setDepth(10 + row)    // 앞줄이 뒷줄 위에
        .play(animKey);

      if (isN) sprite.setTint(0x3355aa);

      this.walkers.push({
        sprite, x: startX, charIdx,
        speed: 0.25 + sR(i, 63) * 0.4,
        dir,
        phase: sR(i, 64) * Math.PI * 2,
        y: walkY,
      });
    }
  }

  // ═══════════════════════════════
  private moveWalkers() {
    const t = this.time.now * 0.001;
    this.walkers.forEach(w => {
      w.x += w.speed * w.dir;
      if (w.dir > 0 && w.x >  W + 40) w.x = -40 - Math.random() * 200;
      if (w.dir < 0 && w.x < -40)     w.x =  W + 40 + Math.random() * 200;
      // 미세한 상하 흔들림 (숨소리 느낌)
      const bob = Math.sin(t * 5 + w.phase) * 0.8;
      w.sprite.setPosition(w.x, w.y + bob);
    });
  }

  // ═══════════════════════════════
  private createClouds(isN: boolean, isS: boolean, isRain: boolean) {
    if (isN) return;
    const count = isRain ? 6 : 3;
    for (let i = 0; i < count; i++) {
      const cg  = this.add.graphics().setDepth(0.5);
      const cw  = 45 + i * 18, ch = 12 + i * 4;
      const col = isRain ? 0x5a6070 : (isS ? 0xd09878 : 0xfafafa);
      const a   = isRain ? 0.6 : 0.35;
      cg.fillStyle(col, a * 0.7); cg.fillRoundedRect(0, ch * 0.35, cw, ch * 0.5, ch * 0.25);
      cg.fillStyle(col, a);       cg.fillRoundedRect(cw * 0.1, 0, cw * 0.6, ch, ch * 0.45);
      cg.setPosition(-cw + i * (W / count), 15 + i * 12);

      const move = () => {
        if (!cg.active) return;
        this.tweens.add({
          targets: cg, x: W + cw,
          duration: 45000 + i * 12000, ease: "Linear",
          onComplete: () => { if (cg.active) { cg.setPosition(-cw, 12 + Math.random() * 40); move(); } },
        });
      };
      move();
    }
  }

  // ═══════════════════════════════
  update() {
    if (!this.particleG?.active) return;
    const pg = this.particleG;
    pg.clear();

    this.rainDrops.forEach(d => {
      pg.lineStyle(1, 0x8ab8d8, 0.25);
      pg.lineBetween(d.x, d.y, d.x - 0.6, Math.min(d.y + d.len, H));
      d.y += d.speed; d.x -= 0.4;
      if (d.y > H) { d.y = -d.len - 5; d.x = Math.random() * W; }
      if (d.x < 0) d.x += W;
    });

    this.snowFlakes.forEach(f => {
      pg.fillStyle(0xeef4ff, 0.55);
      pg.fillCircle(f.x, f.y, f.size);
      f.y += f.speed; f.x += f.dx + Math.sin(f.y * 0.02) * 0.3;
      if (f.y > H) { f.y = -5; f.x = Math.random() * W; }
      if (f.x < 0) f.x += W; if (f.x > W) f.x -= W;
    });

    this.petals.forEach(p => {
      pg.fillStyle(0xffb0c8, 0.45); pg.fillCircle(p.x, p.y, 2);
      p.y += p.s; p.x += p.dx + Math.sin(p.y * 0.015) * 0.5;
      if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
    });

    this.leaves.forEach(l => {
      pg.fillStyle([0xcc6620, 0xdd8830, 0xbb4410][Math.floor(Math.abs(l.r) * 2) % 3], 0.55);
      pg.fillRect(l.x - 2, l.y - 1, 5, 3);
      l.y += l.s; l.x += l.dx + Math.sin(l.y * 0.012) * 0.6; l.r += l.rs;
      if (l.y > H + 10) { l.y = -10; l.x = Math.random() * W; }
    });
  }
}
