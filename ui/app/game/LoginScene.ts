/**
 * 로그인 야외 씬 — 개별 스프라이트 조합 + 애니메이션
 * 모든 요소가 독립적으로 움직이는 게임형 화면
 */

import * as Phaser from "phaser";

const W = 960;
const H = 540;
const GROUND_Y = H - 140; // 바닥 시작
const SKY_H = 200;

export default class LoginScene extends Phaser.Scene {
  private weatherCode = 0;
  private season: "spring" | "summer" | "autumn" | "winter" = "spring";
  private timeOfDay: "day" | "sunset" | "night" = "day";
  private particleG: Phaser.GameObjects.Graphics | null = null;
  private rainDrops: { x: number; y: number; speed: number; len: number }[] = [];
  private snowFlakes: { x: number; y: number; speed: number; size: number; dx: number }[] = [];
  private petals: { x: number; y: number; speed: number; dx: number }[] = [];
  private leaves: { x: number; y: number; speed: number; dx: number; rot: number; rs: number }[] = [];
  private walkers: { img: Phaser.GameObjects.Image; x: number; speed: number; dir: number; baseY: number }[] = [];

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
    const P = "/assets/gen/login/";
    this.load.image("sky_day", P + "sky_day.png");
    this.load.image("sky_night", P + "sky_night.png");
    this.load.image("skyline_back", P + "skyline_back.png");
    this.load.image("ground", P + "ground.png");
    this.load.image("building_main", P + (1 < 2 ? "building_main_1f.png" : "building_main_3f.png")); // TODO: 층수 동적
    this.load.image("building_left", P + "building_left.png");
    this.load.image("building_right", P + "building_right.png");
    this.load.image("tree_1", P + "tree_1.png");
    this.load.image("tree_2", P + "tree_2.png");
    this.load.image("tree_3", P + "tree_3.png");
    for (let i = 1; i <= 6; i++) this.load.image(`person_${i}`, P + `person_${i}.png`);
  }

  create() {
    const isNight = this.timeOfDay === "night";
    const isSunset = this.timeOfDay === "sunset";

    // ═══ 하늘 ═══
    const skyKey = isNight ? "sky_night" : "sky_day";
    const sky = this.add.image(W / 2, SKY_H / 2, skyKey).setDisplaySize(W, SKY_H).setDepth(0);
    if (isSunset) sky.setTint(0xffaa66);

    // ═══ 구름 (이동) ═══
    if (!isNight) {
      for (let i = 0; i < 3; i++) {
        // 구름을 Graphics로 그림 (AI 배경에 구름 있어도 추가 움직이는 구름)
        const cg = this.add.graphics().setDepth(0.5);
        const cw = 50 + i * 20;
        const ch = 15 + i * 5;
        const col = isSunset ? 0xd09878 : 0xffffff;
        cg.fillStyle(col, 0.35);
        cg.fillRoundedRect(0, ch * 0.35, cw, ch * 0.5, ch * 0.25);
        cg.fillStyle(col, 0.5);
        cg.fillRoundedRect(cw * 0.1, 0, cw * 0.6, ch, ch * 0.45);
        cg.setPosition(-cw + i * W / 3, 30 + i * 20);

        const dur = 50000 + i * 15000;
        const move = () => {
          if (!cg.active) return;
          this.tweens.add({
            targets: cg, x: W + cw,
            duration: dur, ease: "Linear",
            onComplete: () => { if (cg.active) { cg.setPosition(-cw, 25 + Math.random() * 50); move(); } },
          });
        };
        move();
      }
    }

    // ═══ 뒤쪽 스카이라인 ═══
    const skyline = this.add.image(W / 2, GROUND_Y - 60, "skyline_back").setDisplaySize(W, 200).setDepth(1).setOrigin(0.5, 1);
    if (isNight) skyline.setTint(0x334466);
    if (isSunset) skyline.setTint(0xddaa77);
    // 야간 빌딩 창문 빛
    if (isNight) {
      const winG = this.add.graphics().setDepth(1.5);
      for (let i = 0; i < 30; i++) {
        const wx = 50 + Math.random() * (W - 100);
        const wy = GROUND_Y - 80 - Math.random() * 100;
        winG.fillStyle(0xf0d860, 0.15 + Math.random() * 0.2);
        winG.fillRect(wx, wy, 3 + Math.random() * 4, 3 + Math.random() * 3);
      }
    }

    // ═══ 좌측 건물 ═══
    const bLeft = this.add.image(100, GROUND_Y, "building_left").setOrigin(0.5, 1).setDepth(2);
    if (isNight) bLeft.setTint(0x556688);

    // ═══ 메인 건물 (두근컴퍼니) ═══
    const bMain = this.add.image(W / 2, GROUND_Y, "building_main").setOrigin(0.5, 1).setDepth(2);
    if (isNight) bMain.setTint(0x667799);
    // 간판
    this.add.text(W / 2, GROUND_Y - bMain.displayHeight + 15, "(주)두근 컴퍼니", {
      fontSize: "11px", fontFamily: "'Pretendard Variable', sans-serif",
      color: isNight ? "#f0d860" : "#ffffff",
      stroke: "#000000", strokeThickness: 2,
      resolution: Math.min(window.devicePixelRatio || 1, 3) * 2,
    }).setOrigin(0.5).setDepth(2.5);

    // ═══ 우측 건물 ═══
    const bRight = this.add.image(W - 100, GROUND_Y, "building_right").setOrigin(0.5, 1).setDepth(2);
    if (isNight) bRight.setTint(0x556688);

    // ═══ 나무 (흔들림) ═══
    const treePositions = [60, 200, 340, 620, 760, 900];
    const treeKeys = ["tree_1", "tree_2", "tree_3"];
    treePositions.forEach((tx, i) => {
      const key = treeKeys[i % treeKeys.length];
      const tree = this.add.image(tx, GROUND_Y, key).setOrigin(0.5, 1).setDepth(3);
      const sc = 0.7 + (i % 3) * 0.15;
      tree.setScale(sc);

      // 계절 tint
      if (this.season === "spring") tree.setTint(0xffccdd);
      else if (this.season === "autumn") tree.setTint(0xee9944);
      else if (this.season === "winter") tree.setTint(0x889098).setAlpha(0.7);
      if (isNight) tree.setTint(0x334455);

      // 바람 흔들림
      this.tweens.add({
        targets: tree, angle: 1.5,
        duration: 2000 + i * 400,
        yoyo: true, repeat: -1, ease: "Sine.easeInOut",
        delay: i * 300,
      });
    });

    // ═══ 바닥 ═══
    const ground = this.add.image(W / 2, H, "ground").setDisplaySize(W, 140).setOrigin(0.5, 1).setDepth(4);
    if (isNight) ground.setTint(0x445566);
    if (this.season === "winter") {
      const snowG = this.add.graphics().setDepth(4.5);
      snowG.fillStyle(0xe8eef4, 0.3);
      snowG.fillRect(0, GROUND_Y, W, 20);
    }

    // ═══ 가로등 ═══
    if (isNight || isSunset) {
      [150, 400, 560, 810].forEach(lx => {
        const lg = this.add.graphics().setDepth(5);
        // 기둥
        lg.fillStyle(0x4a5060, 1);
        lg.fillRect(lx - 1, GROUND_Y - 55, 3, 55);
        lg.fillStyle(0x5a6070, 1);
        lg.fillRect(lx - 5, GROUND_Y - 57, 11, 4);
        // 빛
        lg.fillStyle(0xf0d860, 0.08);
        lg.fillCircle(lx, GROUND_Y - 55, 30);
        lg.fillStyle(0xf0d860, 0.2);
        lg.fillCircle(lx, GROUND_Y - 55, 8);
        // 깜빡임
        this.tweens.add({
          targets: lg, alpha: 0.75,
          duration: 2500 + Math.random() * 1500,
          yoyo: true, repeat: -1, ease: "Sine.easeInOut",
        });
      });
    }

    // ═══ 걸어다니는 사람들 ═══
    for (let i = 1; i <= 6; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const img = this.add.image(0, 0, `person_${i}`).setDepth(6);
      const sc = 0.5 + Math.random() * 0.25;
      img.setScale(dir < 0 ? -sc : sc, sc);
      const startX = dir > 0 ? -(Math.random() * W * 0.5 + 30) : W + (Math.random() * W * 0.5 + 30);
      const baseY = GROUND_Y + 15 + Math.random() * 20;
      img.setPosition(startX, baseY);
      if (isNight) img.setTint(0x667788);

      this.walkers.push({
        img, x: startX,
        speed: 0.3 + Math.random() * 0.5,
        dir, baseY,
      });
    }

    // ═══ 날씨 파티클 ═══
    this.particleG = this.add.graphics().setDepth(20);
    const wc = this.weatherCode;
    if ((wc >= 51 && wc <= 82) || wc >= 95) {
      for (let i = 0; i < 55; i++) {
        this.rainDrops.push({ x: Math.random() * W, y: Math.random() * H, speed: 3 + Math.random() * 3, len: 8 + Math.random() * 10 });
      }
      const rov = this.add.graphics().setDepth(0.1);
      rov.fillStyle(0x1a2030, 0.2);
      rov.fillRect(0, 0, W, H);
    }
    if (wc >= 71 && wc <= 77 || this.season === "winter") {
      for (let i = 0; i < 40; i++) {
        this.snowFlakes.push({ x: Math.random() * W, y: Math.random() * H, speed: 0.3 + Math.random() * 0.5, size: 1.5 + Math.random() * 2, dx: (Math.random() - 0.5) * 0.4 });
      }
    }
    if (this.season === "spring" && wc < 51) {
      for (let i = 0; i < 12; i++) {
        this.petals.push({ x: Math.random() * W, y: -10 - Math.random() * H * 0.5, speed: 0.3 + Math.random() * 0.3, dx: 0.3 + Math.random() * 0.4 });
      }
    }
    if (this.season === "autumn" && wc < 51) {
      for (let i = 0; i < 10; i++) {
        this.leaves.push({ x: Math.random() * W, y: -10 - Math.random() * H * 0.5, speed: 0.4 + Math.random() * 0.4, dx: 0.2 + Math.random() * 0.3, rot: Math.random() * 6, rs: (Math.random() - 0.5) * 0.04 });
      }
    }

    // 카메라
    this.cameras.main.setBounds(0, 0, W, H);
  }

  update() {
    const t = this.time.now * 0.001;

    // 사람 걷기
    this.walkers.forEach(w => {
      w.x += w.speed * w.dir;
      if (w.dir > 0 && w.x > W + 50) w.x = -50 - Math.random() * 150;
      if (w.dir < 0 && w.x < -50) w.x = W + 50 + Math.random() * 150;
      const bob = Math.sin(t * 6 + w.x * 0.05) * 1;
      w.img.setPosition(w.x, w.baseY + bob);
    });

    // 파티클
    if (!this.particleG?.active) return;
    const pg = this.particleG;
    pg.clear();

    this.rainDrops.forEach(d => {
      pg.lineStyle(1, 0x8ab8d8, 0.3);
      pg.lineBetween(d.x, d.y, d.x - 0.8, Math.min(d.y + d.len, H));
      d.y += d.speed; d.x -= 0.5;
      if (d.y > H) { d.y = -(d.len + 8); d.x = Math.random() * W; }
      if (d.x < 0) d.x += W;
    });

    this.snowFlakes.forEach(f => {
      pg.fillStyle(0xeef4ff, 0.6);
      pg.fillCircle(f.x, f.y, f.size);
      f.y += f.speed; f.x += f.dx + Math.sin(f.y * 0.02) * 0.3;
      if (f.y > H) { f.y = -5; f.x = Math.random() * W; }
      if (f.x < 0) f.x += W; if (f.x > W) f.x -= W;
    });

    this.petals.forEach(p => {
      pg.fillStyle(0xffb0c8, 0.5);
      pg.fillCircle(p.x, p.y, 2.5);
      pg.fillStyle(0xffd0e0, 0.3);
      pg.fillCircle(p.x + 1, p.y - 1, 1.5);
      p.y += p.speed; p.x += p.dx + Math.sin(p.y * 0.015) * 0.6;
      if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
    });

    this.leaves.forEach(l => {
      const cols = [0xcc6620, 0xdd8830, 0xbb4410];
      pg.fillStyle(cols[Math.floor(Math.abs(l.rot) * 2) % cols.length], 0.6);
      pg.fillRect(l.x - 2, l.y - 1, 5, 3);
      l.y += l.speed; l.x += l.dx + Math.sin(l.y * 0.012) * 0.7;
      l.rot += l.rs;
      if (l.y > H + 10) { l.y = -10; l.x = Math.random() * W; }
    });
  }
}
