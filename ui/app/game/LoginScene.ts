/**
 * 로그인 & EXIT 공용 씬 — 탑뷰 마을 (2×3)
 * 뒷줄: 집A / 🏢 두근컴퍼니 HQ (중앙) / 집B
 * 앞줄: 집C / 🌳 공원 (중앙) / 집D
 * 대로(HQ 정면), 하단 인도, 골목 세로 보행, 대로 가로 보행
 * HQ 입구 클릭 → showReturnBtn 모드면 OfficeScene 복귀
 */
import * as Phaser from "phaser";

const W = 960;
const H = 540;
const FONT = "'Pretendard Variable', Pretendard, -apple-system, sans-serif";
const DPR = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 3) : 2;

const SKY_H = 46;
const BACK_TOP = SKY_H;
const BACK_BOTTOM = 220;
const ROAD_TOP = 240;
const ROAD_BOTTOM = 320;
const FRONT_TOP = 342;
const FRONT_BOTTOM = 498;
const SIDEWALK_BOTTOM = H - 4;

const COLS = 3;
const COL_W = 250;
const ALLEY_W = 42;
const ROW_TOTAL = COLS * COL_W + (COLS - 1) * ALLEY_W;
const ROW_LEFT = Math.round((W - ROW_TOTAL) / 2);
const HQ_COL = 1;
const PARK_COL = 1;

const BUILDING_SCALE = 0.85;

interface Walker {
  sprite: Phaser.GameObjects.Sprite;
  charIdx: number;
  speed: number;
  mode: "alley" | "street";
  dir: -1 | 1;
  minX?: number; maxX?: number;
  minY?: number; maxY?: number;
}

export default class LoginScene extends Phaser.Scene {
  private weatherCode = 0;
  private showReturnBtn = false;
  private walkers: Walker[] = [];
  private rainDrops: { x: number; y: number; speed: number; len: number }[] = [];
  private snowFlakes: { x: number; y: number; speed: number; size: number; dx: number }[] = [];
  private particleG!: Phaser.GameObjects.Graphics;
  private isNight = false;
  private isEvening = false;
  private colCenters: number[] = [];

  constructor() { super({ key: "LoginScene" }); }

  init(data: { weatherCode?: number; showReturnBtn?: boolean }) {
    this.weatherCode = data.weatherCode ?? 0;
    this.showReturnBtn = data.showReturnBtn ?? false;
    this.walkers = [];
    this.rainDrops = [];
    this.snowFlakes = [];
  }

  preload() {
    for (const i of [0, 1, 2, 3]) {
      if (!this.textures.exists(`char_${i}`)) {
        this.load.spritesheet(`char_${i}`, `/assets/char_${i}.png`, { frameWidth: 16, frameHeight: 16 });
      }
    }
    const bldgs = ["hq", "house_purple", "house_yellow", "house_blue", "house_mart"];
    bldgs.forEach(key => {
      if (!this.textures.exists(`bld_${key}`)) {
        this.load.image(`bld_${key}`, `/assets/buildings/${key}.png`);
      }
    });
  }

  create() {
    this.ensureAnims();
    this.computeTimeTone();
    this.computeCols();
    this.drawSkyAndGround();
    this.placeBackRow();
    this.drawMainRoad();
    this.placeFrontRow();
    this.drawBottomSidewalk();
    this.drawStreetFurniture();
    this.drawHQSign();
    this.spawnWalkers();
    this.particleG = this.add.graphics().setDepth(80);
    this.initWeather();

    if (this.showReturnBtn) {
      this.cameras.main.fadeIn(300, 0, 0, 0);
      this.createReturnButton();
    }

    this.time.addEvent({ delay: 80, loop: true, callback: () => this.moveWalkers() });
    this.cameras.main.roundPixels = true;
  }

  private computeTimeTone() {
    const hr = new Date().getHours() + new Date().getMinutes() / 60;
    this.isNight = hr >= 20 || hr < 6;
    this.isEvening = !this.isNight && (hr >= 17 || hr < 7);
  }

  private computeCols() {
    this.colCenters = [];
    for (let i = 0; i < COLS; i++) {
      const left = ROW_LEFT + i * (COL_W + ALLEY_W);
      this.colCenters.push(left + COL_W / 2);
    }
  }

  private drawSkyAndGround() {
    const g = this.add.graphics().setDepth(0);
    const wc = this.weatherCode;
    const isRain = (wc >= 51 && wc <= 82) || wc >= 95;
    const isSnow = wc >= 71 && wc <= 77;
    let skyT: number, skyB: number;
    if (this.isNight)        { skyT = 0x050918; skyB = 0x152040; }
    else if (isRain)         { skyT = 0x3a4050; skyB = 0x5a6068; }
    else if (isSnow)         { skyT = 0x7a8090; skyB = 0xbac0cc; }
    else if (this.isEvening) { skyT = 0xe08858; skyB = 0xf5c860; }
    else                     { skyT = 0x1e60b0; skyB = 0x9cd6f8; }
    g.fillGradientStyle(skyT, skyT, skyB, skyB, 1);
    g.fillRect(0, 0, W, SKY_H);

    if (this.isNight) {
      g.fillStyle(0xffffff, 0.8);
      for (let i = 0; i < 30; i++) g.fillCircle((i * 113) % W, (i * 17) % (SKY_H - 10) + 4, 1);
    }

    // 뒷줄 풀밭
    g.fillStyle(this.isNight ? 0x0a1810 : 0x4a8a3a, 1);
    g.fillRect(0, SKY_H, W, BACK_BOTTOM - SKY_H);
    g.fillStyle(this.isNight ? 0x1a2418 : 0x5ca048, 0.45);
    for (let i = 0; i < 200; i++) {
      g.fillRect(((i * 43) % W), SKY_H + 4 + ((i * 29) % (BACK_BOTTOM - SKY_H - 6)), 2, 2);
    }

    // 앞줄 풀밭
    g.fillStyle(this.isNight ? 0x0a1810 : 0x4a8a3a, 1);
    g.fillRect(0, FRONT_TOP - 18, W, FRONT_BOTTOM - FRONT_TOP + 30);
    g.fillStyle(this.isNight ? 0x1a2418 : 0x5ca048, 0.4);
    for (let i = 0; i < 180; i++) {
      g.fillRect(((i * 47) % W), FRONT_TOP - 14 + ((i * 29) % (FRONT_BOTTOM - FRONT_TOP + 24)), 2, 2);
    }

    // 숲 실루엣
    const forestColor = this.isNight ? 0x081508 : 0x1a3818;
    g.fillStyle(forestColor, 1);
    for (let x = -10; x < W; x += 22) {
      const hh = 10 + ((x * 37) % 18);
      g.fillTriangle(x, SKY_H, x + 11, SKY_H - hh, x + 22, SKY_H);
    }
  }

  private slotCenter(col: number, row: "back" | "front"): { x: number; y: number } {
    const x = this.colCenters[col];
    const y = row === "back"
      ? (BACK_TOP + BACK_BOTTOM) / 2 + 4
      : (FRONT_TOP + FRONT_BOTTOM) / 2;
    return { x, y };
  }

  private placeBackRow() {
    for (let c = 0; c < COLS; c++) {
      const { x, y } = this.slotCenter(c, "back");
      if (c === HQ_COL) this.placeHQ(x, y);
      else this.placeBuilding(x, y, c === 0 ? "bld_house_purple" : "bld_house_mart");
    }
  }

  private placeFrontRow() {
    for (let c = 0; c < COLS; c++) {
      if (c === PARK_COL) { this.drawPark(c); continue; }
      const { x, y } = this.slotCenter(c, "front");
      this.placeBuilding(x, y, c === 0 ? "bld_house_yellow" : "bld_house_blue");
    }
  }

  private placeBuilding(x: number, y: number, key: string) {
    const img = this.add.image(x, y, key).setOrigin(0.5, 0.5).setDepth(10);
    const tex = this.textures.get(key);
    if (tex) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    img.setScale(BUILDING_SCALE);
    const g = this.add.graphics().setDepth(9);
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(x, y + (img.displayHeight / 2) - 4, img.displayWidth * 0.7, 10);
  }

  private placeHQ(x: number, y: number) {
    const img = this.add.image(x, y, "bld_hq").setOrigin(0.5, 0.5).setDepth(10);
    const tex = this.textures.get("bld_hq");
    if (tex) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    img.setScale(BUILDING_SCALE * 1.15);

    const glow = this.add.graphics().setDepth(9);
    glow.fillStyle(0xf5c842, 0.12);
    glow.fillRoundedRect(x - img.displayWidth / 2 - 8, y - img.displayHeight / 2 - 8,
      img.displayWidth + 16, img.displayHeight + 16, 12);
    const sh = this.add.graphics().setDepth(9);
    sh.fillStyle(0x000000, 0.28);
    sh.fillEllipse(x, y + img.displayHeight / 2 - 4, img.displayWidth * 0.75, 12);

    if (this.showReturnBtn) {
      const zoneW = img.displayWidth * 0.4;
      const zoneH = img.displayHeight * 0.4;
      const zoneY = y + img.displayHeight / 2 - zoneH / 2 - 4;
      const zone = this.add.zone(x, zoneY, zoneW, zoneH)
        .setDepth(20).setInteractive({ useHandCursor: true });
      let hoverGlow: Phaser.GameObjects.Graphics | null = null;
      zone.on("pointerover", () => {
        hoverGlow = this.add.graphics().setDepth(19);
        hoverGlow.fillStyle(0xf5c842, 0.35);
        hoverGlow.fillRoundedRect(x - zoneW / 2, zoneY - zoneH / 2, zoneW, zoneH, 8);
      });
      zone.on("pointerout", () => { hoverGlow?.destroy(); hoverGlow = null; });
      zone.on("pointerdown", () => this.enterOffice());
    }
  }

  private drawPark(col: number) {
    const x = this.colCenters[col];
    const yTop = FRONT_TOP;
    const yBot = FRONT_BOTTOM;
    const w = COL_W;
    const h = yBot - yTop;
    const g = this.add.graphics().setDepth(10);

    g.fillStyle(this.isNight ? 0x1a3820 : 0x3a9030, 1);
    g.fillRect(x - w / 2, yTop, w, h);
    g.fillStyle(this.isNight ? 0x204a2a : 0x5cb04c, 0.55);
    for (let i = 0; i < 90; i++) {
      g.fillRect(x - w / 2 + ((i * 17) % w), yTop + ((i * 29) % h), 2, 2);
    }
    g.lineStyle(2, this.isNight ? 0x3a2818 : 0x6a4828, 1);
    g.strokeRect(x - w / 2, yTop, w, h);
    g.fillStyle(this.isNight ? 0x3a3028 : 0x9a8858, 1);
    g.fillRect(x - 10, yTop + 2, 20, h - 4);
    g.fillRect(x - w / 2 + 2, yTop + h / 2 - 8, w - 4, 16);
    const trees = [[x - w / 2 + 32, yTop + 34], [x + w / 2 - 32, yTop + 34],
                   [x - w / 2 + 32, yBot - 34], [x + w / 2 - 32, yBot - 34]];
    trees.forEach(([tx, ty]) => {
      g.fillStyle(0x3a2818, 1); g.fillRect(tx - 2, ty + 10, 4, 10);
      g.fillStyle(this.isNight ? 0x0f2010 : 0x2a6a22, 1); g.fillCircle(tx, ty, 20);
      g.fillStyle(this.isNight ? 0x1a3018 : 0x4ab038, 0.85); g.fillCircle(tx - 5, ty - 5, 9);
    });
    [[x, yTop + 44], [x, yBot - 44]].forEach(([bx, by]) => {
      g.fillStyle(0x6a4828, 1);
      g.fillRect(bx - 20, by, 40, 5);
      g.fillRect(bx - 18, by + 5, 3, 7);
      g.fillRect(bx + 15, by + 5, 3, 7);
    });
    g.fillStyle(0x888898, 1); g.fillCircle(x, yTop + h / 2, 18);
    g.fillStyle(0x6ab8e8, 1); g.fillCircle(x, yTop + h / 2, 13);
    g.fillStyle(0xaadef8, 0.65); g.fillCircle(x - 3, yTop + h / 2 - 3, 6);

    this.add.text(x, yTop - 6, "🌳 공원", {
      fontSize: "13px", fontFamily: FONT,
      color: this.isNight ? "#dadada" : "#1a1a2e",
      fontStyle: "700", resolution: DPR * 4,
    }).setOrigin(0.5, 1).setDepth(12);
  }

  private drawHQSign() {
    const x = this.colCenters[HQ_COL];
    const y = SKY_H + 10;
    const g = this.add.graphics().setDepth(11);
    g.fillStyle(0x1a1a2e, 0.95);
    g.fillRoundedRect(x - 100, y - 22, 200, 28, 8);
    g.lineStyle(2, 0xf5c842, 1);
    g.strokeRoundedRect(x - 100, y - 22, 200, 28, 8);
    this.add.text(x, y - 8, "🏢 두근 컴퍼니", {
      fontSize: "16px", fontFamily: FONT, color: "#f5c842",
      fontStyle: "700", resolution: DPR * 4,
    }).setOrigin(0.5).setDepth(12);

    if (this.showReturnBtn) {
      this.add.text(x, BACK_BOTTOM - 4, "▼ 입구 클릭", {
        fontSize: "11px", fontFamily: FONT, color: "#f5c842",
        fontStyle: "700", resolution: DPR * 4,
        backgroundColor: "#1a1a2ecc", padding: { x: 6, y: 2 },
      }).setOrigin(0.5, 0).setDepth(15);
    }
  }

  private drawMainRoad() {
    const g = this.add.graphics().setDepth(5);
    g.fillStyle(this.isNight ? 0x1a1a24 : 0x3a3a48, 1);
    g.fillRect(0, ROAD_TOP, W, ROAD_BOTTOM - ROAD_TOP);
    g.fillStyle(0x888898, 1);
    g.fillRect(0, ROAD_TOP - 3, W, 3);
    g.fillRect(0, ROAD_BOTTOM, W, 3);
    g.fillStyle(0xffffff, this.isNight ? 0.35 : 0.6);
    const midY = (ROAD_TOP + ROAD_BOTTOM) / 2 - 2;
    for (let x = 10; x < W; x += 56) g.fillRect(x, midY, 36, 4);
    const hqX = this.colCenters[HQ_COL];
    g.fillStyle(0xffffff, this.isNight ? 0.55 : 0.85);
    for (let i = 0; i < 7; i++) g.fillRect(hqX - 36, ROAD_TOP + 4 + i * 10, 72, 5);
    g.fillStyle(this.isNight ? 0x2a2a38 : 0x6a6a78, 1);
    g.fillRect(0, BACK_BOTTOM, W, ROAD_TOP - BACK_BOTTOM - 3);
    g.fillRect(0, ROAD_BOTTOM + 3, W, FRONT_TOP - ROAD_BOTTOM - 3);
    g.lineStyle(1, 0x3a3a48, 0.4);
    for (let xx = 0; xx < W; xx += 28) {
      g.lineBetween(xx, BACK_BOTTOM, xx, ROAD_TOP - 3);
      g.lineBetween(xx, ROAD_BOTTOM + 3, xx, FRONT_TOP);
    }
  }

  private drawBottomSidewalk() {
    const g = this.add.graphics().setDepth(5);
    g.fillStyle(this.isNight ? 0x2a2a38 : 0x6a6a78, 1);
    g.fillRect(0, FRONT_BOTTOM, W, SIDEWALK_BOTTOM - FRONT_BOTTOM);
    g.lineStyle(1, 0x3a3a48, 0.4);
    for (let xx = 0; xx < W; xx += 28) g.lineBetween(xx, FRONT_BOTTOM, xx, SIDEWALK_BOTTOM);
  }

  private drawStreetFurniture() {
    const g = this.add.graphics().setDepth(15);
    const lampYs = [BACK_BOTTOM + 10, ROAD_BOTTOM + 14];
    this.colCenters.forEach(cx => {
      lampYs.forEach(ly => {
        g.fillStyle(0x666678, 1);
        g.fillRect(cx - 1, ly - 6, 2, 12);
        g.fillStyle(0x555565, 1);
        g.fillCircle(cx, ly - 6, 4);
        g.fillStyle(this.isNight ? 0xffeeaa : 0xf0d888, this.isNight ? 1 : 0.55);
        g.fillCircle(cx, ly - 6, 2.5);
        if (this.isNight) {
          g.fillStyle(0xffeeaa, 0.14);
          g.fillCircle(cx, ly - 6, 28);
        }
      });
    });
    for (let i = 0; i < COLS - 1; i++) {
      const alleyX = ROW_LEFT + i * (COL_W + ALLEY_W) + COL_W + ALLEY_W / 2;
      [BACK_BOTTOM + 12, ROAD_BOTTOM + 16].forEach(ty => {
        g.fillStyle(0x3a2818, 1); g.fillRect(alleyX - 1, ty + 2, 2, 4);
        g.fillStyle(this.isNight ? 0x0f2010 : 0x2a6a22, 1); g.fillCircle(alleyX, ty - 2, 9);
        g.fillStyle(this.isNight ? 0x1a3018 : 0x4aa838, 0.8); g.fillCircle(alleyX - 3, ty - 4, 3);
      });
    }
  }

  private spawnWalkers() {
    const S = 1.5;
    for (let i = 0; i < COLS - 1; i++) {
      const alleyX = ROW_LEFT + i * (COL_W + ALLEY_W) + COL_W + ALLEY_W / 2;
      {
        const charIdx = i % 4;
        const dir: 1 | -1 = Math.random() > 0.5 ? 1 : -1;
        const startY = BACK_TOP + 30 + Math.random() * (BACK_BOTTOM - BACK_TOP - 60);
        const sp = this.add.sprite(alleyX, startY, `char_${charIdx}`, 0)
          .setScale(S).setOrigin(0.5, 0.75).setDepth(30);
        sp.play(dir > 0 ? `char_${charIdx}_walk_down` : `char_${charIdx}_walk_up`);
        this.walkers.push({ sprite: sp, charIdx, speed: 0.35 + Math.random() * 0.25,
          mode: "alley", dir, minY: BACK_TOP + 20, maxY: BACK_BOTTOM - 10 });
      }
      {
        const charIdx = (i + 2) % 4;
        const dir: 1 | -1 = Math.random() > 0.5 ? 1 : -1;
        const startY = FRONT_TOP + 30 + Math.random() * (FRONT_BOTTOM - FRONT_TOP - 60);
        const sp = this.add.sprite(alleyX, startY, `char_${charIdx}`, 0)
          .setScale(S).setOrigin(0.5, 0.75).setDepth(30);
        sp.play(dir > 0 ? `char_${charIdx}_walk_down` : `char_${charIdx}_walk_up`);
        this.walkers.push({ sprite: sp, charIdx, speed: 0.35 + Math.random() * 0.25,
          mode: "alley", dir, minY: FRONT_TOP + 20, maxY: FRONT_BOTTOM - 10 });
      }
    }
    const streetLanes: { y: number; count: number }[] = [
      { y: BACK_BOTTOM + 12, count: 3 },
      { y: ROAD_BOTTOM + 18, count: 2 },
      { y: FRONT_BOTTOM + 14, count: 3 },
    ];
    streetLanes.forEach((lane, li) => {
      for (let i = 0; i < lane.count; i++) {
        const charIdx = (i + li) % 4;
        const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
        const startX = 40 + Math.random() * (W - 80);
        const sp = this.add.sprite(startX, lane.y, `char_${charIdx}`, 0)
          .setScale(S).setOrigin(0.5, 0.75).setDepth(30);
        sp.play(dir > 0 ? `char_${charIdx}_walk_right` : `char_${charIdx}_walk_left`);
        this.walkers.push({ sprite: sp, charIdx, speed: 0.5 + Math.random() * 0.4,
          mode: "street", dir, minX: 20, maxX: W - 20 });
      }
    });
  }

  private moveWalkers() {
    this.walkers.forEach(w => {
      if (w.mode === "alley") {
        w.sprite.y += w.speed * w.dir;
        if (w.dir > 0 && w.sprite.y >= (w.maxY ?? H)) {
          w.dir = -1; w.sprite.play(`char_${w.charIdx}_walk_up`);
        } else if (w.dir < 0 && w.sprite.y <= (w.minY ?? 0)) {
          w.dir = 1; w.sprite.play(`char_${w.charIdx}_walk_down`);
        }
      } else {
        w.sprite.x += w.speed * w.dir;
        if (w.dir > 0 && w.sprite.x >= (w.maxX ?? W)) {
          w.dir = -1; w.sprite.play(`char_${w.charIdx}_walk_left`);
        } else if (w.dir < 0 && w.sprite.x <= (w.minX ?? 0)) {
          w.dir = 1; w.sprite.play(`char_${w.charIdx}_walk_right`);
        }
      }
    });
  }

  private initWeather() {
    const wc = this.weatherCode;
    const isRain = (wc >= 51 && wc <= 82) || wc >= 95;
    const isSnow = wc >= 71 && wc <= 77;
    if (isRain) for (let i = 0; i < 45; i++) this.rainDrops.push({
      x: Math.random() * W, y: Math.random() * H, speed: 2 + Math.random() * 1.5, len: 5 + Math.random() * 4 });
    if (isSnow) for (let i = 0; i < 40; i++) this.snowFlakes.push({
      x: Math.random() * W, y: Math.random() * H, speed: 0.3 + Math.random() * 0.4,
      size: 1 + Math.random() * 1.5, dx: (Math.random() - 0.5) * 0.4 });
  }

  private createReturnButton() {
    const bw = 130, bh = 30;
    const bx = W - bw - 16, by = 16;
    const bg = this.add.graphics().setDepth(200);
    bg.fillStyle(0x1a1a2e, 0.9); bg.fillRoundedRect(bx, by, bw, bh, 6);
    bg.lineStyle(1.5, 0xf5c842, 0.8); bg.strokeRoundedRect(bx, by, bw, bh, 6);
    const btn = this.add.text(bx + bw / 2, by + bh / 2, "🏢 사무실로", {
      fontSize: "11px", fontFamily: FONT, color: "#f5c842",
      fontStyle: "700", resolution: DPR * 4,
    }).setOrigin(0.5).setDepth(201).setInteractive({ useHandCursor: true });
    btn.on("pointerdown", () => this.enterOffice());
  }

  private enterOffice() {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.stop("LoginScene");
      this.scene.resume("OfficeScene");
      const officeScene = this.scene.get("OfficeScene");
      if (officeScene) officeScene.cameras.main.fadeIn(300, 0, 0, 0);
    });
  }

  private ensureAnims() {
    for (const i of [0, 1, 2, 3]) {
      const key = `char_${i}`;
      const cols = 7;
      const anims: [string, number[]][] = [
        [`${key}_idle`,       [0]],
        [`${key}_walk_down`,  [0, 1, 0, 2]],
        [`${key}_walk_left`,  [cols, cols+1, cols, cols+2]],
        [`${key}_walk_right`, [cols*2, cols*2+1, cols*2, cols*2+2]],
        [`${key}_walk_up`,    [cols*3, cols*3+1, cols*3, cols*3+2]],
      ];
      anims.forEach(([animKey, frames]) => {
        if (this.anims.exists(animKey)) return;
        this.anims.create({ key: animKey, frames: frames.map(f => ({ key, frame: f })),
          frameRate: animKey.includes("idle") ? 1 : 6, repeat: -1 });
      });
    }
  }

  update() {
    if (!this.particleG?.active) return;
    if (this.rainDrops.length === 0 && this.snowFlakes.length === 0) return;
    this.particleG.clear();
    this.rainDrops.forEach(d => {
      this.particleG.lineStyle(1, 0x8ab8d8, 0.45);
      this.particleG.lineBetween(d.x, d.y, d.x - 1, d.y + d.len);
      d.y += d.speed; d.x -= 0.3;
      if (d.y > H) { d.y = -d.len; d.x = Math.random() * W; }
    });
    this.snowFlakes.forEach(f => {
      this.particleG.fillStyle(0xeeeeff, 0.7);
      this.particleG.fillCircle(f.x, f.y, f.size);
      f.y += f.speed; f.x += f.dx + Math.sin(f.y * 0.05) * 0.25;
      if (f.y > H) { f.y = -4; f.x = Math.random() * W; }
    });
  }
}
