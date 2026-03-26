/**
 * 건물 외부 씬 (OutdoorScene)
 * OfficeScene의 EXIT 버튼 클릭 시 전환
 * - 빌딩 파사드 (좌측) + 도시 거리 (우측)
 * - 환경 캐릭터 자유 보행
 * - 날씨 연동 (OfficeScene과 동일 weatherCode 사용)
 * - "사무실로 돌아가기" 버튼 → OfficeScene 복귀
 */
import * as Phaser from "phaser";

const W = 832;
const H = 576;
const FONT = "'Pretendard Variable', Pretendard, -apple-system, sans-serif";
const DPR = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 3) : 2;

interface Pedestrian {
  sprite: Phaser.GameObjects.Sprite;
  charIdx: number;
  speed: number;
  dir: number; // 1=오른쪽, -1=왼쪽
}

export default class OutdoorScene extends Phaser.Scene {
  private weatherCode = 0;
  private pedestrians: Pedestrian[] = [];
  private rainDrops: { x: number; y: number; speed: number; len: number }[] = [];
  private snowFlakes: { x: number; y: number; speed: number; size: number; dx: number }[] = [];
  private particleG!: Phaser.GameObjects.Graphics;
  private onReturn?: () => void;

  constructor() { super({ key: "OutdoorScene" }); }

  init(data: { weatherCode?: number; onReturn?: () => void }) {
    this.weatherCode = data.weatherCode ?? 0;
    this.onReturn = data.onReturn;
  }

  preload() {
    // 캐릭터 스프라이트 — OfficeScene과 공유 (이미 로드됐으면 skip)
    for (const i of [0, 1, 2, 3, 6]) {
      if (!this.textures.exists(`char_${i}`)) {
        this.load.spritesheet(`char_${i}`, `/assets/char_${i}.png`, { frameWidth: 32, frameHeight: 64 });
      }
    }
  }

  create() {
    // 애니메이션 재등록 (다른 씬에서 이미 됐으면 skip)
    this.ensureAnims();

    // ── 배경 (하늘 + 지면) ────────────────────────────────────
    this.drawBackground();

    // ── 빌딩 파사드 (좌측) ───────────────────────────────────
    this.drawBuildingFacade();

    // ── 도시 배경 (우측) ─────────────────────────────────────
    this.drawCityStreet();

    // ── 보행자 ───────────────────────────────────────────────
    this.spawnPedestrians();

    // ── 날씨 파티클 ──────────────────────────────────────────
    this.particleG = this.add.graphics().setDepth(80);
    this.initWeather();

    // ── UI: 사무실로 돌아가기 ────────────────────────────────
    this.createReturnButton();

    // ── 보행자 이동 루프 ─────────────────────────────────────
    this.time.addEvent({ delay: 100, loop: true, callback: () => this.movePedestrians() });

    // 카메라
    this.cameras.main.roundPixels = true;
    this.cameras.main.setBackgroundColor(0x1a1a2e);
  }

  // ══════════════════════════════════════════════════════════
  // 배경
  // ══════════════════════════════════════════════════════════
  private drawBackground() {
    const g = this.add.graphics().setDepth(0);
    const wc = this.weatherCode;
    const hr = new Date().getHours() + new Date().getMinutes() / 60;
    const isNight = hr >= 21 || hr < 5;
    const isRain = (wc >= 51 && wc <= 82) || wc >= 95;
    const isSnow = wc >= 71 && wc <= 77;

    // 하늘
    let skyT: number, skyB: number;
    if (isNight)      { skyT = 0x050918; skyB = 0x0e1a30; }
    else if (isRain)  { skyT = 0x3a4050; skyB = 0x5a6068; }
    else if (isSnow)  { skyT = 0x7a8090; skyB = 0xa0a8b0; }
    else              { skyT = 0x1e60b0; skyB = 0x7ac8f8; }
    g.fillGradientStyle(skyT, skyT, skyB, skyB, 1);
    g.fillRect(0, 0, W, H * 0.55);

    // 지면 (도로)
    g.fillStyle(0x3a3a4a, 1); g.fillRect(0, H * 0.55, W, H * 0.45);
    // 도로 차선
    g.fillStyle(0xffffff, 0.25);
    for (let x = 40; x < W; x += 80) {
      g.fillRect(x, H * 0.7, 40, 4);
    }
    // 인도
    g.fillStyle(0x5a5a6a, 1); g.fillRect(0, H * 0.55, W, H * 0.08);
    g.fillStyle(0x4a4a5a, 0.5);
    for (let x = 0; x < W; x += 32) {
      g.fillRect(x + 31, H * 0.55, 1, H * 0.08);
    }
    // 연석
    g.fillStyle(0x888898, 1); g.fillRect(0, H * 0.63 - 3, W, 4);
    g.fillStyle(0x9a9aaa, 0.6); g.fillRect(0, H * 0.63 - 3, W, 1);
  }

  private drawBuildingFacade() {
    const g = this.add.graphics().setDepth(10);
    const bx = 20;
    const bw = 240;
    const bh = Math.round(H * 0.62);
    const by = Math.round(H * 0.63) - bh;

    // 건물 본체
    g.fillStyle(0x2a2a3e, 1); g.fillRect(bx, by, bw, bh);
    g.fillStyle(0x3a3a5a, 1); g.fillRect(bx + 4, by + 4, bw - 8, bh - 4);

    // 입구 (중앙 하단)
    const doorW = 52, doorH = 72;
    const doorX = bx + bw / 2 - doorW / 2;
    const doorY = by + bh - doorH;
    g.fillStyle(0x6a8a9a, 1); g.fillRect(doorX, doorY, doorW, doorH);
    g.fillStyle(0x8ab0c0, 0.5); g.fillRect(doorX + 2, doorY + 2, doorW / 2 - 4, doorH - 4); // 유리 반사
    g.fillStyle(0x222232, 1); g.fillRect(doorX + doorW / 2 - 1, doorY, 2, doorH); // 문 가운데 선
    // 유리문 반사
    g.fillStyle(0xffffff, 0.08); g.fillRect(doorX + 4, doorY + 4, 6, doorH - 8);

    // 도어 사인
    this.add.text(bx + bw / 2, doorY - 12, "두근컴퍼니", {
      fontSize: "9px", fontFamily: FONT, color: "#f5c842", resolution: DPR * 2,
    }).setOrigin(0.5).setDepth(11);

    // 창문 격자 (4열 × 6행)
    const winCols = 4, winRows = 6;
    const winW = 28, winH = 18;
    const winGapX = (bw - 32 - winCols * winW) / (winCols - 1);
    const winGapY = (bh - doorH - 32 - winRows * winH) / (winRows - 1);
    const hr = new Date().getHours();
    const isNight = hr >= 20 || hr < 7;

    for (let row = 0; row < winRows; row++) {
      for (let col = 0; col < winCols; col++) {
        const wx = bx + 16 + col * (winW + winGapX);
        const wy = by + 16 + row * (winH + winGapY);
        const lit = isNight ? Math.random() > 0.35 : Math.random() > 0.6;
        g.fillStyle(lit ? (isNight ? 0xf0df60 : 0x8ac8f0) : 0x1a2030, 1);
        g.fillRect(Math.round(wx), Math.round(wy), winW, winH);
        if (lit) {
          g.fillStyle(0xffffff, 0.12);
          g.fillRect(Math.round(wx + 2), Math.round(wy + 2), 4, winH - 4); // 창문 반사
        }
        // 창틀
        g.lineStyle(1, 0x1a1a2e, 0.8);
        g.strokeRect(Math.round(wx), Math.round(wy), winW, winH);
      }
    }

    // 건물 외곽선 + 하이라이트
    g.lineStyle(2, 0x4a4a6a, 1); g.strokeRect(bx, by, bw, bh);
    g.fillStyle(0xffffff, 0.04); g.fillRect(bx, by, 4, bh);

    // 빌딩 명패
    g.fillStyle(0x1a1a2e, 1); g.fillRect(bx + bw / 2 - 50, by - 18, 100, 18);
    g.fillStyle(0x4a4a6a, 1); g.strokeRect(bx + bw / 2 - 50, by - 18, 100, 18);
    this.add.text(bx + bw / 2, by - 9, "🏢 DOOGEUN HQ", {
      fontSize: "9px", fontFamily: FONT, color: "#aaaacc", resolution: DPR * 2,
    }).setOrigin(0.5).setDepth(11);
  }

  private drawCityStreet() {
    const g = this.add.graphics().setDepth(5);
    const hr = new Date().getHours();
    const isNight = hr >= 20 || hr < 7;
    const bc = isNight ? 0x101828 : 0x3a5a78;

    // 배경 빌딩들 (오른쪽)
    const bgs: [number, number, number][] = [
      [290, 60, 120], [420, 80, 90], [520, 50, 130],
      [640, 70, 100], [730, 55, 110],
    ];
    bgs.forEach(([bx, bh, bw]) => {
      g.fillStyle(bc, 1);
      g.fillRect(bx, Math.round(H * 0.63) - bh, bw, bh);
      if (isNight) {
        const rows = Math.floor(bh / 18), cols = Math.floor(bw / 14);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          if (Math.random() > 0.5) {
            g.fillStyle(0xf0df60, 0.4);
            g.fillRect(bx + c * 14 + 3, Math.round(H * 0.63) - bh + r * 18 + 4, 6, 8);
          }
        }
      }
      g.lineStyle(1, 0x3a4a5a, 0.5); g.strokeRect(bx, Math.round(H * 0.63) - bh, bw, bh);
    });

    // 가로등 (인도 위)
    [300, 480, 660].forEach(lx => {
      const ly = Math.round(H * 0.63) - 60;
      g.fillStyle(0x888898, 1); g.fillRect(lx - 2, ly, 4, 60); // 기둥
      g.fillStyle(0x888898, 1); g.fillRect(lx - 12, ly, 28, 6); // 가로대
      // 빛
      g.fillStyle(0xffeeaa, isNight ? 0.7 : 0.2); g.fillCircle(lx + 8, ly + 3, 8);
      if (isNight) {
        g.fillStyle(0xffeeaa, 0.08); g.fillCircle(lx + 8, ly + 3, 22);
      }
    });

    // 나무 (인도 가장자리)
    [350, 550, 720].forEach(tx => {
      const ty = Math.round(H * 0.55);
      // 줄기
      g.fillStyle(0x4a3020, 1); g.fillRect(tx - 3, ty - 8, 6, 32);
      // 잎
      const leafColor = isNight ? 0x0a1508 : 0x2a5a20;
      g.fillStyle(leafColor, 1); g.fillCircle(tx, ty - 16, 20);
      g.fillStyle(leafColor, 0.8); g.fillCircle(tx - 12, ty - 8, 14);
      g.fillStyle(leafColor, 0.8); g.fillCircle(tx + 12, ty - 8, 14);
    });
  }

  // ══════════════════════════════════════════════════════════
  // 보행자
  // ══════════════════════════════════════════════════════════
  private spawnPedestrians() {
    const groundY = Math.round(H * 0.58);
    const S = 0.5; // 스케일

    [0, 1, 2, 3].forEach((charIdx, i) => {
      const startX = 280 + i * 140;
      const dir = i % 2 === 0 ? 1 : -1;
      const sprite = this.add.sprite(startX, groundY, `char_${charIdx}`, 0)
        .setScale(S).setOrigin(0.5, 0.75).setDepth(50 + i);
      const anim = dir > 0 ? `char_${charIdx}_walk_right` : `char_${charIdx}_walk_left`;
      sprite.play(anim);
      this.pedestrians.push({ sprite, charIdx, speed: 0.6 + Math.random() * 0.4, dir });
    });
  }

  private movePedestrians() {
    const minX = 280, maxX = W - 40;
    this.pedestrians.forEach(p => {
      p.sprite.x += Math.round(p.speed * p.dir);
      if (p.sprite.x > maxX) {
        p.dir = -1;
        p.sprite.play(`char_${p.charIdx}_walk_left`);
      } else if (p.sprite.x < minX) {
        p.dir = 1;
        p.sprite.play(`char_${p.charIdx}_walk_right`);
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // 날씨
  // ══════════════════════════════════════════════════════════
  private initWeather() {
    const wc = this.weatherCode;
    const isRain = (wc >= 51 && wc <= 82) || wc >= 95;
    const isSnow = wc >= 71 && wc <= 77;
    if (isRain) {
      for (let i = 0; i < 30; i++) {
        this.rainDrops.push({ x: Math.random() * W, y: Math.random() * H * 0.6,
          speed: 1.5 + Math.random(), len: 4 + Math.random() * 4 });
      }
    }
    if (isSnow) {
      for (let i = 0; i < 25; i++) {
        this.snowFlakes.push({ x: Math.random() * W, y: Math.random() * H * 0.6,
          speed: 0.2 + Math.random() * 0.3, size: 1 + Math.random() * 1.5, dx: (Math.random() - 0.5) * 0.3 });
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // UI
  // ══════════════════════════════════════════════════════════
  private createReturnButton() {
    const bw = 150, bh = 32;
    const bx = W - bw - 16, by = 16;

    const bg = this.add.graphics().setDepth(200);
    bg.fillStyle(0x1a1a2e, 0.9); bg.fillRoundedRect(bx, by, bw, bh, 6);
    bg.lineStyle(1.5, 0xf5c842, 0.8); bg.strokeRoundedRect(bx, by, bw, bh, 6);

    const btn = this.add.text(bx + bw / 2, by + bh / 2, "🏢 사무실로 돌아가기", {
      fontSize: "11px", fontFamily: FONT, color: "#f5c842", resolution: DPR * 2,
    }).setOrigin(0.5).setDepth(201).setInteractive({ useHandCursor: true });

    btn.on("pointerover", () => { bg.clear(); bg.fillStyle(0x2a2a4e, 0.95); bg.fillRoundedRect(bx, by, bw, bh, 6); bg.lineStyle(1.5, 0xf5c842, 1); bg.strokeRoundedRect(bx, by, bw, bh, 6); });
    btn.on("pointerout",  () => { bg.clear(); bg.fillStyle(0x1a1a2e, 0.9); bg.fillRoundedRect(bx, by, bw, bh, 6); bg.lineStyle(1.5, 0xf5c842, 0.8); bg.strokeRoundedRect(bx, by, bw, bh, 6); });
    btn.on("pointerdown", () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.onReturn?.();
        this.scene.stop("OutdoorScene");
        this.scene.resume("OfficeScene");
        // OfficeScene 카메라 fadeIn (exit 시 fadeOut 된 상태 복구)
        const officeScene = this.scene.get("OfficeScene");
        if (officeScene) {
          officeScene.cameras.main.fadeIn(300, 0, 0, 0);
        }
      });
    });

    // 씬 제목
    this.add.text(16, 16, "🌇 건물 밖", {
      fontSize: "12px", fontFamily: FONT, color: "#ffffff", resolution: DPR * 2,
      backgroundColor: "#00000066", padding: { x: 8, y: 4 },
    }).setDepth(200);
  }

  // ══════════════════════════════════════════════════════════
  // 애니메이션 보장
  // ══════════════════════════════════════════════════════════
  private ensureAnims() {
    for (const i of [0, 1, 2, 3, 6]) {
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

  // ══════════════════════════════════════════════════════════
  // 업데이트 루프
  // ══════════════════════════════════════════════════════════
  update() {
    if (!this.particleG?.active) return;
    if (this.rainDrops.length === 0 && this.snowFlakes.length === 0) return;

    this.particleG.clear();
    const maxY = H * 0.63;

    this.rainDrops.forEach(d => {
      if (d.y < maxY) {
        this.particleG.lineStyle(1, 0x8ab8d8, 0.3); this.particleG.lineBetween(d.x, d.y, d.x - 0.5, d.y + d.len);
      }
      d.y += d.speed; d.x -= 0.2;
      if (d.y > maxY) { d.y = -d.len; d.x = Math.random() * W; }
    });

    this.snowFlakes.forEach(f => {
      if (f.y < maxY) {
        this.particleG.fillStyle(0xeeeeff, 0.6); this.particleG.fillCircle(f.x, f.y, f.size);
      }
      f.y += f.speed; f.x += f.dx + Math.sin(f.y * 0.05) * 0.2;
      if (f.y > maxY) { f.y = -4; f.x = Math.random() * W; }
    });
  }
}
