import * as Phaser from "phaser";

const W = 800;
const H = 500;
const GRAVITY = 300;
const TANK_W = 20;
const TANK_H = 12;
const BARREL_LEN = 14;
const MAX_POWER = 100;
const MOVE_SPEED = 1.5;
const MOVE_FUEL = 60;
const FONT = "Pretendard Variable, sans-serif";
const TEXT_RES = 4;
const WATER_LEVEL = H - 30;

const COLORS = {
  skyTop: 0x0a0a1e,
  skyMid: 0x2a2a5e,
  skyBot: 0x4a3a6e,
  mountain1: 0x14142a,
  mountain2: 0x1e1e3a,
  terrain: 0x3a7a3a,
  terrainDark: 0x2a5a2a,
  grass: 0x6acc4a,
  soil1: 0x6b4a2a,
  soil2: 0x4a3a1a,
  rock: 0x555560,
  water: 0x3a6abf,
  waterSurf: 0x7ab8e6,
  tree: 0x2a5a1a,
  treeLit: 0x4a8a2a,
  trunk: 0x3a2a1a,
  p1: 0x4488ff,
  p2: 0xff4444,
  barrel: 0xcccccc,
  bullet: 0xffff44,
  gold: 0xf5c842,
  hpGreen: 0x50d070,
  hpRed: 0xff6b6b,
  ground: 0x2a4a2a,
  powerBar: 0xf5c842,
  powerBg: 0x333333,
  btnBg: 0x2a2a5a,
  btnHover: 0x3a3a7a,
};

const DIFFICULTY = {
  1:  { aiSpread: 40, aiHp: 60,  playerHp: 150, explosionR: 32, windMax: 30  },
  2:  { aiSpread: 35, aiHp: 70,  playerHp: 140, explosionR: 30, windMax: 40  },
  3:  { aiSpread: 28, aiHp: 80,  playerHp: 130, explosionR: 28, windMax: 50  },
  4:  { aiSpread: 22, aiHp: 90,  playerHp: 120, explosionR: 28, windMax: 55  },
  5:  { aiSpread: 16, aiHp: 100, playerHp: 110, explosionR: 26, windMax: 60  },
  6:  { aiSpread: 12, aiHp: 110, playerHp: 100, explosionR: 26, windMax: 65  },
  7:  { aiSpread: 8,  aiHp: 120, playerHp: 100, explosionR: 24, windMax: 70  },
  8:  { aiSpread: 5,  aiHp: 140, playerHp: 90,  explosionR: 22, windMax: 80  },
  9:  { aiSpread: 3,  aiHp: 160, playerHp: 80,  explosionR: 20, windMax: 90  },
  10: { aiSpread: 1,  aiHp: 200, playerHp: 70,  explosionR: 18, windMax: 100 },
} as Record<number, { aiSpread: number; aiHp: number; playerHp: number; explosionR: number; windMax: number }>;

interface Tank {
  x: number;
  y: number;
  angle: number;
  power: number;
  hp: number;
  maxHp: number;
  color: number;
  name: string;
  isAI: boolean;
  fuel: number;
  reloadFrame: number;
}

interface Tree {
  x: number;
  size: number;
  alive: boolean;
  sway: number;
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: number;
  size: number;
}

interface Star {
  x: number; y: number;
  twinkle: number;
  size: number;
}

interface Cloud {
  x: number; y: number;
  w: number; h: number;
  speed: number;
}

type GamePhase = "aiming" | "charging" | "firing" | "aiTurn" | "gameOver" | "menu";

export class FortressScene extends Phaser.Scene {
  private terrain!: number[];
  private skyGfx!: Phaser.GameObjects.Graphics;
  private waterGfx!: Phaser.GameObjects.Graphics;
  private terrainGfx!: Phaser.GameObjects.Graphics;
  private treeGfx!: Phaser.GameObjects.Graphics;
  private tankGfx!: Phaser.GameObjects.Graphics;
  private bulletGfx!: Phaser.GameObjects.Graphics;
  private powerGfx!: Phaser.GameObjects.Graphics;
  private uiGfx!: Phaser.GameObjects.Graphics;

  private tanks: Tank[] = [];
  private trees: Tree[] = [];
  private particles: Particle[] = [];
  private stars: Star[] = [];
  private clouds: Cloud[] = [];

  private currentPlayer = 0;
  private phase: GamePhase = "menu";
  private wind = 0;
  private level = 1;
  private chargePower = 0;
  private frameCount = 0;

  private bullet: { x: number; y: number; vx: number; vy: number } | null = null;
  private trail: { x: number; y: number }[] = [];
  private explosions: { x: number; y: number; r: number; frame: number }[] = [];

  private angleText!: Phaser.GameObjects.Text;
  private powerText!: Phaser.GameObjects.Text;
  private windText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private fuelText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;

  private menuGroup!: Phaser.GameObjects.Group;
  private gameGroup!: Phaser.GameObjects.Group;
  private btnExit!: Phaser.GameObjects.Text;
  private btnReset!: Phaser.GameObjects.Text;

  private keys!: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
    esc: Phaser.Input.Keyboard.Key;
  };

  private isMultiplayer = false;

  constructor() {
    super({ key: "FortressScene" });
  }

  init(data: { multiplayer?: boolean; level?: number }) {
    this.isMultiplayer = data?.multiplayer ?? false;
    this.level = data?.level ?? 0;
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.skyTop);
    this.menuGroup = this.add.group();
    this.gameGroup = this.add.group();

    this.keys = {
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      space: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      esc: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
    };

    if (this.level === 0) {
      this.showMenu();
    } else {
      this.startGame();
    }
  }

  private showMenu() {
    this.phase = "menu";
    this.gameGroup.clear(true, true);

    const title = this.add.text(W / 2, 60, "FORTRESS", {
      fontSize: "36px", fontFamily: FONT, color: "#f5c842", resolution: TEXT_RES,
    }).setOrigin(0.5);
    this.menuGroup.add(title);

    const sub = this.add.text(W / 2, 100, "난이도를 선택하세요", {
      fontSize: "14px", fontFamily: FONT, color: "#888", resolution: TEXT_RES,
    }).setOrigin(0.5);
    this.menuGroup.add(sub);

    for (let i = 1; i <= 10; i++) {
      const col = (i - 1) % 5;
      const row = Math.floor((i - 1) / 5);
      const bx = W / 2 - 200 + col * 100;
      const by = 160 + row * 70;

      const color = i <= 3 ? "#50d070" : i <= 6 ? "#f5c842" : i <= 8 ? "#ff8844" : "#ff4444";
      const label = i <= 3 ? "쉬움" : i <= 6 ? "보통" : i <= 8 ? "어려움" : "지옥";

      const btn = this.add.text(bx, by, `${i}`, {
        fontSize: "22px", fontFamily: FONT, color, resolution: TEXT_RES,
        backgroundColor: "#2a2a5a", padding: { x: 16, y: 8 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      btn.on("pointerover", () => btn.setBackgroundColor("#3a3a7a"));
      btn.on("pointerout", () => btn.setBackgroundColor("#2a2a5a"));
      btn.on("pointerup", () => {
        this.level = i;
        this.menuGroup.clear(true, true);
        this.startGame();
      });
      this.menuGroup.add(btn);

      const desc = this.add.text(bx, by + 24, label, {
        fontSize: "9px", fontFamily: FONT, color: "#888", resolution: TEXT_RES,
      }).setOrigin(0.5);
      this.menuGroup.add(desc);
    }

    const exitBtn = this.add.text(W / 2, H - 50, "← 사무실로 돌아가기", {
      fontSize: "13px", fontFamily: FONT, color: "#888", resolution: TEXT_RES,
      backgroundColor: "#1a1a2e", padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    exitBtn.on("pointerup", () => this.scene.start("OfficeScene"));
    exitBtn.on("pointerover", () => exitBtn.setColor("#f0f0f0"));
    exitBtn.on("pointerout", () => exitBtn.setColor("#888"));
    this.menuGroup.add(exitBtn);
  }

  private startGame() {
    this.phase = "aiming";
    const diff = DIFFICULTY[this.level] ?? DIFFICULTY[5];

    this.generateTerrain();
    this.generateStars();
    this.generateClouds();
    this.generateTrees();

    this.skyGfx = this.add.graphics();
    this.waterGfx = this.add.graphics();
    this.terrainGfx = this.add.graphics();
    this.treeGfx = this.add.graphics();
    this.tankGfx = this.add.graphics();
    this.bulletGfx = this.add.graphics();
    this.powerGfx = this.add.graphics();
    this.uiGfx = this.add.graphics();
    this.gameGroup.addMultiple([
      this.skyGfx, this.waterGfx, this.terrainGfx, this.treeGfx,
      this.tankGfx, this.bulletGfx, this.powerGfx, this.uiGfx,
    ]);

    const p1x = 60 + Math.floor(Math.random() * 120);
    const p2x = W - 60 - Math.floor(Math.random() * 120);

    this.tanks = [
      {
        x: p1x, y: this.terrain[p1x], angle: 60, power: 0,
        hp: diff.playerHp, maxHp: diff.playerHp,
        color: COLORS.p1, name: "P1", isAI: false, fuel: MOVE_FUEL, reloadFrame: 0,
      },
      {
        x: p2x, y: this.terrain[p2x], angle: 120, power: 0,
        hp: diff.aiHp, maxHp: diff.aiHp,
        color: COLORS.p2, name: this.isMultiplayer ? "P2" : `AI Lv.${this.level}`,
        isAI: !this.isMultiplayer, fuel: MOVE_FUEL, reloadFrame: 0,
      },
    ];

    this.currentPlayer = 0;
    this.wind = (Math.random() - 0.5) * diff.windMax;
    this.bullet = null;
    this.trail = [];
    this.explosions = [];
    this.particles = [];
    this.chargePower = 0;
    this.frameCount = 0;

    const f = { fontFamily: FONT, fontSize: "13px", color: "#f0f0f0", resolution: TEXT_RES };
    this.turnText = this.add.text(W / 2, 8, "", { ...f, fontSize: "14px", color: "#f5c842" }).setOrigin(0.5, 0);
    this.angleText = this.add.text(10, 8, "", f);
    this.powerText = this.add.text(10, 24, "", f);
    this.fuelText = this.add.text(10, 40, "", { ...f, fontSize: "11px", color: "#888" });
    this.windText = this.add.text(W / 2, 26, "", { ...f, fontSize: "11px" }).setOrigin(0.5, 0);
    this.levelText = this.add.text(W - 10, 8, `Lv.${this.level}`, { ...f, fontSize: "11px", color: "#888" }).setOrigin(1, 0);
    this.infoText = this.add.text(W / 2, H / 2 - 30, "", { ...f, fontSize: "18px", color: "#f5c842" }).setOrigin(0.5).setVisible(false);
    this.gameGroup.addMultiple([this.turnText, this.angleText, this.powerText, this.fuelText, this.windText, this.levelText, this.infoText]);

    const helpText = "↑↓ 각도 | ←→ 이동 | SPACE 꾹 = 파워충전, 떼면 발사";
    const help = this.add.text(W / 2, H - 10, helpText, { ...f, fontSize: "9px", color: "#666" }).setOrigin(0.5);
    this.gameGroup.add(help);

    this.btnExit = this.add.text(W - 10, H - 30, "나가기", {
      ...f, fontSize: "11px", color: "#888",
      backgroundColor: "#2a2a5a", padding: { x: 6, y: 3 },
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    this.btnExit.on("pointerup", () => { this.gameGroup.clear(true, true); this.showMenu(); });
    this.btnExit.on("pointerover", () => this.btnExit.setColor("#f0f0f0"));
    this.btnExit.on("pointerout", () => this.btnExit.setColor("#888"));
    this.gameGroup.add(this.btnExit);

    this.btnReset = this.add.text(W - 70, H - 30, "리셋", {
      ...f, fontSize: "11px", color: "#888",
      backgroundColor: "#2a2a5a", padding: { x: 6, y: 3 },
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    this.btnReset.on("pointerup", () => {
      this.gameGroup.clear(true, true);
      this.startGame();
    });
    this.btnReset.on("pointerover", () => this.btnReset.setColor("#f0f0f0"));
    this.btnReset.on("pointerout", () => this.btnReset.setColor("#888"));
    this.gameGroup.add(this.btnReset);

    this.drawSky();
    this.drawWater();
    this.drawTerrain();
    this.drawTrees();
    this.drawTanks();
    this.drawUI();
  }

  private generateTerrain() {
    this.terrain = new Array(W);
    const baseY = H * 0.6;
    const amp1 = 60 + Math.random() * 40;
    const freq1 = 0.005 + Math.random() * 0.005;
    const amp2 = 20 + Math.random() * 20;
    const freq2 = 0.02 + Math.random() * 0.01;
    const ph1 = Math.random() * Math.PI * 2;
    const ph2 = Math.random() * Math.PI * 2;

    for (let x = 0; x < W; x++) {
      this.terrain[x] = Math.floor(
        baseY + Math.sin(x * freq1 + ph1) * amp1 + Math.sin(x * freq2 + ph2) * amp2
      );
    }
  }

  private generateStars() {
    this.stars = [];
    for (let i = 0; i < 60; i++) {
      this.stars.push({
        x: Math.random() * W,
        y: Math.random() * (H * 0.4),
        twinkle: Math.random() * Math.PI * 2,
        size: Math.random() < 0.2 ? 2 : 1,
      });
    }
  }

  private generateClouds() {
    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      this.clouds.push({
        x: Math.random() * W,
        y: 30 + Math.random() * 80,
        w: 60 + Math.random() * 60,
        h: 12 + Math.random() * 8,
        speed: 0.08 + Math.random() * 0.1,
      });
    }
  }

  private generateTrees() {
    this.trees = [];
    const placed: number[] = [];
    for (let i = 0; i < 20; i++) {
      const x = 40 + Math.random() * (W - 80);
      const tooClose = placed.some((px) => Math.abs(px - x) < 25);
      if (tooClose) continue;
      placed.push(x);
      this.trees.push({
        x,
        size: 0.8 + Math.random() * 0.6,
        alive: true,
        sway: Math.random() * Math.PI * 2,
      });
    }
  }

  private drawSky() {
    const g = this.skyGfx;
    g.clear();
    const bandH = H / 60;
    for (let i = 0; i < 60; i++) {
      const t = i / 60;
      const r = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.IntegerToColor(COLORS.skyTop),
        Phaser.Display.Color.IntegerToColor(COLORS.skyBot),
        60,
        i,
      );
      const c = Phaser.Display.Color.GetColor(r.r, r.g, r.b);
      g.fillStyle(c, 1);
      g.fillRect(0, i * bandH, W, bandH + 1);
    }

    for (const s of this.stars) {
      const a = 0.4 + 0.6 * Math.abs(Math.sin(s.twinkle + this.frameCount * 0.03));
      g.fillStyle(0xffffff, a);
      g.fillRect(s.x, s.y, s.size, s.size);
    }

    for (const c of this.clouds) {
      g.fillStyle(0x2a2a4e, 0.7);
      g.fillEllipse(c.x, c.y, c.w, c.h);
      g.fillEllipse(c.x - c.w * 0.25, c.y + c.h * 0.2, c.w * 0.6, c.h * 0.7);
      g.fillEllipse(c.x + c.w * 0.25, c.y + c.h * 0.2, c.w * 0.6, c.h * 0.7);
    }

    g.fillStyle(COLORS.mountain1, 1);
    g.beginPath();
    g.moveTo(0, H * 0.55);
    const m1Seed = 0.7;
    for (let x = 0; x <= W; x += 20) {
      const y = H * 0.55 - Math.abs(Math.sin(x * 0.008 + m1Seed)) * 80 - Math.sin(x * 0.02) * 15;
      g.lineTo(x, y);
    }
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.closePath();
    g.fillPath();

    g.fillStyle(COLORS.mountain2, 1);
    g.beginPath();
    g.moveTo(0, H * 0.62);
    for (let x = 0; x <= W; x += 15) {
      const y = H * 0.62 - Math.abs(Math.sin(x * 0.012 + 2.1)) * 55 - Math.sin(x * 0.03) * 10;
      g.lineTo(x, y);
    }
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.closePath();
    g.fillPath();
  }

  private drawWater() {
    const g = this.waterGfx;
    g.clear();

    for (let x = 0; x < W; x++) {
      const ty = this.terrain[x];
      if (ty > WATER_LEVEL) {
        g.fillStyle(COLORS.water, 0.75);
        g.fillRect(x, WATER_LEVEL, 1, ty - WATER_LEVEL);

        const waveY = WATER_LEVEL + Math.sin(x * 0.08 + this.frameCount * 0.04) * 1.5;
        g.fillStyle(COLORS.waterSurf, 0.6);
        g.fillRect(x, waveY, 1, 2);

        if ((x + this.frameCount) % 50 === 0) {
          g.fillStyle(0xffffff, 0.5);
          g.fillRect(x, waveY, 3, 1);
        }
      }
    }
  }

  private drawTerrain() {
    const g = this.terrainGfx;
    g.clear();
    for (let x = 0; x < W; x++) {
      const ty = this.terrain[x];
      if (ty > WATER_LEVEL) continue;

      g.fillStyle(COLORS.terrain, 1);
      g.fillRect(x, ty, 1, Math.min(6, H - ty));

      g.fillStyle(COLORS.terrainDark, 1);
      g.fillRect(x, ty + 6, 1, 4);

      g.fillStyle(COLORS.soil1, 1);
      g.fillRect(x, ty + 10, 1, 12);

      g.fillStyle(COLORS.soil2, 1);
      if (ty + 22 < H) g.fillRect(x, ty + 22, 1, H - ty - 22);

      if (x % 3 === 0) {
        const bladeH = 1 + (x % 5 === 0 ? 2 : 1);
        g.fillStyle(COLORS.grass, 0.9);
        g.fillRect(x, ty - bladeH, 1, bladeH);
      }
    }

    for (let i = 0; i < 40; i++) {
      const rx = (i * 137) % W;
      const ry = this.terrain[rx] + 14 + (i * 7) % 20;
      if (ry > H - 2) continue;
      g.fillStyle(COLORS.rock, 0.7);
      g.fillRect(rx, ry, 3, 2);
      g.fillStyle(0x333340, 0.8);
      g.fillRect(rx + 3, ry + 1, 1, 1);
    }
  }

  private drawTrees() {
    const g = this.treeGfx;
    g.clear();
    for (const t of this.trees) {
      if (!t.alive) continue;
      const ix = Math.floor(t.x);
      if (ix < 0 || ix >= W) continue;
      const gy = this.terrain[ix];
      if (gy > WATER_LEVEL) continue;

      const sway = Math.sin(t.sway + this.frameCount * 0.02) * 1.5;
      const trunkH = 10 * t.size;
      const trunkW = 3 * t.size;
      const leafR = 8 * t.size;

      g.fillStyle(COLORS.trunk, 1);
      g.fillRect(t.x - trunkW / 2, gy - trunkH, trunkW, trunkH);

      g.fillStyle(COLORS.tree, 1);
      g.fillCircle(t.x + sway, gy - trunkH - leafR * 0.3, leafR);
      g.fillCircle(t.x + sway - leafR * 0.5, gy - trunkH, leafR * 0.8);
      g.fillCircle(t.x + sway + leafR * 0.5, gy - trunkH, leafR * 0.8);

      g.fillStyle(COLORS.treeLit, 0.7);
      g.fillCircle(t.x + sway - 2, gy - trunkH - leafR * 0.5, leafR * 0.5);
    }
  }

  private drawTanks() {
    const g = this.tankGfx;
    g.clear();

    for (const t of this.tanks) {
      if (t.hp <= 0) continue;

      for (let wx = -TANK_W / 2; wx <= TANK_W / 2; wx += 4) {
        g.fillStyle(0x222228, 1);
        g.fillRect(t.x + wx - 1, t.y - 4, 3, 4);
      }
      g.fillStyle(0x111115, 1);
      g.fillRect(t.x - TANK_W / 2, t.y - 5, TANK_W, 1);

      g.fillStyle(t.color, 1);
      g.fillRect(t.x - TANK_W / 2, t.y - TANK_H, TANK_W, TANK_H - 4);
      const lighter = Phaser.Display.Color.IntegerToColor(t.color).brighten(15).color;
      g.fillStyle(lighter, 1);
      g.fillRect(t.x - TANK_W / 2, t.y - TANK_H, TANK_W, 2);

      g.fillStyle(t.color, 1);
      g.fillRect(t.x - 6, t.y - TANK_H - 4, 12, 4);
      g.fillStyle(lighter, 1);
      g.fillRect(t.x - 6, t.y - TANK_H - 4, 12, 1);

      g.fillStyle(0x111115, 1);
      g.fillRect(t.x - 2, t.y - TANK_H - 2, 4, 2);

      g.lineStyle(1, 0x888888, 1);
      g.beginPath();
      g.moveTo(t.x + 5, t.y - TANK_H - 4);
      g.lineTo(t.x + 6, t.y - TANK_H - 9);
      g.strokePath();
      g.fillStyle(0xff4444, 1);
      g.fillRect(t.x + 5, t.y - TANK_H - 10, 2, 2);

      const rad = Phaser.Math.DegToRad(t.angle);
      const reloadOffset = t.reloadFrame > 0 ? (1 - t.reloadFrame / 10) * -2 : 0;
      const bStart = BARREL_LEN * 0.15 + reloadOffset;
      const bEnd = BARREL_LEN + reloadOffset;
      const bsx = t.x + Math.cos(rad) * bStart;
      const bsy = t.y - TANK_H / 2 - Math.sin(rad) * bStart;
      const bex = t.x + Math.cos(rad) * bEnd;
      const bey = t.y - TANK_H / 2 - Math.sin(rad) * bEnd;
      g.lineStyle(4, 0x222222, 1);
      g.beginPath();
      g.moveTo(bsx, bsy);
      g.lineTo(bex, bey);
      g.strokePath();
      g.lineStyle(2, COLORS.barrel, 1);
      g.beginPath();
      g.moveTo(bsx, bsy);
      g.lineTo(bex, bey);
      g.strokePath();

      if (t.reloadFrame > 0) t.reloadFrame--;

      const hpW = 30;
      const hpH = 4;
      const hpX = t.x - hpW / 2;
      const hpY = t.y - TANK_H - 16;
      const hpRatio = t.hp / t.maxHp;
      g.fillStyle(0x000000, 0.6);
      g.fillRect(hpX - 1, hpY - 1, hpW + 2, hpH + 2);
      g.fillStyle(0x333333, 1);
      g.fillRect(hpX, hpY, hpW, hpH);
      g.fillStyle(hpRatio > 0.3 ? COLORS.hpGreen : COLORS.hpRed, 1);
      g.fillRect(hpX, hpY, hpW * hpRatio, hpH);
    }
  }

  private drawPowerBar() {
    const g = this.powerGfx;
    g.clear();
    if (this.phase !== "charging") return;

    const t = this.tanks[this.currentPlayer];
    const barW = 40;
    const barH = 6;
    const bx = t.x - barW / 2;
    const by = t.y - TANK_H - 24;
    const ratio = this.chargePower / MAX_POWER;

    g.fillStyle(COLORS.powerBg, 1);
    g.fillRect(bx, by, barW, barH);
    const c = ratio < 0.5 ? COLORS.powerBar : ratio < 0.8 ? 0xff8844 : COLORS.hpRed;
    g.fillStyle(c, 1);
    g.fillRect(bx, by, barW * ratio, barH);
    g.lineStyle(1, 0x666666, 1);
    g.strokeRect(bx, by, barW, barH);
  }

  private drawUI() {
    const t = this.tanks[this.currentPlayer];
    this.turnText.setText(`${t.name}의 턴`);
    this.angleText.setText(`각도: ${t.angle}°`);
    this.powerText.setText(this.phase === "charging" ? `파워: ${Math.floor(this.chargePower)}%` : "SPACE 꾹 눌러서 충전");
    this.fuelText.setText(`이동: ${Math.floor(t.fuel)}`);

    const windDir = this.wind > 0 ? "→" : "←";
    const windStr = Math.abs(this.wind).toFixed(0);
    this.windText.setText(`바람 ${windDir} ${windStr}`);
  }

  private drawIndicators() {
    const g = this.uiGfx;
    g.clear();

    const t = this.tanks[this.currentPlayer];
    if (!t || t.hp <= 0) return;

    if (this.phase === "aiming" || this.phase === "charging") {
      const rad = Phaser.Math.DegToRad(t.angle);
      const arcR = 28;
      const cx = t.x;
      const cy = t.y - TANK_H / 2;

      g.lineStyle(2, 0xf5c842, 0.35);
      g.beginPath();
      g.arc(cx, cy, arcR, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false);
      g.strokePath();

      for (let a = 0; a <= 180; a += 15) {
        const ar = Phaser.Math.DegToRad(a + 180);
        const x1 = cx + Math.cos(ar) * (arcR - 2);
        const y1 = cy + Math.sin(ar) * (arcR - 2);
        const x2 = cx + Math.cos(ar) * (arcR + 2);
        const y2 = cy + Math.sin(ar) * (arcR + 2);
        g.lineStyle(1, 0xf5c842, 0.5);
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.strokePath();
      }

      const aimLen = 40;
      const ax = cx + Math.cos(rad) * aimLen;
      const ay = cy - Math.sin(rad) * aimLen;
      g.lineStyle(2, 0xf5c842, 0.9);
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(ax, ay);
      g.strokePath();
      g.fillStyle(0xf5c842, 1);
      g.fillCircle(ax, ay, 3);
    }

    const arrowX = W / 2;
    const arrowY = 50;
    const windAbs = Math.abs(this.wind);
    const windLen = Math.min(60, windAbs * 0.8);
    const dir = this.wind >= 0 ? 1 : -1;
    const windColor = windAbs < 30 ? 0x50d070 : windAbs < 60 ? 0xf5c842 : 0xff6b6b;

    g.fillStyle(0x000000, 0.4);
    g.fillRect(arrowX - 40, arrowY - 8, 80, 16);

    g.lineStyle(3, windColor, 1);
    g.beginPath();
    g.moveTo(arrowX - (windLen / 2) * dir, arrowY);
    g.lineTo(arrowX + (windLen / 2) * dir, arrowY);
    g.strokePath();

    const tipX = arrowX + (windLen / 2) * dir;
    g.fillStyle(windColor, 1);
    g.beginPath();
    g.moveTo(tipX, arrowY);
    g.lineTo(tipX - 6 * dir, arrowY - 4);
    g.lineTo(tipX - 6 * dir, arrowY + 4);
    g.closePath();
    g.fillPath();

    for (let i = 0; i < 3; i++) {
      const px = arrowX + (-20 + (this.frameCount + i * 15) % 40) * dir;
      g.fillStyle(windColor, 0.4);
      g.fillRect(px, arrowY - 6 + i * 4, 2, 1);
    }
  }

  update(_time: number, delta: number) {
    this.frameCount++;
    if (this.phase === "menu") return;

    if (Phaser.Input.Keyboard.JustDown(this.keys.esc)) {
      this.gameGroup.clear(true, true);
      this.showMenu();
      return;
    }

    if (this.phase === "aiming") {
      this.handleAiming();
      if (this.keys.space.isDown) {
        this.phase = "charging";
        this.chargePower = 0;
      }
    } else if (this.phase === "charging") {
      this.handleCharging(delta);
    } else if (this.phase === "firing") {
      this.updateBullet(delta / 1000);
    } else if (this.phase === "aiTurn") {
      // wait
    } else if (this.phase === "gameOver") {
      if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
        this.gameGroup.clear(true, true);
        this.startGame();
      }
    }

    for (const c of this.clouds) {
      c.x += c.speed;
      if (c.x > W + c.w) c.x = -c.w;
    }

    this.updateExplosions();
    this.updateParticles(delta / 1000);

    if (this.frameCount % 2 === 0) this.drawSky();
    this.drawWater();
    this.drawTrees();
    this.drawTanks();
    this.drawPowerBar();
    this.drawIndicators();
  }

  private handleAiming() {
    const t = this.tanks[this.currentPlayer];

    if (this.keys.up.isDown) {
      t.angle = Math.min(175, t.angle + 1);
    }
    if (this.keys.down.isDown) {
      t.angle = Math.max(5, t.angle - 1);
    }

    if (this.keys.left.isDown && t.fuel > 0) {
      const nx = Math.max(10, t.x - MOVE_SPEED);
      t.fuel -= MOVE_SPEED * 0.5;
      t.x = nx;
      const ix = Math.floor(nx);
      if (ix >= 0 && ix < W) t.y = this.terrain[ix];
    }
    if (this.keys.right.isDown && t.fuel > 0) {
      const nx = Math.min(W - 10, t.x + MOVE_SPEED);
      t.fuel -= MOVE_SPEED * 0.5;
      t.x = nx;
      const ix = Math.floor(nx);
      if (ix >= 0 && ix < W) t.y = this.terrain[ix];
    }

    this.drawUI();
  }

  private handleCharging(delta: number) {
    this.chargePower = Math.min(MAX_POWER, this.chargePower + delta * 0.08);
    this.drawUI();

    if (!this.keys.space.isDown) {
      const t = this.tanks[this.currentPlayer];
      t.power = Math.floor(this.chargePower);
      this.powerGfx.clear();
      this.fire(t);
    }
  }

  private fire(t: Tank) {
    const speed = Math.max(t.power, 10) * 4;
    const rad = Phaser.Math.DegToRad(t.angle);
    this.bullet = {
      x: t.x + Math.cos(rad) * (BARREL_LEN + 2),
      y: t.y - TANK_H / 2 - Math.sin(rad) * (BARREL_LEN + 2),
      vx: Math.cos(rad) * speed,
      vy: -Math.sin(rad) * speed,
    };
    this.trail = [];
    this.phase = "firing";
    t.reloadFrame = 10;

    for (let i = 0; i < 8; i++) {
      const sa = rad + (Math.random() - 0.5) * 0.6;
      const ss = 60 + Math.random() * 60;
      this.particles.push({
        x: this.bullet.x,
        y: this.bullet.y,
        vx: Math.cos(sa) * ss,
        vy: -Math.sin(sa) * ss,
        life: 0.25,
        maxLife: 0.25,
        color: 0xffaa33,
        size: 2,
      });
    }
  }

  private updateBullet(dt: number) {
    if (!this.bullet) return;

    const b = this.bullet;
    b.vx += this.wind * dt;
    b.vy += GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    this.trail.push({ x: b.x, y: b.y });
    if (this.trail.length > 60) this.trail.shift();

    const bg = this.bulletGfx;
    bg.clear();

    for (let i = 0; i < this.trail.length; i++) {
      const alpha = (i / this.trail.length) * 0.5;
      bg.fillStyle(COLORS.bullet, alpha);
      bg.fillCircle(this.trail[i].x, this.trail[i].y, 1.5);
    }
    bg.fillStyle(COLORS.bullet, 1);
    bg.fillCircle(b.x, b.y, 3);
    bg.fillStyle(0xffffff, 0.8);
    bg.fillCircle(b.x, b.y, 1.5);

    if (b.x < -50 || b.x > W + 50 || b.y > H + 50) {
      this.endTurn();
      return;
    }

    const ix = Math.floor(b.x);
    if (ix >= 0 && ix < W && b.y >= this.terrain[ix]) {
      this.explode(ix, Math.floor(b.y));
      return;
    }

    for (let i = 0; i < this.tanks.length; i++) {
      if (i === this.currentPlayer) continue;
      const enemy = this.tanks[i];
      if (enemy.hp <= 0) continue;
      const dx = b.x - enemy.x;
      const dy = b.y - (enemy.y - TANK_H / 2);
      if (Math.abs(dx) < TANK_W / 2 + 3 && Math.abs(dy) < TANK_H / 2 + 3) {
        this.explode(Math.floor(b.x), Math.floor(b.y));
        return;
      }
    }
  }

  private explode(cx: number, cy: number) {
    this.bullet = null;
    this.bulletGfx.clear();
    const diff = DIFFICULTY[this.level] ?? DIFFICULTY[5];
    const r = diff.explosionR;

    this.explosions.push({ x: cx, y: cy, r: 0, frame: 0 });

    this.cameras.main.shake(180, 0.008);

    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 50 + Math.random() * 150;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 60,
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
        color: Math.random() < 0.5 ? 0xffaa33 : 0xff4422,
        size: 2 + Math.random() * 2,
      });
    }
    for (let i = 0; i < 15; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 100;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 80,
        life: 0.8 + Math.random() * 0.6,
        maxLife: 1.4,
        color: 0x5a3a1a,
        size: 2,
      });
    }

    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (dx * dx + dy * dy > r * r) continue;
        const tx = cx + dx;
        if (tx >= 0 && tx < W) {
          const ty = cy + dy;
          if (ty >= this.terrain[tx]) {
            this.terrain[tx] = Math.max(this.terrain[tx], ty + 1);
          }
        }
      }
    }

    for (const tree of this.trees) {
      if (!tree.alive) continue;
      const d = Phaser.Math.Distance.Between(cx, cy, tree.x, this.terrain[Math.floor(tree.x)] - 10);
      if (d < r + 8) {
        tree.alive = false;
        for (let i = 0; i < 6; i++) {
          this.particles.push({
            x: tree.x,
            y: this.terrain[Math.floor(tree.x)] - 10,
            vx: (Math.random() - 0.5) * 80,
            vy: -50 - Math.random() * 40,
            life: 0.7,
            maxLife: 0.7,
            color: COLORS.tree,
            size: 3,
          });
        }
      }
    }

    for (const t of this.tanks) {
      const dist = Phaser.Math.Distance.Between(cx, cy, t.x, t.y - TANK_H / 2);
      if (dist < r + 10) {
        const dmg = Math.floor(Math.max(0, (1 - dist / (r + 10)) * 50));
        t.hp = Math.max(0, t.hp - dmg);
      }
    }

    for (const t of this.tanks) {
      if (t.hp > 0) {
        const tx = Math.floor(t.x);
        if (tx >= 0 && tx < W) t.y = this.terrain[tx];
      }
    }

    this.drawTerrain();

    const dead = this.tanks.find((t) => t.hp <= 0);
    if (dead) {
      this.phase = "gameOver";
      const winner = this.tanks.find((t) => t.hp > 0);
      const isWin = winner && !winner.isAI;
      const msg = isWin
        ? `🏆 승리! [SPACE] 재시작`
        : `💀 패배... [SPACE] 재시작`;
      this.infoText.setText(msg).setVisible(true);
      return;
    }

    this.time.delayedCall(400, () => this.endTurn());
  }

  private endTurn() {
    this.bullet = null;
    this.bulletGfx.clear();
    this.trail = [];
    const diff = DIFFICULTY[this.level] ?? DIFFICULTY[5];
    this.wind += (Math.random() - 0.5) * 30;
    this.wind = Phaser.Math.Clamp(this.wind, -diff.windMax, diff.windMax);
    this.currentPlayer = (this.currentPlayer + 1) % this.tanks.length;

    const next = this.tanks[this.currentPlayer];
    next.fuel = MOVE_FUEL;

    if (next.isAI && next.hp > 0) {
      this.phase = "aiTurn";
      this.drawUI();
      this.time.delayedCall(600, () => {
        if (this.phase === "aiTurn") this.doAITurn();
      });
    } else {
      this.phase = "aiming";
      this.chargePower = 0;
      this.drawUI();
    }
  }

  private doAITurn() {
    const ai = this.tanks[this.currentPlayer];
    const target = this.tanks.find((t, i) => i !== this.currentPlayer && t.hp > 0);
    if (!target) return;
    const diff = DIFFICULTY[this.level] ?? DIFFICULTY[5];

    let bestAngle = 45;
    let bestPower = 50;
    let bestDist = Infinity;

    for (let angle = 20; angle <= 160; angle += 3) {
      for (let power = 15; power <= 100; power += 3) {
        const speed = power * 4;
        const rad = Phaser.Math.DegToRad(angle);
        let bx = ai.x + Math.cos(rad) * BARREL_LEN;
        let by = ai.y - TANK_H / 2 - Math.sin(rad) * BARREL_LEN;
        let vx = Math.cos(rad) * speed;
        let vy = -Math.sin(rad) * speed;

        for (let step = 0; step < 400; step++) {
          const dt = 0.016;
          vx += this.wind * dt;
          vy += GRAVITY * dt;
          bx += vx * dt;
          by += vy * dt;

          if (bx < 0 || bx >= W || by > H + 50) break;

          const ix = Math.floor(bx);
          if (ix >= 0 && ix < W && by >= this.terrain[ix]) {
            const d = Phaser.Math.Distance.Between(bx, by, target.x, target.y);
            if (d < bestDist) {
              bestDist = d;
              bestAngle = angle;
              bestPower = power;
            }
            break;
          }
        }
      }
    }

    const spread = diff.aiSpread;
    ai.angle = bestAngle + Math.floor((Math.random() - 0.5) * spread);
    ai.angle = Phaser.Math.Clamp(ai.angle, 5, 175);
    ai.power = bestPower + Math.floor((Math.random() - 0.5) * spread * 0.5);
    ai.power = Phaser.Math.Clamp(ai.power, 10, 100);

    this.drawUI();
    this.fire(ai);
  }

  private updateExplosions() {
    const g = this.bulletGfx;
    const diff = DIFFICULTY[this.level] ?? DIFFICULTY[5];
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.frame++;
      e.r = Math.min(diff.explosionR, e.frame * 3);

      if (e.frame < 20) {
        const alpha = 1 - e.frame / 20;
        g.fillStyle(0x440000, alpha * 0.3);
        g.fillCircle(e.x, e.y, e.r * 1.4);
        g.fillStyle(0xff4422, alpha * 0.5);
        g.fillCircle(e.x, e.y, e.r);
        g.fillStyle(0xff8800, alpha * 0.7);
        g.fillCircle(e.x, e.y, e.r * 0.7);
        g.fillStyle(0xffcc00, alpha * 0.9);
        g.fillCircle(e.x, e.y, e.r * 0.4);
        g.fillStyle(0xffffff, alpha);
        g.fillCircle(e.x, e.y, e.r * 0.2);
      } else {
        this.explosions.splice(i, 1);
      }
    }
  }

  private updateParticles(dt: number) {
    const g = this.bulletGfx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 200 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const a = p.life / p.maxLife;
      g.fillStyle(p.color, a);
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }
}
