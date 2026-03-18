/**
 * 로그인 야외 씬 — 포켓몬 5세대급 픽셀아트
 * - 서울 거리 + 두근컴퍼니 건물
 * - 걸어다니는 사람들
 * - 흔들리는 나무
 * - 계절/날씨/시간대 반영
 */

import * as Phaser from "phaser";

const W = 832;
const H = 576;
const GROUND_Y = H * 0.72;  // 지면 높이
const DPR = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 3) : 2;
const FONT = "'Pretendard Variable', Pretendard, -apple-system, sans-serif";

// 시드 기반 의사난수
const sR = (a: number, b: number) =>
  (((a * 1664525 + b * 1013904223) | 0) >>> 1) / 0x7fffffff;

export default class LoginScene extends Phaser.Scene {
  private weatherCode = 0;
  private season: "spring" | "summer" | "autumn" | "winter" = "spring";
  private timeOfDay: "day" | "sunset" | "night" = "day";
  private walkers: { sprite: Phaser.GameObjects.Graphics; x: number; speed: number; dir: number; colors: number[] }[] = [];
  private trees: { g: Phaser.GameObjects.Graphics; baseX: number; baseY: number; phase: number }[] = [];
  private rainDrops: { x: number; y: number; speed: number; len: number }[] = [];
  private snowFlakes: { x: number; y: number; speed: number; size: number; dx: number }[] = [];
  private particleG: Phaser.GameObjects.Graphics | null = null;

  constructor() { super({ key: "LoginScene" }); }

  init(data: { weatherCode?: number }) {
    this.weatherCode = data.weatherCode ?? 0;
    const now = new Date();
    const mon = now.getMonth() + 1;
    const hr = now.getHours();
    this.season = mon >= 3 && mon <= 5 ? "spring" : mon >= 6 && mon <= 8 ? "summer" : mon >= 9 && mon <= 11 ? "autumn" : "winter";
    this.timeOfDay = hr >= 6 && hr < 17 ? "day" : hr >= 17 && hr < 20 ? "sunset" : "night";
  }

  create() {
    // ═══════════════════════════════
    // 하늘
    // ═══════════════════════════════
    const skyG = this.add.graphics();
    let skyT: number, skyB: number;
    if (this.timeOfDay === "night") { skyT = 0x050918; skyB = 0x0e1a30; }
    else if (this.timeOfDay === "sunset") { skyT = 0x2a2058; skyB = 0xd06848; }
    else {
      if (this.weatherCode >= 51) { skyT = 0x4a5060; skyB = 0x6a7078; }
      else { skyT = 0x3088c8; skyB = 0x88ccf8; }
    }
    skyG.fillGradientStyle(skyT, skyT, skyB, skyB, 1);
    skyG.fillRect(0, 0, W, GROUND_Y);

    // 구름
    if (this.timeOfDay !== "night" && this.weatherCode < 51) {
      this.createClouds();
    }

    // 별 (밤)
    if (this.timeOfDay === "night") {
      const starG = this.add.graphics();
      for (let i = 0; i < 60; i++) {
        const sx = sR(i, 100) * W;
        const sy = sR(i, 200) * GROUND_Y * 0.6;
        const sa = 0.3 + sR(i, 300) * 0.5;
        starG.fillStyle(0xeeeeff, sa);
        starG.fillRect(sx | 0, sy | 0, sR(i, 400) > 0.8 ? 2 : 1, sR(i, 500) > 0.8 ? 2 : 1);
      }
      // 달
      const mx = W * 0.8, my = GROUND_Y * 0.2;
      starG.fillStyle(0xf0e8cc, 0.08); starG.fillCircle(mx, my, 20);
      starG.fillStyle(0xf5eedd, 0.15); starG.fillCircle(mx, my, 14);
      starG.fillStyle(0xfffae0, 0.9); starG.fillCircle(mx, my, 9);
    }

    // 태양
    if (this.timeOfDay === "day" && this.weatherCode < 3) {
      const sunG = this.add.graphics();
      const sx = W * 0.75, sy = GROUND_Y * 0.2;
      sunG.fillStyle(0xffdd88, 0.1); sunG.fillCircle(sx, sy, 24);
      sunG.fillStyle(0xffee99, 0.2); sunG.fillCircle(sx, sy, 16);
      sunG.fillStyle(0xffffff, 0.9); sunG.fillCircle(sx, sy, 8);
    }

    // ═══════════════════════════════
    // 뒤쪽 빌딩 (서울 스카이라인)
    // ═══════════════════════════════
    this.drawBackBuildings();

    // ═══════════════════════════════
    // 거리 + 인도 + 도로
    // ═══════════════════════════════
    this.drawStreet();

    // ═══════════════════════════════
    // 앞쪽 건물들 + 메인 건물
    // ═══════════════════════════════
    this.drawFrontBuildings();

    // ═══════════════════════════════
    // 나무 (흔들리는 애니메이션)
    // ═══════════════════════════════
    this.createTrees();

    // ═══════════════════════════════
    // 걸어다니는 사람들
    // ═══════════════════════════════
    this.createWalkers();

    // ═══════════════════════════════
    // 가로등
    // ═══════════════════════════════
    this.drawStreetLights();

    // ═══════════════════════════════
    // 날씨 파티클
    // ═══════════════════════════════
    this.particleG = this.add.graphics().setDepth(50);
    const wc = this.weatherCode;
    if (wc >= 51 && wc <= 82) { // 비
      for (let i = 0; i < 50; i++) {
        this.rainDrops.push({ x: Math.random() * W, y: Math.random() * H, speed: 2 + Math.random() * 2, len: 5 + Math.random() * 6 });
      }
    }
    if (wc >= 71 && wc <= 77 || this.season === "winter") { // 눈
      for (let i = 0; i < 35; i++) {
        this.snowFlakes.push({ x: Math.random() * W, y: Math.random() * H, speed: 0.3 + Math.random() * 0.5, size: 1 + Math.random() * 2, dx: (Math.random() - 0.5) * 0.3 });
      }
    }

    // 카메라
    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.setBackgroundColor(skyT);

    // 걷기 타이머
    this.time.addEvent({ delay: 50, loop: true, callback: () => this.updateWalkers() });
  }

  // ═══════════════════════════════
  // 뒤쪽 빌딩 (실루엣)
  // ═══════════════════════════════
  private drawBackBuildings() {
    const g = this.add.graphics().setDepth(1);
    const isNight = this.timeOfDay === "night";
    const bc = isNight ? 0x0a1020 : 0x6880a0;
    const ba = isNight ? 0.9 : 0.3;

    const blds: [number, number, number][] = [
      [0, 22, 80], [25, 16, 120], [50, 28, 60], [80, 14, 100], [120, 24, 70],
      [160, 18, 90], [200, 30, 55], [240, 12, 110], [280, 26, 65], [320, 20, 85],
      [360, 15, 100], [390, 28, 75], [430, 10, 130], [460, 22, 60], [500, 18, 95],
      [540, 26, 70], [580, 14, 110], [620, 24, 80], [660, 20, 90], [700, 16, 100],
      [740, 28, 65], [770, 12, 120], [800, 22, 75],
    ];
    blds.forEach(([bx, bw, bh]) => {
      const by = GROUND_Y - 40 - bh;
      g.fillStyle(bc, ba);
      g.fillRect(bx, by, bw, bh + 40);
      // 야간 창문
      if (isNight) {
        for (let wy = by + 6; wy < GROUND_Y - 10; wy += 10) {
          for (let wx = bx + 3; wx < bx + bw - 3; wx += 7) {
            if (sR(wx, wy) > 0.5) {
              g.fillStyle(0xf0df60, 0.25 + sR(wx + 1, wy) * 0.3);
              g.fillRect(wx, wy, 3, 4);
            }
          }
        }
      }
    });
  }

  // ═══════════════════════════════
  // 거리
  // ═══════════════════════════════
  private drawStreet() {
    const g = this.add.graphics().setDepth(2);

    // 인도 (밝은 회색)
    g.fillStyle(0xc8c8d0, 1);
    g.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    // 인도 타일 패턴
    for (let x = 0; x < W; x += 24) {
      g.fillStyle(x % 48 < 24 ? 0xd0d0d8 : 0xbcbcc4, 1);
      g.fillRect(x, GROUND_Y, 24, 20);
    }

    // 도로
    const roadY = GROUND_Y + 45;
    g.fillStyle(0x3a3a44, 1);
    g.fillRect(0, roadY, W, H - roadY);
    // 중앙선
    for (let x = 0; x < W; x += 30) {
      g.fillStyle(0xf0e060, 0.6);
      g.fillRect(x, roadY + (H - roadY) / 2 - 1, 16, 2);
    }
    // 인도 경계
    g.fillStyle(0x9898a0, 1);
    g.fillRect(0, roadY - 2, W, 4);

    // 눈 (겨울)
    if (this.season === "winter") {
      g.fillStyle(0xe8eef4, 0.4);
      g.fillRect(0, GROUND_Y, W, 20);
    }
  }

  // ═══════════════════════════════
  // 앞쪽 건물 + 메인 건물
  // ═══════════════════════════════
  private drawFrontBuildings() {
    const g = this.add.graphics().setDepth(5);
    const isNight = this.timeOfDay === "night";

    // 좌측 건물들
    const leftBlds: [number, number, number, number][] = [
      [10, 30, 80, 0x2a3040], [45, 35, 60, 0x3a4050], [85, 28, 90, 0x2a3545],
    ];
    leftBlds.forEach(([bx, bw, bh, col]) => {
      const by = GROUND_Y - bh;
      g.fillStyle(col, 1); g.fillRect(bx, by, bw, bh);
      g.fillStyle(isNight ? 0x1a2030 : 0x3a4858, 1); g.fillRect(bx + 2, by + 2, bw - 4, bh - 2);
      // 창문
      for (let wy = by + 8; wy < GROUND_Y - 8; wy += 12) {
        for (let wx = bx + 5; wx < bx + bw - 6; wx += 10) {
          const lit = isNight ? sR(wx, wy) > 0.4 : sR(wx, wy) > 0.7;
          g.fillStyle(lit ? (isNight ? 0xf0d860 : 0x88bbdd) : 0x2a3848, lit ? (isNight ? 0.5 : 0.6) : 0.8);
          g.fillRect(wx, wy, 6, 8);
        }
      }
    });

    // ── 메인 건물 (두근컴퍼니) ──
    const mbx = W / 2 - 65, mbw = 130, mbh = 140;
    const mby = GROUND_Y - mbh;
    // 외벽
    g.fillStyle(0x2a3545, 1); g.fillRect(mbx, mby, mbw, mbh);
    g.fillStyle(0x344560, 1); g.fillRect(mbx + 3, mby + 3, mbw - 6, mbh - 3);
    // 유리창 (큰 통창)
    for (let floor = 0; floor < 3; floor++) {
      const fy = mby + 20 + floor * 38;
      g.fillStyle(isNight ? 0xf0d860 : 0x88bbdd, isNight ? 0.4 : 0.5);
      g.fillRect(mbx + 8, fy, mbw - 16, 28);
      // 창 프레임
      g.fillStyle(0x4a5a70, 1);
      g.fillRect(mbx + 8, fy + 14, mbw - 16, 2);
      g.fillRect(mbx + 8 + (mbw - 16) / 3, fy, 2, 28);
      g.fillRect(mbx + 8 + (mbw - 16) * 2 / 3, fy, 2, 28);
    }
    // 입구
    const doorX = mbx + mbw / 2 - 15, doorW = 30, doorH = 22;
    g.fillStyle(0x1a2030, 1); g.fillRect(doorX, GROUND_Y - doorH, doorW, doorH);
    g.fillStyle(0x3a4a60, 1); g.fillRect(doorX + doorW / 2 - 1, GROUND_Y - doorH, 2, doorH);
    // 입구 빛
    g.fillStyle(0xf0d860, 0.15); g.fillRect(doorX - 5, GROUND_Y - doorH - 3, doorW + 10, 3);
    // 간판
    g.fillStyle(0x1a2030, 1); g.fillRoundedRect(mbx + 15, mby + 4, mbw - 30, 14, 2);

    // 간판 텍스트
    this.add.text(W / 2, mby + 11, "(주)두근 컴퍼니", {
      fontSize: "10px", fontFamily: FONT, color: "#f0d860", resolution: DPR * 2,
    }).setOrigin(0.5).setDepth(6);

    // 우측 건물들
    const rightBlds: [number, number, number, number][] = [
      [W - 115, 30, 70, 0x2a3545], [W - 80, 35, 95, 0x3a4050], [W - 40, 32, 55, 0x2a3040],
    ];
    rightBlds.forEach(([bx, bw, bh, col]) => {
      const by = GROUND_Y - bh;
      g.fillStyle(col, 1); g.fillRect(bx, by, bw, bh);
      g.fillStyle(isNight ? 0x1a2030 : 0x3a4858, 1); g.fillRect(bx + 2, by + 2, bw - 4, bh - 2);
      for (let wy = by + 8; wy < GROUND_Y - 8; wy += 12) {
        for (let wx = bx + 5; wx < bx + bw - 6; wx += 10) {
          const lit = isNight ? sR(wx, wy) > 0.4 : sR(wx, wy) > 0.7;
          g.fillStyle(lit ? (isNight ? 0xf0d860 : 0x88bbdd) : 0x2a3848, lit ? (isNight ? 0.5 : 0.6) : 0.8);
          g.fillRect(wx, wy, 6, 8);
        }
      }
    });
  }

  // ═══════════════════════════════
  // 나무 (흔들림 애니메이션)
  // ═══════════════════════════════
  private createTrees() {
    const positions = [140, 210, 320, 520, 600, 700];
    const leafCols = this.season === "spring" ? [0xd898b0, 0xe8b0c8, 0xf0c0d0]
      : this.season === "summer" ? [0x2a7828, 0x389830, 0x48a838]
      : this.season === "autumn" ? [0xc86820, 0xd88830, 0xe8a040]
      : []; // 겨울은 잎 없음

    positions.forEach((tx, i) => {
      const g = this.add.graphics().setDepth(8);
      const sz = 0.7 + sR(tx, 3) * 0.6;
      const tH = 30 + (sz * 20 | 0);
      const baseY = GROUND_Y - 2;

      // 줄기
      const trunkW = 3 + (sz > 0.9 ? 1 : 0);
      g.fillStyle(0x4a3018, 0.95);
      g.fillRect(-trunkW / 2 | 0, -tH, trunkW, tH);
      g.fillStyle(0x5a4020, 0.4);
      g.fillRect(-trunkW / 2 | 0, -tH, 1, tH);

      if (this.season !== "winter") {
        // 수관: 동그라미 겹침 (삼각형 배치)
        const canopyR = 6 + (sz * 5 | 0);
        const rows = 3 + (sz > 0.8 ? 1 : 0);
        const step = (tH * 0.7) / rows;

        for (let row = 0; row < rows; row++) {
          const yRatio = (row + 0.3) / rows;
          const cy = -tH + step * (row + 0.5);
          const widthAtY = canopyR * (0.3 + yRatio * 0.7);
          const perRow = Math.max(2, Math.round(widthAtY / (canopyR * 0.6)));

          for (let col = 0; col < perRow; col++) {
            const xBase = -widthAtY + widthAtY * 2 * (col + 0.5) / perRow;
            const jx = (sR(tx, row * 17 + col * 7 + 10) - 0.5) * canopyR * 0.4;
            const jy = (sR(tx, row * 17 + col * 7 + 11) - 0.5) * step * 0.2;
            const cr = canopyR * (0.7 + sR(tx, row * 17 + col * 7 + 13) * 0.35);
            const cx = xBase + jx;
            const ccY = cy + jy;

            // 그림자
            g.fillStyle(leafCols[0] || 0x2a3828, 0.4);
            g.fillCircle(cx + 1, ccY + 1, cr);
            // 메인
            g.fillStyle(leafCols[1 + ((row + col) % Math.max(leafCols.length - 1, 1))] || 0x3a4838, 0.9);
            g.fillCircle(cx, ccY, cr);
            // 하이라이트
            if (row < 2) {
              g.fillStyle(leafCols[leafCols.length - 1] || 0x4a5848, 0.25);
              g.fillCircle(cx - cr * 0.15, ccY - cr * 0.15, cr * 0.4);
            }
          }
        }

        // 봄: 꽃잎 점
        if (this.season === "spring") {
          for (let p = 0; p < 3; p++) {
            const px = (sR(tx, p * 7 + 20) - 0.5) * canopyR * 2;
            const py = -tH + sR(tx, p * 7 + 21) * tH * 0.6;
            g.fillStyle(0xffdde8, 0.7);
            g.fillCircle(px, py, 1.5);
          }
        }
      } else {
        // 겨울: 앙상한 가지
        const bCount = 3 + (sz * 2 | 0);
        g.fillStyle(0x3a3030, 0.8);
        for (let b = 0; b < bCount; b++) {
          const side = sR(tx, b * 3 + 40) > 0.5 ? 1 : -1;
          const bLen = 5 + (sR(tx, b * 3 + 41) * 10 | 0);
          const by = -tH + 4 + (b * ((tH * 0.5) / bCount) | 0);
          const bx = side > 0 ? 1 : -bLen;
          g.fillRect(bx, by, bLen, 1);
        }
        // 눈
        g.fillStyle(0xddeeff, 0.5);
        g.fillRect(-4, -tH + 3, 3, 1);
      }

      g.setPosition(tx, baseY);
      this.trees.push({ g, baseX: tx, baseY, phase: sR(tx, 99) * Math.PI * 2 });
    });

    // 나무 흔들림 애니메이션
    this.time.addEvent({
      delay: 50, loop: true,
      callback: () => {
        const t = this.time.now * 0.001;
        this.trees.forEach(tree => {
          const angle = Math.sin(t * 1.5 + tree.phase) * 0.015;
          tree.g.setRotation(angle);
        });
      },
    });
  }

  // ═══════════════════════════════
  // 걸어다니는 사람
  // ═══════════════════════════════
  private createWalkers() {
    const skinColors = [0xfcd9a8, 0xe8c898, 0xd4b088];
    const shirtColors = [0x3366aa, 0xaa3333, 0x33aa66, 0x8844aa, 0xaa6633, 0x336688, 0x884444];
    const pantsColors = [0x2a2a3a, 0x3a3a2a, 0x2a3a3a, 0x3a2a3a];

    for (let i = 0; i < 8; i++) {
      const g = this.add.graphics().setDepth(10);
      const dir = sR(i, 50) > 0.5 ? 1 : -1;
      const skin = skinColors[i % skinColors.length];
      const shirt = shirtColors[i % shirtColors.length];
      const pants = pantsColors[i % pantsColors.length];

      // 머리
      g.fillStyle(skin, 1); g.fillCircle(0, -12, 4);
      // 머리카락
      g.fillStyle(0x333333, 1); g.fillRect(-4, -16, 8, 3);
      // 몸
      g.fillStyle(shirt, 1); g.fillRect(-3, -8, 6, 7);
      // 다리
      g.fillStyle(pants, 1); g.fillRect(-3, -1, 3, 5); g.fillRect(0, -1, 3, 5);
      // 신발
      g.fillStyle(0x222222, 1); g.fillRect(-3, 4, 3, 2); g.fillRect(0, 4, 3, 2);

      if (dir < 0) g.setScale(-1, 1);

      const startX = dir > 0 ? -20 - i * 80 : W + 20 + i * 80;
      g.setPosition(startX, GROUND_Y + 10);

      this.walkers.push({
        sprite: g,
        x: startX,
        speed: 0.3 + sR(i, 60) * 0.4,
        dir,
        colors: [skin, shirt, pants],
      });
    }
  }

  private updateWalkers() {
    this.walkers.forEach(w => {
      w.x += w.speed * w.dir;
      w.sprite.setPosition(w.x, GROUND_Y + 10);
      // 화면 벗어나면 반대편에서 다시 시작
      if (w.dir > 0 && w.x > W + 30) w.x = -30;
      if (w.dir < 0 && w.x < -30) w.x = W + 30;
      // 걷기 모션 (살짝 위아래)
      const bob = Math.sin(this.time.now * 0.008 + w.x * 0.1) * 1;
      w.sprite.setPosition(w.x, GROUND_Y + 10 + bob);
    });
  }

  // ═══════════════════════════════
  // 구름
  // ═══════════════════════════════
  private createClouds() {
    for (let i = 0; i < 4; i++) {
      const cg = this.add.graphics().setDepth(0);
      const col = this.timeOfDay === "sunset" ? 0xd09878 : 0xfafafa;
      const alpha = 0.3 + i * 0.1;
      const cw = 40 + i * 15;
      const ch = 12 + i * 3;
      cg.fillStyle(col, alpha * 0.7); cg.fillRoundedRect(0, ch * 0.4, cw, ch * 0.5, ch * 0.25);
      cg.fillStyle(col, alpha); cg.fillRoundedRect(cw * 0.1, 0, cw * 0.6, ch, ch * 0.5);
      cg.setPosition(i * (W / 4), 20 + i * 15);

      const dur = 40000 + i * 12000;
      const move = () => {
        if (!cg.active) return;
        this.tweens.add({
          targets: cg, x: W + cw + 30,
          duration: dur, ease: "Linear",
          onComplete: () => { if (cg.active) { cg.setPosition(-cw - 20, 20 + Math.random() * 40); move(); } },
        });
      };
      move();
    }
  }

  // ═══════════════════════════════
  // 가로등
  // ═══════════════════════════════
  private drawStreetLights() {
    const isNight = this.timeOfDay === "night";
    const positions = [170, 350, 500, 680];
    positions.forEach(x => {
      const g = this.add.graphics().setDepth(7);
      // 기둥
      g.fillStyle(0x4a5060, 1);
      g.fillRect(x - 1, GROUND_Y - 50, 3, 50);
      // 등 받침
      g.fillStyle(0x5a6070, 1);
      g.fillRect(x - 5, GROUND_Y - 52, 11, 4);
      // 빛
      if (isNight || this.timeOfDay === "sunset") {
        g.fillStyle(0xf0d860, 0.15);
        g.fillCircle(x, GROUND_Y - 48, 18);
        g.fillStyle(0xf0d860, 0.3);
        g.fillCircle(x, GROUND_Y - 50, 4);
      }
    });
  }

  // ═══════════════════════════════
  // 업데이트 (날씨 파티클)
  // ═══════════════════════════════
  update() {
    if (!this.particleG?.active) return;
    const pg = this.particleG;

    if (this.rainDrops.length > 0 || this.snowFlakes.length > 0) {
      pg.clear();
      // 비
      this.rainDrops.forEach(d => {
        pg.lineStyle(1, 0x8ab8d8, 0.3);
        pg.lineBetween(d.x, d.y, d.x - 0.5, d.y + d.len);
        d.y += d.speed; d.x -= 0.2;
        if (d.y > H) { d.y = -d.len; d.x = Math.random() * W; }
        if (d.x < 0) d.x += W;
      });
      // 눈
      this.snowFlakes.forEach(f => {
        pg.fillStyle(0xeeeeff, 0.6);
        pg.fillCircle(f.x, f.y, f.size);
        f.y += f.speed; f.x += f.dx + Math.sin(f.y * 0.04) * 0.2;
        if (f.y > H) { f.y = -4; f.x = Math.random() * W; }
        if (f.x < 0) f.x += W;
        if (f.x > W) f.x -= W;
      });
    }
  }
}
