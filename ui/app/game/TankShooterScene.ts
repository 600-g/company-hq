/**
 * TankShooterScene — 8bit 탱크 슈팅 미니게임 (v2)
 *
 * 플레이: 좌측 하단 탱크에서 각도 조절 + 파워 차지 후 포탄 발사 → 우측 요새 파괴
 * 입력:
 *   ↑ ↓       각도 조절 (5~85도)
 *   SPACE(홀드) 파워 차지 (0~100), 릴리즈 시 발사
 *   ESC       종료
 * 모바일: 좌측 터치=각도, 우측 FIRE 버튼 홀드=차지
 * 종료: ESC 또는 🚪 버튼 → OfficeScene resume
 */

import * as Phaser from "phaser";

const FONT = "'Pretendard Variable', Pretendard, -apple-system, sans-serif";
const TEXT_RES = 8;

const W = 832;
const H = 576;
const GROUND_H = 50;
const GROUND_Y = H - GROUND_H;

const COLOR_BG_TOP = 0x0f0f1f;
const COLOR_BG_MID = 0x1a1a2e;
const COLOR_GROUND = 0x2a2a3a;
const COLOR_PLAYER = 0x50d070;
const COLOR_ENEMY = 0xf87171;
const COLOR_BULLET = 0xf5c842;

const ANGLE_MIN = 5;
const ANGLE_MAX = 85;
const POWER_MAX = 100;
const CHARGE_RATE = 90; // per second

interface BlockSprite extends Phaser.GameObjects.Image {
  destroyed?: boolean;
  hp?: number;
}

type BulletImg = Phaser.GameObjects.Image & { vx: number; vy: number };

export default class TankShooterScene extends Phaser.Scene {
  private tankBody!: Phaser.GameObjects.Image;
  private tankTurret!: Phaser.GameObjects.Image;
  private barrel!: Phaser.GameObjects.Graphics;
  private chargeBar!: Phaser.GameObjects.Graphics;
  private bullets: BulletImg[] = [];
  private blocks: BlockSprite[] = [];
  private angle = 45;
  private power = 0;
  private charging = false;
  private maxFlashTimer = 0;
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private angleText!: Phaser.GameObjects.Text;
  private powerText!: Phaser.GameObjects.Text;
  private maxText?: Phaser.GameObjects.Text;
  private winText?: Phaser.GameObjects.Text;
  private retryBtn?: Phaser.GameObjects.Text;
  private tankX = 90;
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
    this.power = 0;
    this.charging = false;

    this.drawBackground();
    this.drawFloor();
    this.spawnBlocks();

    // 탱크 바디 (IRONBALL) + 포탑 (BEASTBALL)
    this.tankBody = this.add.image(this.tankX, this.tankY, "tank_body")
      .setDisplaySize(44, 34)
      .setDepth(10);
    this.tankBody.setTexture("tank_body");
    const bodyTex = this.textures.get("tank_body").getSourceImage() as HTMLImageElement;
    if (bodyTex) this.textures.get("tank_body").setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.tankTurret = this.add.image(this.tankX, this.tankY - 12, "tank_turret")
      .setDisplaySize(22, 22)
      .setDepth(11);

    // 포신 (그래픽)
    this.barrel = this.add.graphics().setDepth(12);
    this.chargeBar = this.add.graphics().setDepth(13);
    this.redrawBarrel();

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
      "↑ ↓ 각도   SPACE 홀드 = 파워 차지 (릴리즈 발사)   ESC 종료",
      {
        fontSize: "11px", fontFamily: FONT,
        color: "#aaa", resolution: TEXT_RES,
      }
    ).setOrigin(0.5, 0).setDepth(100);

    // 모바일 FIRE 버튼 (홀드로 차지)
    const fireBtn = this.add.text(W - 12, H - 20, "🔥 HOLD", {
      fontSize: "18px", fontFamily: FONT,
      color: "#ffffff", resolution: TEXT_RES,
      backgroundColor: "#b91c1c",
      padding: { left: 12, right: 12, top: 6, bottom: 6 },
    }).setOrigin(1, 1).setDepth(100).setInteractive({ useHandCursor: true });
    fireBtn.on("pointerdown", () => this.startCharge());
    fireBtn.on("pointerup", () => this.releaseCharge());
    fireBtn.on("pointerout", () => {
      if (this.charging) this.releaseCharge();
    });

    // 키보드
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.spaceKey?.on("down", () => this.startCharge());
    this.spaceKey?.on("up", () => this.releaseCharge());
    this.escKey?.on("down", () => this.exitScene());

    // 모바일 터치 영역 — 좌측: 각도 조절
    const leftTouch = this.add.zone(0, 80, W / 2, H - 160).setOrigin(0, 0).setInteractive();
    leftTouch.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const rel = Phaser.Math.Clamp((H - 80 - p.y) / (H - 240), 0, 1);
      this.angle = Math.round(ANGLE_MIN + rel * (ANGLE_MAX - ANGLE_MIN));
      this.redrawBarrel();
      this.updateHud();
    });
  }

  private drawBackground() {
    // 그라데이션 배경 (상단 어두움 → 중간 보라)
    const bg = this.add.graphics().setDepth(0);
    bg.fillGradientStyle(COLOR_BG_TOP, COLOR_BG_TOP, COLOR_BG_MID, COLOR_BG_MID, 1);
    bg.fillRect(0, 0, W, GROUND_Y);

    // 배경 동굴 실루엣 (큰 Cave 구조물, 어둡게)
    const caveBg = this.add.image(W / 2, GROUND_Y - 80, "tank_bg_cave")
      .setDisplaySize(320, 220)
      .setAlpha(0.25)
      .setTint(0x4a4a7a)
      .setDepth(1);
    // 포켓몬 에셋이 로드 실패한 경우를 대비해 alpha 처리만
    void caveBg;
  }

  private drawFloor() {
    // Cave 바닥 타일 반복 (32x32 픽셀 기준)
    const tileKeys = ["tank_floor_a", "tank_floor_b", "tank_floor_c"];
    const tileSize = 32;
    for (let x = 0; x < W + tileSize; x += tileSize) {
      const key = tileKeys[(x / tileSize) % tileKeys.length | 0];
      // 바닥 두 줄
      this.add.image(x, GROUND_Y, key)
        .setOrigin(0, 0)
        .setDisplaySize(tileSize, tileSize)
        .setDepth(2);
      this.add.image(x, GROUND_Y + tileSize, key)
        .setOrigin(0, 0)
        .setDisplaySize(tileSize, GROUND_H - tileSize)
        .setDepth(2);
    }
    // 바닥 상단 라인 강조
    const line = this.add.graphics().setDepth(3);
    line.fillStyle(COLOR_GROUND, 1);
    line.fillRect(0, GROUND_Y - 2, W, 2);
  }

  private spawnBlocks() {
    const baseX = W - 160;
    // 지지대 (Factory 2x1)
    this.add.image(baseX, GROUND_Y, "block_base")
      .setOrigin(0.5, 1)
      .setDisplaySize(112, 36)
      .setDepth(5);

    // 요새 (피라미드 + 큰 블록 섞기, 7개)
    const layout: Array<{ x: number; y: number; key: string; w: number; h: number; hp: number }> = [
      // 바닥층 (4)
      { x: baseX - 40, y: GROUND_Y - 20, key: "block_c", w: 26, h: 26, hp: 1 },
      { x: baseX - 14, y: GROUND_Y - 20, key: "block_a", w: 26, h: 26, hp: 1 },
      { x: baseX + 14, y: GROUND_Y - 20, key: "block_b", w: 26, h: 26, hp: 1 },
      { x: baseX + 40, y: GROUND_Y - 20, key: "block_d", w: 26, h: 26, hp: 1 },
      // 중간층 (2)
      { x: baseX - 14, y: GROUND_Y - 46, key: "block_e", w: 26, h: 26, hp: 1 },
      { x: baseX + 14, y: GROUND_Y - 46, key: "block_c", w: 26, h: 26, hp: 1 },
      // 꼭대기 (큰 블록 하나)
      { x: baseX, y: GROUND_Y - 72, key: "block_big", w: 36, h: 36, hp: 2 },
    ];
    for (const p of layout) {
      const img = this.add.image(p.x, p.y, p.key)
        .setOrigin(0.5, 1).setDepth(6) as BlockSprite;
      img.setDisplaySize(p.w, p.h);
      img.destroyed = false;
      img.hp = p.hp;
      this.blocks.push(img);
    }
  }

  private redrawBarrel() {
    this.barrel.clear();
    const rad = Phaser.Math.DegToRad(this.angle);
    const len = 28;
    const sx = this.tankX;
    const sy = this.tankY - 12;
    const ex = sx + Math.cos(rad) * len;
    const ey = sy - Math.sin(rad) * len;
    // 포신 바디
    this.barrel.lineStyle(5, 0x333344, 1);
    this.barrel.lineBetween(sx, sy, ex, ey);
    this.barrel.lineStyle(3, COLOR_PLAYER, 1);
    this.barrel.lineBetween(sx, sy, ex, ey);
    // 조준 점선 가이드
    this.barrel.lineStyle(1, COLOR_BULLET, 0.35);
    const gx = sx + Math.cos(rad) * (len + 50);
    const gy = sy - Math.sin(rad) * (len + 50);
    this.barrel.lineBetween(ex, ey, gx, gy);
  }

  private redrawChargeBar() {
    this.chargeBar.clear();
    if (!this.charging && this.power === 0) return;

    // 포신 옆 (포탑 위쪽)에 작은 세로 바
    const barX = this.tankX + 30;
    const barY = this.tankY - 60;
    const barW = 10;
    const barH = 48;
    // 배경
    this.chargeBar.fillStyle(0x000000, 0.5);
    this.chargeBar.fillRect(barX, barY, barW, barH);
    this.chargeBar.lineStyle(1, 0x555566, 1);
    this.chargeBar.strokeRect(barX, barY, barW, barH);
    // 채우기 — 파워 비율에 따라 색 변화
    const ratio = Phaser.Math.Clamp(this.power / POWER_MAX, 0, 1);
    let fillColor = 0xf5c842; // 노랑
    if (ratio > 0.7) fillColor = 0xf87171; // 빨강
    else if (ratio > 0.4) fillColor = 0xf59e42; // 주황
    const fillH = Math.round(barH * ratio);
    this.chargeBar.fillStyle(fillColor, 1);
    this.chargeBar.fillRect(barX, barY + (barH - fillH), barW, fillH);
  }

  private updateHud() {
    this.angleText.setText(`각도: ${Math.round(this.angle)}°  (↑ ↓)`);
    this.powerText.setText(`파워: ${Math.round(this.power)}  (SPACE 홀드)`);
  }

  private startCharge() {
    if (this.gameOver) return;
    if (this.charging) return;
    this.charging = true;
    this.power = 0;
  }

  private releaseCharge() {
    if (!this.charging) return;
    this.charging = false;
    if (this.power < 10) {
      // 너무 약하면 발사 안 함
      this.power = 0;
      this.redrawChargeBar();
      this.updateHud();
      return;
    }
    this.fire();
    this.power = 0;
    this.redrawChargeBar();
    this.updateHud();
  }

  private fire() {
    if (this.gameOver) return;
    const rad = Phaser.Math.DegToRad(this.angle);
    const speed = 80 + this.power * 6.5;
    const vx = Math.cos(rad) * speed;
    const vy = -Math.sin(rad) * speed;
    const sx = this.tankX + Math.cos(rad) * 30;
    const sy = this.tankY - 12 - Math.sin(rad) * 30;
    const b = this.add.image(sx, sy, "bullet")
      .setDisplaySize(14, 14)
      .setDepth(20) as BulletImg;
    b.vx = vx;
    b.vy = vy;
    this.bullets.push(b);
    // 발사 플래시
    this.spawnParticles(sx, sy, COLOR_BULLET);
  }

  update(_time: number, delta: number) {
    if (this.gameOver) {
      this.redrawChargeBar();
      return;
    }
    const dt = delta / 1000;

    // 각도 조절 (↑↓)
    if (this.cursors) {
      const step = 45 * dt; // 45도/초
      if (this.cursors.up?.isDown) {
        this.angle = Math.min(ANGLE_MAX, this.angle + step);
        this.redrawBarrel();
        this.updateHud();
      } else if (this.cursors.down?.isDown) {
        this.angle = Math.max(ANGLE_MIN, this.angle - step);
        this.redrawBarrel();
        this.updateHud();
      }
    }

    // 파워 차지
    if (this.charging) {
      this.power = Math.min(POWER_MAX, this.power + CHARGE_RATE * dt);
      if (this.power >= POWER_MAX) {
        // MAX 깜빡임
        this.maxFlashTimer += dt;
        if (!this.maxText) {
          this.maxText = this.add.text(this.tankX + 50, this.tankY - 70, "MAX", {
            fontSize: "14px", fontFamily: FONT,
            color: "#ff6b6b", resolution: TEXT_RES,
            stroke: "#000", strokeThickness: 3,
          }).setOrigin(0, 0.5).setDepth(110);
        }
        this.maxText.setAlpha(Math.sin(this.maxFlashTimer * 12) > 0 ? 1 : 0.3);
      }
      this.updateHud();
    } else {
      if (this.maxText) {
        this.maxText.destroy();
        this.maxText = undefined;
        this.maxFlashTimer = 0;
      }
    }
    this.redrawChargeBar();

    // 포탄 물리
    const gravity = 500;
    const live: BulletImg[] = [];
    for (const b of this.bullets) {
      b.vy += gravity * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rotation += dt * 8;

      if (b.x < -20 || b.x > W + 20 || b.y > H + 20) {
        b.destroy();
        continue;
      }
      if (b.y >= GROUND_Y) {
        this.spawnParticles(b.x, GROUND_Y, 0x888888);
        b.destroy();
        continue;
      }

      let hit = false;
      for (const blk of this.blocks) {
        if (blk.destroyed) continue;
        const bx = blk.x;
        const by = blk.y - (blk.displayHeight / 2);
        const hw = blk.displayWidth / 2 + 2;
        const hh = blk.displayHeight / 2 + 2;
        if (Math.abs(b.x - bx) < hw && Math.abs(b.y - by) < hh) {
          blk.hp = (blk.hp ?? 1) - 1;
          if ((blk.hp ?? 0) <= 0) {
            blk.destroyed = true;
            this.spawnExplosion(blk.x, blk.y - blk.displayHeight / 2);
            blk.destroy();
            this.score += 10;
            this.scoreText.setText(`SCORE: ${this.score}`);
          } else {
            blk.setTint(COLOR_ENEMY);
            this.spawnParticles(b.x, b.y, COLOR_ENEMY);
          }
          hit = true;
          break;
        }
      }
      if (hit) {
        b.destroy();
        continue;
      }
      live.push(b);
    }
    this.bullets = live;

    if (this.blocks.every(b => b.destroyed)) {
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

  private spawnExplosion(x: number, y: number) {
    // 원형 확장 + 파편
    const ring = this.add.circle(x, y, 4, 0xf5c842, 0.8).setDepth(31);
    this.tweens.add({
      targets: ring,
      radius: 40,
      alpha: 0,
      duration: 400,
      onUpdate: () => {
        // Phaser circle has no dynamic radius prop, workaround via scale
      },
      onComplete: () => ring.destroy(),
    });
    this.tweens.add({
      targets: ring,
      scale: 8,
      duration: 400,
    });
    this.spawnParticles(x, y, COLOR_ENEMY);
    this.spawnParticles(x, y, COLOR_BULLET);
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
