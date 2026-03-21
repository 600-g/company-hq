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

  constructor() { super({ key: "LoginScene" }); }

  init(data: { weatherCode?: number }) {
    this.weatherCode = data.weatherCode ?? 0;
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
  }

  // ═══════════════════════════════
  private drawSky(isN: boolean, isS: boolean, isRain: boolean) {
    const g = this.add.graphics().setDepth(0);
    let t: number, b: number;
    if      (isN)    { t = 0x050918; b = 0x0e1a30; }
    else if (isS)    { t = 0x2a2058; b = 0xd06848; }
    else if (isRain) { t = 0x3a4050; b = 0x5a6068; }
    else             { t = 0x2888c8; b = 0x80c8f8; }
    g.fillGradientStyle(t, t, b, b, 1);
    g.fillRect(0, 0, W, GROUND_Y);

    if (isN) {
      for (let i = 0; i < 50; i++) {
        g.fillStyle(0xeeeeff, 0.3 + sR(i, 300) * 0.5);
        g.fillRect((sR(i, 100) * W) | 0, (sR(i, 200) * GROUND_Y * 0.5) | 0, sR(i, 400) > 0.85 ? 2 : 1, 1);
      }
      const mx = W * 0.82, my = GROUND_Y * 0.18;
      g.fillStyle(0xf0e8cc, 0.06); g.fillCircle(mx, my, 18);
      g.fillStyle(0xfffae0, 0.85); g.fillCircle(mx, my, 8);
    }
    if (!isN && !isRain) {
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
    for (let x = 0; x < W; x += 18 + ((x * 7) % 12)) {
      const bw = 14 + ((x * 3) % 16);
      const bh = 30 + ((x * 11) % 80);
      g.fillStyle(bc, ba);
      g.fillRect(x, GROUND_Y - bh, bw, bh);
      if (isN) {
        for (let wy = GROUND_Y - bh + 5; wy < GROUND_Y - 5; wy += 8)
          for (let wx = x + 2; wx < x + bw - 2; wx += 5)
            if (sR(wx, wy) > 0.55) {
              g.fillStyle(0xf0df60, 0.2 + sR(wx + 1, wy) * 0.25);
              g.fillRect(wx, wy, 3, 3);
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
    const sc = isN ? 0x3a3a48 : 0xc8c8d0;
    for (let x = 0; x < W; x += 20) {
      g.fillStyle(x % 40 < 20 ? sc : (isN ? 0x3e3e4c : 0xd0d0d8), 1);
      g.fillRect(x, GROUND_Y, 20, ROAD_Y - GROUND_Y);
    }
    g.fillStyle(isN ? 0x1a1a24 : 0x3a3a44, 1);
    g.fillRect(0, ROAD_Y, W, H - ROAD_Y);
    for (let x = 0; x < W; x += 28) {
      g.fillStyle(0xf0e060, isN ? 0.3 : 0.5);
      g.fillRect(x, ROAD_Y + (H - ROAD_Y) / 2 - 1, 14, 2);
    }
    g.fillStyle(isN ? 0x505060 : 0x9898a0, 1);
    g.fillRect(0, ROAD_Y - 2, W, 3);
    if (this.season === "winter") {
      g.fillStyle(0xe8eef4, 0.3);
      g.fillRect(0, GROUND_Y, W, 15);
    }
  }

  // ═══════════════════════════════
  private drawMainBuilding(isN: boolean) {
    const g  = this.add.graphics().setDepth(5);
    const bx = W / 2 - 80, bw = 160, bh = 160;
    const by = GROUND_Y - bh;

    g.fillStyle(isN ? 0x1a2535 : 0x3a4a60, 1);
    g.fillRect(bx, by, bw, bh);
    g.fillStyle(isN ? 0x202a3a : 0x4a5a70, 1);
    g.fillRect(bx + 3, by + 3, bw - 6, bh - 3);

    for (let f = 0; f < 3; f++) {
      const fy = by + 22 + f * 42;
      for (let c = 0; c < 3; c++) {
        const fx = bx + 10 + c * 48;
        g.fillStyle(isN ? 0xf0d860 : 0x88bbdd, isN ? 0.4 : 0.5);
        g.fillRect(fx, fy, 40, 30);
        g.fillStyle(isN ? 0x2a3545 : 0x5a6a80, 1);
        g.fillRect(fx + 19, fy, 2, 30);
        g.fillRect(fx, fy + 14, 40, 2);
      }
    }

    const dx = bx + bw / 2 - 18, dw = 36, dh = 26;
    g.fillStyle(0x0a1020, 1);
    g.fillRect(dx, GROUND_Y - dh, dw, dh);
    g.fillStyle(isN ? 0x2a3545 : 0x5a6a80, 1);
    g.fillRect(dx + dw / 2 - 1, GROUND_Y - dh, 2, dh);
    g.fillStyle(0xf0d860, isN ? 0.2 : 0.08);
    g.fillRect(dx - 6, GROUND_Y - dh - 4, dw + 12, 4);

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
    const leftB  = [
      { x: 0,   w: 70, h: 130, col: isN ? 0x182030 : 0x3a4858 },
      { x: 75,  w: 55, h: 100, col: isN ? 0x1a2535 : 0x4a5868 },
      { x: 135, w: 65, h: 150, col: isN ? 0x152028 : 0x354555 },
      { x: 205, w: 80, h:  90, col: isN ? 0x1a2838 : 0x3a5060 },
    ];
    const rightB = [
      { x: W - 70,  w: 70, h: 120, col: isN ? 0x182030 : 0x3a4858 },
      { x: W - 130, w: 55, h: 140, col: isN ? 0x1a2535 : 0x4a5868 },
      { x: W - 200, w: 65, h:  95, col: isN ? 0x152028 : 0x354555 },
      { x: W - 280, w: 75, h: 110, col: isN ? 0x1a2838 : 0x3a5060 },
    ];
    [...leftB, ...rightB].forEach(b => {
      const by = GROUND_Y - b.h;
      g.fillStyle(b.col, 1); g.fillRect(b.x, by, b.w, b.h);
      for (let wy = by + 8; wy < GROUND_Y - 8; wy += 10)
        for (let wx = b.x + 4; wx < b.x + b.w - 4; wx += 8) {
          const lit = isN ? sR(wx, wy) > 0.45 : sR(wx, wy) > 0.7;
          g.fillStyle(lit ? (isN ? 0xf0d860 : 0x88bbdd) : (isN ? 0x101828 : 0x2a3848), lit ? (isN ? 0.35 : 0.4) : 0.6);
          g.fillRect(wx, wy, 5, 6);
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
      g.fillStyle(isN ? 0x3a4050 : 0x5a6070, 1);
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
