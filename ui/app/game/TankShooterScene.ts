/**
 * TankShooterScene — 8bit 탱크 슈팅 미니게임
 *
 * 플레이: 좌측 하단 탱크에서 각도/파워 조절 후 포탄 발사 → 우측 블록 파괴
 * 입력: ← → (각도 ±2), ↑ ↓ (파워 ±2), SPACE (발사), ESC (종료)
 *       모바일: 화면 좌측 터치=각도, 우측 터치=파워, 발사 버튼
 * 종료: ESC 또는 🚪 버튼 → OfficeScene resume
 */

import * as Phaser from "phaser";

const FONT = "'Pretendard Variable', Pretendard, -apple-system, sans-serif";
const TEXT_RES = 8;

const W = 832;
const H = 576;
const GROUND_H = 50;
const GROUND_Y = H - GROUND_H;

const COLOR_BG = 0x1a1a2e;
const COLOR_GRID = 0x2a2a5a;
const COLOR_GROUND = 0x3a3a5a;
const COLOR_PLAYER = 0x50d070;
const COLOR_ENEMY = 0xf87171;
const COLOR_BULLET = 0xf5c842;

interface BlockSprite extends Phaser.GameObjects.Image {
  destroyed?: boolean;
}

export default class TankShooterScene extends Phaser.Scene {
  private tank!: Phaser.GameObjects.Image;
  private barrel!: Phaser.GameObjects.Graphics;
  private bullets: Phaser.GameObjects.Image[] = [];
  private blocks: BlockSprite[] = [];
  private angle = 45; // degrees (0=우측, 90=위)
  private power = 60; // 20-100
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private angleText!: Phaser.GameObjects.Text;
  private powerText!: Phaser.GameObjects.Text;
  private winText?: Phaser.GameObjects.Text;
  private retryBtn?: Phaser.GameObjects.Text;
  private tankX = 80;
  private tankY = GROUND_Y - 14;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey?: Phaser.Input.Keyboard.Key;
  private escKey?: Phaser.Input.Keyboard.Key;
  private gameOver = false;

  constructor() {
    super({ key: "TankShooterScene" });
  }

  create() {
    this.gameOver = false;
    this.bullets = [];
    this.blocks = [];
    this.score = 0;
    this.angle = 45;
    this.power = 60;

    // 배경
    this.cameras.main.setBackgroundColor(COLOR_BG);

    // 그리드
    const grid = this.add.graphics();
    grid.lineStyle(1, COLOR_GRID, 1);
    for (let x = 0; x <= W; x += 50) {
      grid.lineBetween(x, 0, x, H);
    }
    for (let y = 0; y <= H; y += 50) {
      grid.lineBetween(0, y, W, y);
    }

    // 바닥
    const ground = this.add.graphics();
    ground.fillStyle(COLOR_GROUND, 1);
    ground.fillRect(0, GROUND_Y, W, GROUND_H);
    ground.fillStyle(0x4a4a6a, 1);
    ground.fillRect(0, GROUND_Y, W, 2);

    // 플레이어 탱크 (IRONBALL + 초록 tint)
    this.tank = this.add.image(this.tankX, this.tankY, "tank_body")
      .setDisplaySize(40, 32)
      .setTint(COLOR_PLAYER)
      .setDepth(10);

    // 포신 (그래픽, 각도 표시용)
    this.barrel = this.add.graphics().setDepth(11);
    this.redrawBarrel();

    // 블록 (우측 바닥 위에 5-7개 쌓기)
    this.spawnBlocks();

    // UI
    this.scoreText = this.add.text(W - 12, 12, "SCORE: 0", {
      fontSize: "16px", fontFamily: FONT,
      color: "#f5c842", resolution: TEXT_RES,
    }).setOrigin(1, 0).setDepth(100);

    this.angleText = this.add.text(12, H - 30, "", {
      fontSize: "13px", fontFamily: FONT,
      color: "#50d070", resolution: TEXT_RES,
    }).setOrigin(0, 0).setDepth(100);

    this.powerText = this.add.text(12, H - 14, "", {
      fontSize: "13px", fontFamily: FONT,
      color: "#f5c842", resolution: TEXT_RES,
    }).setOrigin(0, 0).setDepth(100);
    this.updateHud();

    // 종료 버튼
    const exitBtn = this.add.text(12, 12, "🚪 돌아가기", {
      fontSize: "14px", fontFamily: FONT,
      color: "#ffffff", resolution: TEXT_RES,
      backgroundColor: "#2a2a5a",
      padding: { left: 8, right: 8, top: 4, bottom: 4 },
    }).setOrigin(0, 0).setDepth(100).setInteractive({ useHandCursor: true });
    exitBtn.on("pointerdown", () => this.exitScene());

    // 안내
    this.add.text(W / 2, 12,
      "← → 각도   ↑ ↓ 파워   SPACE 발사   ESC 종료",
      {
        fontSize: "11px", fontFamily: FONT,
        color: "#888", resolution: TEXT_RES,
      }
    ).setOrigin(0.5, 0).setDepth(100);

    // 발사 버튼 (모바일/클릭)
    const fireBtn = this.add.text(W - 12, H - 20, "🔥 FIRE", {
      fontSize: "18px", fontFamily: FONT,
      color: "#ffffff", resolution: TEXT_RES,
      backgroundColor: "#b91c1c",
      padding: { left: 12, right: 12, top: 6, bottom: 6 },
    }).setOrigin(1, 1).setDepth(100).setInteractive({ useHandCursor: true });
    fireBtn.on("pointerdown", () => this.fire());

    // 키보드
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.spaceKey?.on("down", () => this.fire());
    this.escKey?.on("down", () => this.exitScene());

    // 모바일 터치 영역 — 좌측 절반: 각도, 우측 절반: 파워
    const leftTouch = this.add.zone(0, 80, W / 2, H - 160).setOrigin(0, 0).setInteractive();
    leftTouch.on("pointerdown", (p: Phaser.Input.Pointer) => {
      // y 낮을수록 각도 높음 (0~90)
      const rel = Phaser.Math.Clamp((H - 80 - p.y) / (H - 240), 0, 1);
      this.angle = Math.round(rel * 90);
      this.redrawBarrel();
      this.updateHud();
    });
    const rightTouch = this.add.zone(W / 2, 80, W / 2, H - 160).setOrigin(0, 0).setInteractive();
    rightTouch.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const rel = Phaser.Math.Clamp((H - 80 - p.y) / (H - 240), 0, 1);
      this.power = Math.round(20 + rel * 80);
      this.updateHud();
    });
  }

  private spawnBlocks() {
    const count = 6;
    const baseX = W - 150;
    // 바닥 지지대 (block_base 2x1)
    const baseImg = this.add.image(baseX, GROUND_Y - 16, "block_base")
      .setOrigin(0.5, 1).setDepth(5);
    baseImg.setDisplaySize(96, 32);

    // 5-7개 블록 쌓기 (피라미드 형태)
    const positions: Array<{ x: number; y: number; key: string }> = [
      { x: baseX - 24, y: GROUND_Y - 16, key: "block_a" },
      { x: baseX,      y: GROUND_Y - 16, key: "block_b" },
      { x: baseX + 24, y: GROUND_Y - 16, key: "block_a" },
      { x: baseX - 12, y: GROUND_Y - 40, key: "block_b" },
      { x: baseX + 12, y: GROUND_Y - 40, key: "block_a" },
      { x: baseX,      y: GROUND_Y - 64, key: "block_b" },
    ];
    // 제한: 5-7개 범위 지킴 (현재 6)
    for (let i = 0; i < count && i < positions.length; i++) {
      const p = positions[i];
      const img = this.add.image(p.x, p.y, p.key)
        .setOrigin(0.5, 1).setDepth(6) as BlockSprite;
      img.setDisplaySize(24, 24);
      img.setTint(COLOR_ENEMY);
      img.destroyed = false;
      this.blocks.push(img);
    }
  }

  private redrawBarrel() {
    this.barrel.clear();
    this.barrel.lineStyle(4, COLOR_PLAYER, 1);
    const rad = Phaser.Math.DegToRad(this.angle);
    const len = 26;
    const sx = this.tankX;
    const sy = this.tankY - 10;
    const ex = sx + Math.cos(rad) * len;
    const ey = sy - Math.sin(rad) * len;
    this.barrel.lineBetween(sx, sy, ex, ey);
    // 조준 가이드 (점선 미리보기)
    this.barrel.lineStyle(1, COLOR_BULLET, 0.4);
    const gx = sx + Math.cos(rad) * (len + 40);
    const gy = sy - Math.sin(rad) * (len + 40);
    this.barrel.lineBetween(ex, ey, gx, gy);
  }

  private updateHud() {
    this.angleText.setText(`각도: ${this.angle}°  (← →)`);
    this.powerText.setText(`파워: ${this.power}  (↑ ↓)`);
  }

  private fire() {
    if (this.gameOver) return;
    const rad = Phaser.Math.DegToRad(this.angle);
    const speed = this.power * 7; // 스케일링
    const vx = Math.cos(rad) * speed;
    const vy = -Math.sin(rad) * speed;
    const sx = this.tankX + Math.cos(rad) * 28;
    const sy = this.tankY - 10 - Math.sin(rad) * 28;
    const b = this.add.image(sx, sy, "bullet")
      .setDisplaySize(14, 14)
      .setTint(COLOR_BULLET)
      .setDepth(20);
    (b as Phaser.GameObjects.Image & { vx: number; vy: number }).vx = vx;
    (b as Phaser.GameObjects.Image & { vx: number; vy: number }).vy = vy;
    this.bullets.push(b);
  }

  update(_time: number, delta: number) {
    // 키보드 지속 입력 (각도/파워 조절)
    if (this.cursors) {
      const step = 2;
      if (this.cursors.left?.isDown) {
        this.angle = Math.max(0, this.angle - step * (delta / 16.67));
        this.redrawBarrel();
        this.updateHud();
      } else if (this.cursors.right?.isDown) {
        this.angle = Math.min(90, this.angle + step * (delta / 16.67));
        this.redrawBarrel();
        this.updateHud();
      }
      if (this.cursors.up?.isDown) {
        this.power = Math.min(100, this.power + step * (delta / 16.67));
        this.updateHud();
      } else if (this.cursors.down?.isDown) {
        this.power = Math.max(20, this.power - step * (delta / 16.67));
        this.updateHud();
      }
    }

    // 포탄 물리 (gravity y=500)
    const dt = delta / 1000;
    const gravity = 500;
    const live: Phaser.GameObjects.Image[] = [];
    for (const b of this.bullets) {
      const bb = b as Phaser.GameObjects.Image & { vx: number; vy: number };
      bb.vy += gravity * dt;
      bb.x += bb.vx * dt;
      bb.y += bb.vy * dt;

      // 화면 밖
      if (bb.x < -20 || bb.x > W + 20 || bb.y > H + 20) {
        bb.destroy();
        continue;
      }
      // 바닥 충돌
      if (bb.y >= GROUND_Y) {
        this.spawnParticles(bb.x, GROUND_Y, 0x888888);
        bb.destroy();
        continue;
      }
      // 블록 충돌
      let hit = false;
      for (const blk of this.blocks) {
        if (blk.destroyed) continue;
        const bx = blk.x;
        const by = blk.y - 12; // 중심
        if (Math.abs(bb.x - bx) < 14 && Math.abs(bb.y - by) < 14) {
          blk.destroyed = true;
          this.spawnParticles(blk.x, blk.y - 12, COLOR_ENEMY);
          blk.destroy();
          this.score += 10;
          this.scoreText.setText(`SCORE: ${this.score}`);
          hit = true;
          break;
        }
      }
      if (hit) {
        bb.destroy();
        continue;
      }
      live.push(b);
    }
    this.bullets = live;

    // 승리 체크
    if (!this.gameOver && this.blocks.every(b => b.destroyed)) {
      this.showWin();
    }
  }

  private spawnParticles(x: number, y: number, color: number) {
    for (let i = 0; i < 6; i++) {
      const p = this.add.rectangle(x, y, 3, 3, color).setDepth(30);
      const vx = (Math.random() - 0.5) * 120;
      const vy = -Math.random() * 120 - 40;
      this.tweens.add({
        targets: p,
        x: p.x + vx,
        y: p.y + vy + 80,
        alpha: 0,
        duration: 500,
        onComplete: () => p.destroy(),
      });
    }
  }

  private showWin() {
    this.gameOver = true;
    this.winText = this.add.text(W / 2, H / 2 - 20, "승리!", {
      fontSize: "48px", fontFamily: FONT,
      color: "#50d070", resolution: TEXT_RES,
      stroke: "#000", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(200);

    this.retryBtn = this.add.text(W / 2, H / 2 + 40, "🔄 다시하기", {
      fontSize: "20px", fontFamily: FONT,
      color: "#ffffff", resolution: TEXT_RES,
      backgroundColor: "#2a2a5a",
      padding: { left: 14, right: 14, top: 8, bottom: 8 },
    }).setOrigin(0.5).setDepth(200).setInteractive({ useHandCursor: true });
    this.retryBtn.on("pointerdown", () => {
      this.scene.restart();
    });
  }

  private exitScene() {
    this.scene.stop();
    this.scene.resume("OfficeScene");
  }
}
