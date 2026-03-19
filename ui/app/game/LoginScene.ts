/**
 * 로그인 야외 씬 — Graphics API 직접 렌더링
 * 사무실(OfficeScene)과 동일한 방식으로 일관된 픽셀아트 스타일
 */

import * as Phaser from "phaser";

const W = 960;
const H = 540;
const GROUND_Y = Math.floor(H * 0.72);
const ROAD_Y = GROUND_Y + 30;
const DPR = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 3) : 2;
const FONT = "'Pretendard Variable', Pretendard, -apple-system, sans-serif";

const sR = (a: number, b: number) =>
  (((a * 1664525 + b * 1013904223) | 0) >>> 1) / 0x7fffffff;

export default class LoginScene extends Phaser.Scene {
  private weatherCode = 0;
  private season: "spring" | "summer" | "autumn" | "winter" = "spring";
  private tod: "day" | "sunset" | "night" = "day";
  private walkers: { g: Phaser.GameObjects.Graphics; x: number; speed: number; dir: number; phase: number; y: number }[] = [];
  private rainDrops: { x: number; y: number; speed: number; len: number }[] = [];
  private snowFlakes: { x: number; y: number; speed: number; size: number; dx: number }[] = [];
  private petals: { x: number; y: number; s: number; dx: number }[] = [];
  private leaves: { x: number; y: number; s: number; dx: number; r: number; rs: number }[] = [];
  private particleG!: Phaser.GameObjects.Graphics;

  constructor() { super({ key: "LoginScene" }); }

  init(data: { weatherCode?: number }) {
    this.weatherCode = data.weatherCode ?? 0;
    const now = new Date();
    const mon = now.getMonth() + 1;
    const hr = now.getHours();
    this.season = mon >= 3 && mon <= 5 ? "spring" : mon >= 6 && mon <= 8 ? "summer" : mon >= 9 && mon <= 11 ? "autumn" : "winter";
    this.tod = hr >= 6 && hr < 17 ? "day" : hr >= 17 && hr < 20 ? "sunset" : "night";
  }

  create() {
    const isN = this.tod === "night";
    const isS = this.tod === "sunset";
    const wc = this.weatherCode;
    const isRain = (wc >= 51 && wc <= 82) || wc >= 95;
    const isSnow = wc >= 71 && wc <= 77;

    this.drawSky(isN, isS, isRain);
    this.drawBackBuildings(isN);
    this.drawStreet(isN);
    this.drawMainBuilding(isN);
    this.drawSideBuildings(isN);
    this.drawTrees(isN);
    this.drawStreetLights(isN, isS);
    this.createWalkers(isN);
    this.createClouds(isN, isS, isRain);

    // 파티클
    this.particleG = this.add.graphics().setDepth(50);
    if (isRain) for (let i = 0; i < 55; i++) this.rainDrops.push({ x: Math.random() * W, y: Math.random() * H, speed: 3 + Math.random() * 3, len: 8 + Math.random() * 10 });
    if (isSnow || this.season === "winter") for (let i = 0; i < 35; i++) this.snowFlakes.push({ x: Math.random() * W, y: Math.random() * H, speed: 0.3 + Math.random() * 0.5, size: 1.5 + Math.random() * 2, dx: (Math.random() - 0.5) * 0.4 });
    if (this.season === "spring" && !isRain) for (let i = 0; i < 12; i++) this.petals.push({ x: Math.random() * W, y: -Math.random() * H, s: 0.3 + Math.random() * 0.3, dx: 0.3 + Math.random() * 0.4 });
    if (this.season === "autumn" && !isRain) for (let i = 0; i < 10; i++) this.leaves.push({ x: Math.random() * W, y: -Math.random() * H, s: 0.4 + Math.random() * 0.4, dx: 0.2 + Math.random() * 0.3, r: Math.random() * 6, rs: (Math.random() - 0.5) * 0.04 });

    this.cameras.main.setBounds(0, 0, W, H);
    this.time.addEvent({ delay: 40, loop: true, callback: () => this.moveWalkers() });
  }

  // ═══════════════════════════════
  private drawSky(isN: boolean, isS: boolean, isRain: boolean) {
    const g = this.add.graphics().setDepth(0);
    let t: number, b: number;
    if (isN) { t = 0x050918; b = 0x0e1a30; }
    else if (isS) { t = 0x2a2058; b = 0xd06848; }
    else if (isRain) { t = 0x3a4050; b = 0x5a6068; }
    else { t = 0x2888c8; b = 0x80c8f8; }
    g.fillGradientStyle(t, t, b, b, 1);
    g.fillRect(0, 0, W, GROUND_Y);

    if (isN) {
      // 별
      for (let i = 0; i < 50; i++) {
        g.fillStyle(0xeeeeff, 0.3 + sR(i, 300) * 0.5);
        g.fillRect((sR(i, 100) * W) | 0, (sR(i, 200) * GROUND_Y * 0.5) | 0, sR(i, 400) > 0.85 ? 2 : 1, 1);
      }
      // 달
      const mx = W * 0.82, my = GROUND_Y * 0.18;
      g.fillStyle(0xf0e8cc, 0.06); g.fillCircle(mx, my, 18);
      g.fillStyle(0xfffae0, 0.85); g.fillCircle(mx, my, 8);
    }
    if (!isN && !isRain) {
      // 태양
      const sx = isS ? W * 0.15 : W * 0.75, sy = isS ? GROUND_Y * 0.4 : GROUND_Y * 0.18;
      g.fillStyle(isS ? 0xff8844 : 0xffdd88, 0.08); g.fillCircle(sx, sy, 22);
      g.fillStyle(0xffffff, 0.8); g.fillCircle(sx, sy, 7);
    }
  }

  // ═══════════════════════════════
  private drawBackBuildings(isN: boolean) {
    const g = this.add.graphics().setDepth(1);
    const bc = isN ? 0x0a1020 : 0x7090b0;
    const ba = isN ? 0.85 : 0.25;
    // 다양한 높이 빌딩
    for (let x = 0; x < W; x += 18 + ((x * 7) % 12)) {
      const bw = 14 + ((x * 3) % 16);
      const bh = 30 + ((x * 11) % 80);
      g.fillStyle(bc, ba);
      g.fillRect(x, GROUND_Y - bh, bw, bh);
      if (isN) {
        for (let wy = GROUND_Y - bh + 5; wy < GROUND_Y - 5; wy += 8) {
          for (let wx = x + 2; wx < x + bw - 2; wx += 5) {
            if (sR(wx, wy) > 0.55) {
              g.fillStyle(0xf0df60, 0.2 + sR(wx + 1, wy) * 0.25);
              g.fillRect(wx, wy, 3, 3);
            }
          }
        }
      }
    }
    // 남산타워 느낌
    const tx = W * 0.55, tBase = GROUND_Y - 90;
    g.fillStyle(bc, ba + 0.1);
    g.fillRect(tx - 2, tBase - 50, 4, 50);
    g.fillRect(tx - 8, tBase, 16, 10);
    g.fillRect(tx - 1, tBase - 65, 2, 15);
  }

  // ═══════════════════════════════
  private drawStreet(isN: boolean) {
    const g = this.add.graphics().setDepth(2);
    // 인도
    const sc = isN ? 0x3a3a48 : 0xc8c8d0;
    for (let x = 0; x < W; x += 20) {
      g.fillStyle(x % 40 < 20 ? sc : (isN ? 0x3e3e4c : 0xd0d0d8), 1);
      g.fillRect(x, GROUND_Y, 20, ROAD_Y - GROUND_Y);
    }
    // 도로
    g.fillStyle(isN ? 0x1a1a24 : 0x3a3a44, 1);
    g.fillRect(0, ROAD_Y, W, H - ROAD_Y);
    // 중앙선
    for (let x = 0; x < W; x += 28) {
      g.fillStyle(0xf0e060, isN ? 0.3 : 0.5);
      g.fillRect(x, ROAD_Y + (H - ROAD_Y) / 2 - 1, 14, 2);
    }
    // 인도 경계
    g.fillStyle(isN ? 0x505060 : 0x9898a0, 1);
    g.fillRect(0, ROAD_Y - 2, W, 3);
    // 겨울 눈
    if (this.season === "winter") {
      g.fillStyle(0xe8eef4, 0.3);
      g.fillRect(0, GROUND_Y, W, 15);
    }
  }

  // ═══════════════════════════════
  private drawMainBuilding(isN: boolean) {
    const g = this.add.graphics().setDepth(5);
    const bx = W / 2 - 80, bw = 160, bh = 160;
    const by = GROUND_Y - bh;

    // 외벽
    g.fillStyle(isN ? 0x1a2535 : 0x3a4a60, 1);
    g.fillRect(bx, by, bw, bh);
    g.fillStyle(isN ? 0x202a3a : 0x4a5a70, 1);
    g.fillRect(bx + 3, by + 3, bw - 6, bh - 3);

    // 유리창 (3층)
    for (let f = 0; f < 3; f++) {
      const fy = by + 22 + f * 42;
      // 창문 3열
      for (let c = 0; c < 3; c++) {
        const fx = bx + 10 + c * 48;
        g.fillStyle(isN ? 0xf0d860 : 0x88bbdd, isN ? 0.4 : 0.5);
        g.fillRect(fx, fy, 40, 30);
        // 창틀
        g.fillStyle(isN ? 0x2a3545 : 0x5a6a80, 1);
        g.fillRect(fx + 19, fy, 2, 30);
        g.fillRect(fx, fy + 14, 40, 2);
      }
    }

    // 입구
    const dx = bx + bw / 2 - 18, dw = 36, dh = 26;
    g.fillStyle(0x0a1020, 1);
    g.fillRect(dx, GROUND_Y - dh, dw, dh);
    g.fillStyle(isN ? 0x2a3545 : 0x5a6a80, 1);
    g.fillRect(dx + dw / 2 - 1, GROUND_Y - dh, 2, dh);
    // 입구 빛
    g.fillStyle(0xf0d860, isN ? 0.2 : 0.08);
    g.fillRect(dx - 6, GROUND_Y - dh - 4, dw + 12, 4);

    // 간판
    const signW = 100, signH = 16;
    g.fillStyle(0x0a1020, 0.9);
    g.fillRoundedRect(bx + bw / 2 - signW / 2, by + 3, signW, signH, 2);
    this.add.text(W / 2, by + 11, "(주)두근 컴퍼니", {
      fontSize: "10px", fontFamily: FONT,
      color: "#f0d860", resolution: DPR * 2,
    }).setOrigin(0.5).setDepth(6);
  }

  // ═══════════════════════════════
  private drawSideBuildings(isN: boolean) {
    const g = this.add.graphics().setDepth(4);
    // 좌측 건물들
    const leftB = [
      { x: 0, w: 70, h: 130, col: isN ? 0x182030 : 0x3a4858 },
      { x: 75, w: 55, h: 100, col: isN ? 0x1a2535 : 0x4a5868 },
      { x: 135, w: 65, h: 150, col: isN ? 0x152028 : 0x354555 },
      { x: 205, w: 80, h: 90, col: isN ? 0x1a2838 : 0x3a5060 },
    ];
    // 우측 건물들
    const rightB = [
      { x: W - 70, w: 70, h: 120, col: isN ? 0x182030 : 0x3a4858 },
      { x: W - 130, w: 55, h: 140, col: isN ? 0x1a2535 : 0x4a5868 },
      { x: W - 200, w: 65, h: 95, col: isN ? 0x152028 : 0x354555 },
      { x: W - 280, w: 75, h: 110, col: isN ? 0x1a2838 : 0x3a5060 },
    ];
    [...leftB, ...rightB].forEach(b => {
      const by = GROUND_Y - b.h;
      g.fillStyle(b.col, 1); g.fillRect(b.x, by, b.w, b.h);
      // 창문
      for (let wy = by + 8; wy < GROUND_Y - 8; wy += 10) {
        for (let wx = b.x + 4; wx < b.x + b.w - 4; wx += 8) {
          const lit = isN ? sR(wx, wy) > 0.45 : sR(wx, wy) > 0.7;
          g.fillStyle(lit ? (isN ? 0xf0d860 : 0x88bbdd) : (isN ? 0x101828 : 0x2a3848), lit ? (isN ? 0.35 : 0.4) : 0.6);
          g.fillRect(wx, wy, 5, 6);
        }
      }
    });
  }

  // ═══════════════════════════════
  private drawTrees(isN: boolean) {
    const positions = [50, 190, 310, 650, 770, 910];
    const leafCols = this.season === "spring" ? [0xc07898, 0xd898b0, 0xe8b0c8]
      : this.season === "summer" ? [0x1a5818, 0x287820, 0x389828]
      : this.season === "autumn" ? [0xa84818, 0xc86820, 0xd88828]
      : [];

    positions.forEach((tx, i) => {
      const g = this.add.graphics().setDepth(7);
      const sz = 0.7 + sR(tx, 3) * 0.5;
      const tH = 25 + (sz * 20 | 0);
      const trunkH = 8 + (sz * 4 | 0);

      // 줄기
      const tc = isN ? 0x151010 : 0x4a3018;
      g.fillStyle(tc, 0.95);
      g.fillRect(tx - 1, GROUND_Y - trunkH, 3, trunkH);

      if (this.season !== "winter") {
        // 수관: 삼각형 안에 동그라미
        const canopyR = 5 + (sz * 5 | 0);
        const rows = 3 + (sz > 0.8 ? 1 : 0);
        const step = (tH - trunkH) / rows;
        const canopyTop = GROUND_Y - tH;

        for (let row = 0; row < rows; row++) {
          const yR = (row + 0.3) / rows;
          const cy = canopyTop + step * (row + 0.5);
          const wAtY = canopyR * (0.3 + yR * 0.7);
          const perRow = Math.max(2, Math.round(wAtY / (canopyR * 0.5)));

          for (let col = 0; col < perRow; col++) {
            const xBase = -wAtY + wAtY * 2 * (col + 0.5) / perRow;
            const jx = (sR(tx, row * 17 + col * 7 + 10) - 0.5) * canopyR * 0.3;
            const cr = canopyR * (0.65 + sR(tx, row * 17 + col * 7 + 13) * 0.4);
            const cx = tx + xBase + jx;

            if (isN) {
              g.fillStyle(0x050805, 0.85);
              g.fillCircle(cx, cy, cr);
            } else {
              g.fillStyle(leafCols[0], 0.35);
              g.fillCircle(cx + 1, cy + 1, cr);
              g.fillStyle(leafCols[1 + ((row + col) % (leafCols.length - 1))], 0.9);
              g.fillCircle(cx, cy, cr);
              if (row < 2) {
                g.fillStyle(leafCols[leafCols.length - 1], 0.25);
                g.fillCircle(cx - cr * 0.15, cy - cr * 0.15, cr * 0.4);
              }
            }
          }
        }
      } else {
        // 겨울 가지
        g.fillStyle(isN ? 0x111010 : 0x3a3030, 0.8);
        for (let b = 0; b < 4; b++) {
          const side = sR(tx, b * 3 + 40) > 0.5 ? 1 : -1;
          const bLen = 5 + (sR(tx, b * 3 + 41) * 8 | 0);
          const by = GROUND_Y - tH + 4 + b * 5;
          g.fillRect(side > 0 ? tx + 1 : tx - bLen, by, bLen, 1);
        }
      }

      // 나무 흔들림
      this.tweens.add({
        targets: g, angle: 1.2,
        duration: 2200 + i * 400,
        yoyo: true, repeat: -1, ease: "Sine.easeInOut",
        delay: i * 250,
      });
    });
  }

  // ═══════════════════════════════
  private drawStreetLights(isN: boolean, isS: boolean) {
    const positions = [130, 340, 530, 730, 880];
    positions.forEach(x => {
      const g = this.add.graphics().setDepth(8);
      g.fillStyle(isN ? 0x3a4050 : 0x5a6070, 1);
      g.fillRect(x - 1, GROUND_Y - 50, 3, 50);
      g.fillStyle(isN ? 0x4a5060 : 0x6a7080, 1);
      g.fillRect(x - 5, GROUND_Y - 52, 11, 3);

      if (isN || isS) {
        const glow = this.add.graphics().setDepth(7.5);
        glow.fillStyle(0xf0d860, 0.06);
        glow.fillCircle(x, GROUND_Y - 50, 28);
        glow.fillStyle(0xf0d860, 0.15);
        glow.fillCircle(x, GROUND_Y - 50, 6);
        // 깜빡임
        this.tweens.add({
          targets: glow, alpha: 0.7,
          duration: 2000 + Math.random() * 1500,
          yoyo: true, repeat: -1, ease: "Sine.easeInOut",
        });
      }
    });
  }

  // ═══════════════════════════════
  private createWalkers(isN: boolean) {
    const shirts = [0x3366aa, 0xaa3333, 0x33aa66, 0x8844aa, 0xaa6633, 0x336688, 0xcc8844, 0x448888, 0x884466, 0x668833, 0x6644aa, 0x44aa88];
    const pants = [0x2a2a3a, 0x3a3a2a, 0x2a3a3a, 0x3a2a3a];
    const skins = [0xfcd9a8, 0xe8c898, 0xd4b088];

    for (let i = 0; i < 14; i++) {
      const g = this.add.graphics().setDepth(10);
      const dir = sR(i, 50) > 0.5 ? 1 : -1;
      const tall = sR(i, 70) > 0.5;
      const skin = skins[i % skins.length];
      const shirt = shirts[i % shirts.length];
      const pant = pants[i % pants.length];
      const hair = sR(i, 80) > 0.5 ? 0x222222 : 0x3a2818;

      // 머리
      g.fillStyle(skin, 1); g.fillCircle(0, tall ? -13 : -10, tall ? 4.5 : 3.5);
      g.fillStyle(hair, 1); g.fillRect(tall ? -4 : -3, tall ? -17 : -13, tall ? 8 : 6, 3);
      // 몸
      g.fillStyle(isN ? Phaser.Display.Color.ValueToColor(shirt).darken(40).color : shirt, 1);
      g.fillRect(tall ? -3 : -2, tall ? -8 : -6, tall ? 6 : 5, tall ? 8 : 6);
      // 다리
      g.fillStyle(isN ? 0x1a1a2a : pant, 1);
      g.fillRect(tall ? -3 : -2, tall ? 0 : 0, tall ? 2 : 2, tall ? 5 : 4);
      g.fillRect(tall ? 1 : 1, tall ? 0 : 0, tall ? 2 : 2, tall ? 5 : 4);
      // 신발
      g.fillStyle(0x222222, 1);
      g.fillRect(tall ? -3 : -2, tall ? 5 : 4, tall ? 2 : 2, 1);
      g.fillRect(tall ? 1 : 1, tall ? 5 : 4, tall ? 2 : 2, 1);

      if (dir < 0) g.setScale(-1, 1);

      const startX = dir > 0 ? -(20 + sR(i, 60) * W * 0.6) : W + 20 + sR(i, 61) * W * 0.6;
      const walkY = GROUND_Y + 8 + sR(i, 62) * 18;
      g.setPosition(startX, walkY);

      this.walkers.push({ g, x: startX, speed: 0.2 + sR(i, 63) * 0.5, dir, phase: sR(i, 64) * Math.PI * 2, y: walkY });
    }
  }

  private moveWalkers() {
    const t = this.time.now * 0.001;
    this.walkers.forEach(w => {
      w.x += w.speed * w.dir;
      if (w.dir > 0 && w.x > W + 40) w.x = -40 - Math.random() * 200;
      if (w.dir < 0 && w.x < -40) w.x = W + 40 + Math.random() * 200;
      const bob = Math.sin(t * 5 + w.phase) * 1;
      w.g.setPosition(w.x, w.y + bob);
    });
  }

  // ═══════════════════════════════
  private createClouds(isN: boolean, isS: boolean, isRain: boolean) {
    if (isN) return;
    const count = isRain ? 6 : 3;
    for (let i = 0; i < count; i++) {
      const cg = this.add.graphics().setDepth(0.5);
      const cw = 45 + i * 18;
      const ch = 12 + i * 4;
      const col = isRain ? 0x5a6070 : (isS ? 0xd09878 : 0xfafafa);
      const a = isRain ? 0.6 : 0.35;
      cg.fillStyle(col, a * 0.7); cg.fillRoundedRect(0, ch * 0.35, cw, ch * 0.5, ch * 0.25);
      cg.fillStyle(col, a); cg.fillRoundedRect(cw * 0.1, 0, cw * 0.6, ch, ch * 0.45);
      cg.setPosition(-cw + i * (W / count), 15 + i * 12);

      const dur = 45000 + i * 12000;
      const move = () => {
        if (!cg.active) return;
        this.tweens.add({
          targets: cg, x: W + cw,
          duration: dur, ease: "Linear",
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
