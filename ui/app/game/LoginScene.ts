/**
 * 로그인 야외 씬 — Nano Banana AI 생성 이미지 + Phaser 애니메이션
 * - AI 생성 배경 (계절/시간대별)
 * - 걸어다니는 사람들 (양방향, 불규칙)
 * - 흔들리는 나무
 * - 날씨 파티클 (비/눈)
 * - 구름 흘러가기
 * - 가로등 깜빡임 (밤)
 */

import * as Phaser from "phaser";

const W = 960;
const H = 540;
const GROUND_Y = H * 0.82; // 인도 위치
const DPR = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 3) : 2;

const sR = (a: number, b: number) =>
  (((a * 1664525 + b * 1013904223) | 0) >>> 1) / 0x7fffffff;

export default class LoginScene extends Phaser.Scene {
  private weatherCode = 0;
  private season: "spring" | "summer" | "autumn" | "winter" = "spring";
  private timeOfDay: "day" | "sunset" | "night" = "day";
  private walkers: { g: Phaser.GameObjects.Graphics; x: number; speed: number; dir: number; bobPhase: number }[] = [];
  private treeTops: { g: Phaser.GameObjects.Graphics; baseX: number; phase: number }[] = [];
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

  preload() {
    this.load.image("login_bg", "/assets/gen/login_base.png");
  }

  create() {
    // ── 배경 이미지 (1장 기준, 코드로 분위기 변환) ──
    const bg = this.add.image(W / 2, H / 2, "login_bg").setDisplaySize(W, H).setDepth(0);

    // 계절/시간대별 tint + 오버레이
    const overlay = this.add.graphics().setDepth(1);
    if (this.timeOfDay === "night") {
      bg.setTint(0x4466aa); // 파란 야간 톤
      overlay.fillStyle(0x000030, 0.35);
      overlay.fillRect(0, 0, W, H);
    } else if (this.timeOfDay === "sunset") {
      bg.setTint(0xffcc88); // 따뜻한 석양
      overlay.fillStyle(0x802000, 0.1);
      overlay.fillRect(0, 0, W, H);
    } else {
      // 낮 — 계절별 미세 tint
      if (this.season === "spring") bg.setTint(0xffeef5); // 살짝 핑크
      else if (this.season === "summer") bg.setTint(0xffffff); // 원본
      else if (this.season === "autumn") bg.setTint(0xffe8cc); // 따뜻한 오렌지
      else bg.setTint(0xddeeff); // 겨울 차가운 블루
    }

    // 겨울 눈 쌓인 효과
    if (this.season === "winter") {
      overlay.fillStyle(0xeef4ff, 0.15);
      overlay.fillRect(0, GROUND_Y - 10, W, H - GROUND_Y + 10);
    }

    // ── 나무 흔들림 (배경 위에 반투명 수관 오버레이) ──
    this.createSwayingTrees();

    // ── 걸어다니는 사람들 (양방향, 불규칙) ──
    this.createWalkers();

    // ── 날씨 파티클 ──
    this.particleG = this.add.graphics().setDepth(40);
    const wc = this.weatherCode;
    if ((wc >= 51 && wc <= 82) || wc >= 95) {
      for (let i = 0; i < 60; i++) {
        this.rainDrops.push({
          x: Math.random() * W, y: Math.random() * H,
          speed: 2.5 + Math.random() * 2.5,
          len: 6 + Math.random() * 8,
        });
      }
    }
    if (wc >= 71 && wc <= 77 || this.season === "winter") {
      for (let i = 0; i < 40; i++) {
        this.snowFlakes.push({
          x: Math.random() * W, y: Math.random() * H,
          speed: 0.2 + Math.random() * 0.5,
          size: 1 + Math.random() * 2.5,
          dx: (Math.random() - 0.5) * 0.4,
        });
      }
    }

    // ── 가로등 깜빡임 (밤) ──
    if (this.timeOfDay === "night") {
      this.createLightFlicker();
    }

    // 카메라
    this.cameras.main.setBounds(0, 0, W, H);
  }

  // ═══════════════════════════════
  // 나무 흔들림
  // ═══════════════════════════════
  private createSwayingTrees() {
    // 배경 이미지 위에 나무 위치에 반투명 동그라미를 그려서 흔들림 효과
    const leafCols = this.season === "spring" ? [0xe8a0c0, 0xf0b8d0]
      : this.season === "summer" ? [0x2a8828, 0x38a830]
      : this.season === "autumn" ? [0xc86820, 0xd88830]
      : [0x889098, 0x98a0a8]; // 겨울도 살짝

    const treePositions = [80, 185, 380, 560, 700, 820];
    treePositions.forEach((tx, i) => {
      const g = this.add.graphics().setDepth(3).setAlpha(0.3);
      const ty = GROUND_Y - 50 - sR(tx, 1) * 30;

      // 수관 동그라미
      for (let c = 0; c < 5; c++) {
        const cx = (sR(tx, c * 5 + 10) - 0.5) * 20;
        const cy = (sR(tx, c * 5 + 11) - 0.5) * 15 - 10;
        const cr = 8 + sR(tx, c * 5 + 12) * 8;
        g.fillStyle(leafCols[c % leafCols.length], 0.6);
        g.fillCircle(cx, cy, cr);
      }
      g.setPosition(tx, ty);
      this.treeTops.push({ g, baseX: tx, phase: sR(tx, 99) * Math.PI * 2 });
    });
  }

  // ═══════════════════════════════
  // 걸어다니는 사람들
  // ═══════════════════════════════
  private createWalkers() {
    const skinTones = [0xfcd9a8, 0xe8c898, 0xd4b088];
    const shirtCols = [0x3366aa, 0xaa3333, 0x33aa66, 0x8844aa, 0xaa6633, 0x336688, 0xcc8844, 0x448888, 0x884466, 0x668833];
    const pantsCols = [0x2a2a3a, 0x3a3a2a, 0x2a3a3a, 0x3a2a3a, 0x2a2a4a];

    const count = 12;
    for (let i = 0; i < count; i++) {
      const g = this.add.graphics().setDepth(15);
      const dir = sR(i, 50) > 0.5 ? 1 : -1;
      const skin = skinTones[i % skinTones.length];
      const shirt = shirtCols[i % shirtCols.length];
      const pants = pantsCols[i % pantsCols.length];
      const tall = sR(i, 70) > 0.5; // 키 차이

      // 머리
      g.fillStyle(skin, 1);
      g.fillCircle(0, tall ? -14 : -11, tall ? 5 : 4);
      // 머리카락
      const hairCol = sR(i, 80) > 0.6 ? 0x222222 : (sR(i, 81) > 0.5 ? 0x4a3020 : 0x1a1a2a);
      g.fillStyle(hairCol, 1);
      g.fillRect(tall ? -5 : -4, tall ? -19 : -15, tall ? 10 : 8, tall ? 4 : 3);
      // 몸
      g.fillStyle(shirt, 1);
      g.fillRect(tall ? -4 : -3, tall ? -9 : -7, tall ? 8 : 6, tall ? 9 : 7);
      // 다리
      g.fillStyle(pants, 1);
      g.fillRect(tall ? -4 : -3, tall ? 0 : 0, tall ? 3 : 3, tall ? 6 : 5);
      g.fillRect(tall ? 1 : 0, tall ? 0 : 0, tall ? 3 : 3, tall ? 6 : 5);
      // 신발
      g.fillStyle(0x222222, 1);
      g.fillRect(tall ? -4 : -3, tall ? 6 : 5, tall ? 3 : 3, 2);
      g.fillRect(tall ? 1 : 0, tall ? 6 : 5, tall ? 3 : 3, 2);

      if (dir < 0) g.setScale(-1, 1);

      // 불규칙 시작 위치
      const startX = dir > 0
        ? -(sR(i, 60) * W * 0.5 + 20)
        : W + (sR(i, 61) * W * 0.5 + 20);

      // 인도 위 약간 다른 높이 (앞/뒤 깊이감)
      const walkY = GROUND_Y + 5 + sR(i, 62) * 15;
      g.setPosition(startX, walkY);

      this.walkers.push({
        g,
        x: startX,
        speed: 0.25 + sR(i, 63) * 0.45, // 불규칙 속도
        dir,
        bobPhase: sR(i, 64) * Math.PI * 2,
      });
    }
  }

  // ═══════════════════════════════
  // 가로등 깜빡임
  // ═══════════════════════════════
  private createLightFlicker() {
    const positions = [120, 300, 480, 660, 840];
    positions.forEach(x => {
      const glow = this.add.graphics().setDepth(2);
      glow.fillStyle(0xf0d860, 0.12);
      glow.fillCircle(x, GROUND_Y - 60, 25);
      glow.fillStyle(0xf0d860, 0.06);
      glow.fillCircle(x, GROUND_Y - 60, 40);

      // 살짝 깜빡임
      this.tweens.add({
        targets: glow, alpha: 0.7,
        duration: 2000 + Math.random() * 2000,
        yoyo: true, repeat: -1, ease: "Sine.easeInOut",
      });
    });
  }

  // ═══════════════════════════════
  // 업데이트
  // ═══════════════════════════════
  update() {
    const t = this.time.now * 0.001;

    // 나무 흔들림
    this.treeTops.forEach(tree => {
      const angle = Math.sin(t * 1.2 + tree.phase) * 0.02;
      tree.g.setRotation(angle);
    });

    // 사람 걷기
    this.walkers.forEach(w => {
      w.x += w.speed * w.dir;
      // 화면 벗어나면 반대편에서 불규칙하게 재등장
      if (w.dir > 0 && w.x > W + 40) w.x = -40 - Math.random() * 100;
      if (w.dir < 0 && w.x < -40) w.x = W + 40 + Math.random() * 100;
      // 걷기 바운스
      const bob = Math.sin(t * 5 + w.bobPhase) * 1.2;
      w.g.setPosition(w.x, w.g.y + bob * 0.1); // 미세 바운스
      w.g.x = w.x;
    });

    // 날씨 파티클
    if (this.particleG?.active && (this.rainDrops.length > 0 || this.snowFlakes.length > 0)) {
      const pg = this.particleG;
      pg.clear();

      // 비
      this.rainDrops.forEach(d => {
        pg.lineStyle(1, 0x8ab8d8, 0.25 + Math.random() * 0.1);
        const endY = Math.min(d.y + d.len, H);
        pg.lineBetween(d.x, d.y, d.x - 0.5, endY);
        d.y += d.speed; d.x -= 0.3;
        if (d.y > H) { d.y = -(d.len + 5); d.x = Math.random() * W; }
        if (d.x < 0) d.x += W;
      });

      // 눈
      this.snowFlakes.forEach(f => {
        pg.fillStyle(0xeeeeff, 0.55);
        pg.fillCircle(f.x, f.y, f.size);
        f.y += f.speed;
        f.x += f.dx + Math.sin(f.y * 0.03) * 0.25;
        if (f.y > H) { f.y = -5; f.x = Math.random() * W; }
        if (f.x < 0) f.x += W;
        if (f.x > W) f.x -= W;
      });
    }
  }
}
