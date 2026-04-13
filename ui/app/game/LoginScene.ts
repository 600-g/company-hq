/**
 * 로그인 & EXIT 공용 씬 — 탑뷰 두근컴퍼니 마을
 * 에셋: /assets/original/{buildings,tiles,props,chars} 사용 (직접 그리기 금지)
 * 폰트: PokemonClear (power clear.ttf — globals.css에 이미 등록됨)
 * 사이드패널: 이 씬 활성화 시 window event `hq-outdoor` 로 Office.tsx에 알림 → 패널 숨김
 */
import * as Phaser from "phaser";

const W = 960;
const H = 540;
const FONT = "PokemonClear, 'Pretendard Variable', sans-serif";
const DPR = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 3) : 2;
const TILE = 32;           // 16px 타일을 2x 스케일로
const TILE_SCALE = 2;
const BUILDING_SCALE = 2.2;
const CHAR_SCALE = 1.0;  // OfficeScene과 동일 (32×48 프레임 그대로)

// 레이아웃 (픽셀)
const SKY_H = 0;            // 잔디가 전체 커버
const BACK_ROW_BOTTOM_Y = 250;
const ROAD_Y = 270;
const ROAD_HEIGHT = 60;
const FRONT_ROW_BOTTOM_Y = H - 40;
const BOTTOM_SIDEWALK_Y = H - 24;

// 건물 슬롯 (중심 X, 바닥 Y, 에셋 키, HQ 여부)
interface BuildingSlot {
  x: number;
  y: number;
  key: string;
  isHQ?: boolean;
  isPark?: boolean;
}

const BUILDINGS: BuildingSlot[] = [
  // 뒷줄 3채
  { x: 140, y: BACK_ROW_BOTTOM_Y, key: "bld_shop_left" },
  { x: 480, y: BACK_ROW_BOTTOM_Y, key: "bld_main_hq", isHQ: true },
  { x: 800, y: BACK_ROW_BOTTOM_Y, key: "bld_shop_right" },
  // 앞줄: 좌·우 집, 중앙은 공원
  { x: 160, y: FRONT_ROW_BOTTOM_Y, key: "bld_cafe" },
  { x: 480, y: FRONT_ROW_BOTTOM_Y, key: "park", isPark: true },
  { x: 800, y: FRONT_ROW_BOTTOM_Y, key: "bld_main_1f" },
];

interface Walker {
  sprite: Phaser.GameObjects.Sprite;
  charKey: string;
  speed: number;
  mode: "road" | "sidewalk" | "alley";
  dir: -1 | 1;
  minX?: number; maxX?: number;
  minY?: number; maxY?: number;
}

const CHAR_KEYS = ["0", "1", "2", "3"];

export default class LoginScene extends Phaser.Scene {
  private weatherCode = 0;
  private showReturnBtn = false;
  private walkers: Walker[] = [];
  private rainDrops: { x: number; y: number; speed: number; len: number }[] = [];
  private snowFlakes: { x: number; y: number; speed: number; size: number; dx: number }[] = [];
  private particleG!: Phaser.GameObjects.Graphics;
  private isNight = false;
  private isEvening = false;

  constructor() { super({ key: "LoginScene" }); }

  init(data: { weatherCode?: number; showReturnBtn?: boolean }) {
    this.weatherCode = data.weatherCode ?? 0;
    this.showReturnBtn = data.showReturnBtn ?? false;
    this.walkers = [];
    this.rainDrops = [];
    this.snowFlakes = [];
  }

  preload() {
    const v = "v2";
    // 건물
    const bldgs = ["main_hq", "apartment", "cafe", "shop_left", "shop_right", "main_1f", "main_2f", "main_3f"];
    bldgs.forEach(n => {
      if (!this.textures.exists(`bld_${n}`)) this.load.image(`bld_${n}`, `/assets/original/buildings/${n}.png?${v}`);
    });
    // 타일 (그라운드)
    ["road", "road_line", "sidewalk"].forEach(n => {
      if (!this.textures.exists(`tile_${n}`)) this.load.image(`tile_${n}`, `/assets/original/tiles/${n}.png?${v}`);
    });
    // Props
    ["bench", "streetlight", "tree_spring", "tree_summer", "tree_autumn", "tree_winter",
     "potplant_0", "potplant_1", "potplant_2", "mailbox"].forEach(n => {
      if (!this.textures.exists(`prop_${n}`)) this.load.image(`prop_${n}`, `/assets/original/props/${n}.png?${v}`);
    });
    // 캐릭터 32×48 (OfficeScene과 동일 — /assets/chars/)
    CHAR_KEYS.forEach(n => {
      if (!this.textures.exists(`char_${n}`)) {
        this.load.spritesheet(`char_${n}`, `/assets/chars/char_${n}.png`, { frameWidth: 32, frameHeight: 48 });
      }
    });
    // Autotile 잔디
    if (!this.textures.exists("autotile_grass")) {
      this.load.image("autotile_grass", "/assets/pokemon_assets/Autotiles/Light%20grass.png");
    }
  }

  create() {
    this.computeTimeTone();
    this.ensureAnims();
    this.drawGrassBackground();
    this.drawRoadAndSidewalk();
    this.placeStreetFurniture();
    this.placeBuildings();
    this.drawHQSign();
    this.spawnWalkers();
    this.applyTint();
    this.particleG = this.add.graphics().setDepth(200);
    this.initWeather();

    if (this.showReturnBtn) {
      this.cameras.main.fadeIn(300, 0, 0, 0);
      this.createReturnButton();
    }
    this.time.addEvent({ delay: 80, loop: true, callback: () => this.moveWalkers() });
    this.cameras.main.roundPixels = true;

    // 외부 씬 진입 알림 (사이드패널 숨김용)
    this.notifyOutdoor(true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.notifyOutdoor(false));
  }

  private notifyOutdoor(active: boolean) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("hq-outdoor", { detail: { active } }));
    }
  }

  private computeTimeTone() {
    const hr = new Date().getHours() + new Date().getMinutes() / 60;
    this.isNight = hr >= 20 || hr < 6;
    this.isEvening = !this.isNight && (hr >= 17 || hr < 7);
  }

  // ══════════════════════════════════════════════════════════
  // 배경
  // ══════════════════════════════════════════════════════════
  private drawGrassBackground() {
    // 단색 잔디 — 시간대 톤 반영
    const grass = this.isNight ? 0x1a3820
                : this.isEvening ? 0x4a7a3a
                : 0x5ab04a;
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(grass, 1);
    g.fillRect(0, 0, W, H);
    // 잔디 텍스처 점
    g.fillStyle(this.isNight ? 0x0a2010 : 0x7ad060, 0.4);
    for (let i = 0; i < 400; i++) {
      g.fillRect(((i * 43) % W), ((i * 29) % H), 2, 2);
    }
    // 하늘 배경 (상단 살짝)
    const sky = this.isNight ? 0x0a1228
               : this.isEvening ? 0xe08858
               : 0x8cc8f0;
    g.fillStyle(sky, 0.35);
    g.fillRect(0, 0, W, 40);
  }

  // 세로 골목 x 좌표
  private readonly ALLEY_XS = [310, 650];

  private drawRoadAndSidewalk() {
    // 도로 (가로 관통) — road.png 타일 반복
    for (let x = 0; x < W; x += TILE) {
      for (let y = ROAD_Y; y < ROAD_Y + ROAD_HEIGHT; y += TILE) {
        this.add.image(x, y, "tile_road").setOrigin(0, 0).setScale(TILE_SCALE).setDepth(5);
      }
    }
    // 중앙 점선 (road_line.png)
    const midY = ROAD_Y + Math.floor(ROAD_HEIGHT / 2) - TILE / 2;
    for (let x = 0; x < W; x += TILE * 2) {
      this.add.image(x, midY, "tile_road_line").setOrigin(0, 0).setScale(TILE_SCALE).setDepth(6);
    }

    // 인도 — 도로 위·아래
    const sidewalkTop = ROAD_Y - TILE;
    const sidewalkBot = ROAD_Y + ROAD_HEIGHT;
    for (let x = 0; x < W; x += TILE) {
      this.add.image(x, sidewalkTop, "tile_sidewalk").setOrigin(0, 0).setScale(TILE_SCALE).setDepth(5);
      this.add.image(x, sidewalkBot, "tile_sidewalk").setOrigin(0, 0).setScale(TILE_SCALE).setDepth(5);
      // 하단 전체 인도
      this.add.image(x, BOTTOM_SIDEWALK_Y, "tile_sidewalk").setOrigin(0, 0).setScale(TILE_SCALE).setDepth(5);
    }

    // HQ 앞 횡단보도 (흰 줄)
    const g = this.add.graphics().setDepth(7);
    g.fillStyle(0xffffff, this.isNight ? 0.55 : 0.85);
    for (let i = 0; i < 7; i++) {
      g.fillRect(480 - 40, ROAD_Y + 6 + i * 8, 80, 4);
    }

    // 세로 골목 — 건물 사이 통로 (sidewalk 타일 반복)
    this.ALLEY_XS.forEach(ax => {
      for (let y = 0; y < H; y += TILE) {
        // 도로 구간 제외 (차도는 유지)
        if (y >= ROAD_Y - TILE && y < ROAD_Y + ROAD_HEIGHT + TILE) continue;
        this.add.image(ax - TILE / 2, y, "tile_sidewalk")
          .setOrigin(0, 0).setScale(TILE_SCALE).setDepth(4);
      }
      // 골목-도로 교차점에 횡단보도
      for (let i = 0; i < 7; i++) {
        g.fillRect(ax - 14, ROAD_Y + 6 + i * 8, 28, 4);
      }
    });
  }

  private placeStreetFurniture() {
    // 가로등 (도로 위·아래 인도에 분산)
    const lampXs = [70, 280, 480, 680, 890];
    lampXs.forEach(lx => {
      // 도로 위
      this.add.image(lx, ROAD_Y - TILE, "prop_streetlight")
        .setOrigin(0.5, 1).setScale(TILE_SCALE).setDepth(15);
      // 하단 인도
      this.add.image(lx, BOTTOM_SIDEWALK_Y, "prop_streetlight")
        .setOrigin(0.5, 1).setScale(TILE_SCALE).setDepth(15);
    });

    // 뒷줄 풀밭에 나무 (건물 사이 빈 공간)
    const season = this.getSeason();
    const treeKey = `prop_tree_${season}`;
    const treeSpots: [number, number][] = [
      [60, 180], [260, 120], [680, 120], [910, 180],
    ];
    treeSpots.forEach(([tx, ty]) => {
      this.add.image(tx, ty, treeKey).setOrigin(0.5, 1).setScale(TILE_SCALE).setDepth(8);
    });

    // 우편함 (HQ 옆)
    this.add.image(410, ROAD_Y - TILE, "prop_mailbox")
      .setOrigin(0.5, 1).setScale(TILE_SCALE).setDepth(15);
  }

  private getSeason(): "spring" | "summer" | "autumn" | "winter" {
    const m = new Date().getMonth() + 1;
    if (m >= 3 && m <= 5) return "spring";
    if (m >= 6 && m <= 8) return "summer";
    if (m >= 9 && m <= 11) return "autumn";
    return "winter";
  }

  // ══════════════════════════════════════════════════════════
  // 건물
  // ══════════════════════════════════════════════════════════
  private placeBuildings() {
    BUILDINGS.forEach(slot => {
      if (slot.isPark) { this.drawPark(slot.x, slot.y); return; }
      // 건물 기본 스케일: 키별로 조정 (너무 큰 것 방지)
      const baseScale: Record<string, number> = {
        bld_main_hq: 2.2,
        bld_main_1f: 2.0,
        bld_shop_left: 2.0,
        bld_shop_right: 2.0,
        bld_cafe: 2.0,
        bld_apartment: 1.4,  // 3층 — 축소
      };
      const scale = slot.isHQ ? (baseScale[slot.key] || BUILDING_SCALE) * 1.05
                              : (baseScale[slot.key] || BUILDING_SCALE);
      const img = this.add.image(slot.x, slot.y, slot.key)
        .setOrigin(0.5, 1).setScale(scale).setDepth(10);
      const tex = this.textures.get(slot.key);
      if (tex) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      // 그림자
      const sh = this.add.graphics().setDepth(9);
      sh.fillStyle(0x000000, 0.22);
      sh.fillEllipse(slot.x, slot.y + 2, img.displayWidth * 0.6, 8);

      if (slot.isHQ) {
        // HQ 골드 테두리 효과
        const glow = this.add.graphics().setDepth(9);
        glow.lineStyle(3, 0xf5c842, 0.5);
        glow.strokeRoundedRect(
          slot.x - img.displayWidth / 2 - 4,
          slot.y - img.displayHeight - 4,
          img.displayWidth + 8, img.displayHeight + 8, 4);

        // 입구 클릭존 (하단 중앙, 문 영역)
        const zoneW = img.displayWidth * 0.35;
        const zoneH = 40;
        const zoneY = slot.y - zoneH / 2 - 4;
        const zone = this.add.zone(slot.x, zoneY, zoneW, zoneH)
          .setDepth(20).setInteractive({ useHandCursor: true });
        let hoverG: Phaser.GameObjects.Graphics | null = null;
        zone.on("pointerover", () => {
          hoverG = this.add.graphics().setDepth(19);
          hoverG.fillStyle(0xf5c842, 0.35);
          hoverG.fillRoundedRect(slot.x - zoneW / 2, zoneY - zoneH / 2, zoneW, zoneH, 6);
        });
        zone.on("pointerout", () => { hoverG?.destroy(); hoverG = null; });
        zone.on("pointerdown", () => this.enterOffice());
      }
    });
  }

  private drawPark(cx: number, baseY: number) {
    const w = 180, h = 180;
    const x0 = cx - w / 2;
    const y0 = baseY - h;
    const g = this.add.graphics().setDepth(8);
    // 잔디 (더 진한 초록)
    g.fillStyle(this.isNight ? 0x1a3020 : 0x3aa048, 1);
    g.fillRect(x0, y0, w, h);
    // 울타리
    g.lineStyle(2, this.isNight ? 0x3a2818 : 0x6a4828, 1);
    g.strokeRect(x0, y0, w, h);
    // 산책로
    g.fillStyle(this.isNight ? 0x3a3028 : 0x9a8858, 1);
    g.fillRect(cx - 10, y0 + 4, 20, h - 8);
    g.fillRect(x0 + 4, y0 + h / 2 - 8, w - 8, 16);

    // 나무 (계절)
    const season = this.getSeason();
    const treeKey = `prop_tree_${season}`;
    const treeSpots: [number, number][] = [
      [x0 + 28, y0 + 32], [x0 + w - 28, y0 + 32],
      [x0 + 28, y0 + h - 10], [x0 + w - 28, y0 + h - 10],
    ];
    treeSpots.forEach(([tx, ty]) => {
      this.add.image(tx, ty, treeKey).setOrigin(0.5, 1).setScale(TILE_SCALE).setDepth(11);
    });

    // 벤치 2개 (분수 좌우)
    this.add.image(x0 + 30, y0 + h / 2 + 24, "prop_bench").setOrigin(0, 1).setScale(1.6).setDepth(11);
    this.add.image(x0 + w - 30, y0 + h / 2 + 24, "prop_bench").setOrigin(1, 1).setScale(1.6).setDepth(11);

    // 중앙 분수 (원)
    g.fillStyle(0x888898, 1); g.fillCircle(cx, y0 + h / 2, 14);
    g.fillStyle(0x6ab8e8, 1); g.fillCircle(cx, y0 + h / 2, 10);
    g.fillStyle(0xaadef8, 0.6); g.fillCircle(cx - 3, y0 + h / 2 - 3, 4);
  }

  private drawHQSign() {
    const x = 480;
    const y = 60;
    const g = this.add.graphics().setDepth(50);
    g.fillStyle(0x1a1a2e, 0.95);
    g.fillRoundedRect(x - 110, y - 18, 220, 32, 8);
    g.lineStyle(2, 0xf5c842, 1);
    g.strokeRoundedRect(x - 110, y - 18, 220, 32, 8);
    this.add.text(x, y - 2, "두근 컴퍼니", {
      fontSize: "20px", fontFamily: FONT, color: "#f5c842",
      fontStyle: "700", resolution: DPR * 3,
    }).setOrigin(0.5).setDepth(51);

    if (this.showReturnBtn) {
      // HQ 입구 위 화살표 (클릭 유도)
      this.add.text(480, BACK_ROW_BOTTOM_Y - 30, "▼", {
        fontSize: "18px", fontFamily: FONT, color: "#f5c842",
        fontStyle: "700", resolution: DPR * 3,
      }).setOrigin(0.5).setDepth(16);
    }
  }

  // ══════════════════════════════════════════════════════════
  // 보행자 — 도로/인도/공원 주변만 이동 (건물 위 X)
  // ══════════════════════════════════════════════════════════
  private spawnWalkers() {
    // 도로 위·아래 인도 가로 보행
    for (let i = 0; i < 2; i++) this.spawnRoadWalker(ROAD_Y - 8, i);
    for (let i = 0; i < 2; i++) this.spawnRoadWalker(ROAD_Y + ROAD_HEIGHT + 16, i + 2);
    for (let i = 0; i < 2; i++) this.spawnRoadWalker(BOTTOM_SIDEWALK_Y + 14, i + 4);

    // 세로 골목 위↔아래 보행
    this.ALLEY_XS.forEach((ax, idx) => {
      const charKey = CHAR_KEYS[(idx + 6) % CHAR_KEYS.length];
      const dir: 1 | -1 = Math.random() > 0.5 ? 1 : -1;
      const startY = 80 + Math.random() * (H - 160);
      const sp = this.add.sprite(ax, startY, `char_${charKey}`, 0)
        .setOrigin(0.5, 1).setScale(CHAR_SCALE).setDepth(30);
      sp.play(dir > 0 ? `char_${charKey}_walk_down` : `char_${charKey}_walk_up`);
      this.walkers.push({
        sprite: sp, charKey, speed: 0.5 + Math.random() * 0.3,
        mode: "alley", dir, minY: 60, maxY: H - 30,
      });
    });
  }

  private spawnRoadWalker(laneY: number, idx: number) {
    const charKey = CHAR_KEYS[idx % CHAR_KEYS.length];
    const dir: 1 | -1 = idx % 2 === 0 ? 1 : -1;
    const startX = 40 + Math.random() * (W - 80);
    const sp = this.add.sprite(startX, laneY, `char_${charKey}`, 0)
      .setOrigin(0.5, 1).setScale(CHAR_SCALE).setDepth(30);
    sp.play(dir > 0 ? `char_${charKey}_walk_right` : `char_${charKey}_walk_left`);
    this.walkers.push({
      sprite: sp, charKey, speed: 0.6 + Math.random() * 0.5,
      mode: "road", dir, minX: 20, maxX: W - 20,
    });
  }

  private moveWalkers() {
    this.walkers.forEach(w => {
      if (w.mode === "alley") {
        w.sprite.y += w.speed * w.dir;
        if (w.dir > 0 && w.sprite.y >= (w.maxY ?? H)) {
          w.dir = -1; w.sprite.play(`char_${w.charKey}_walk_up`);
        } else if (w.dir < 0 && w.sprite.y <= (w.minY ?? 0)) {
          w.dir = 1; w.sprite.play(`char_${w.charKey}_walk_down`);
        }
      } else {
        w.sprite.x += w.speed * w.dir;
        if (w.dir > 0 && w.sprite.x >= (w.maxX ?? W)) {
          w.dir = -1; w.sprite.play(`char_${w.charKey}_walk_left`);
        } else if (w.dir < 0 && w.sprite.x <= (w.minX ?? 0)) {
          w.dir = 1; w.sprite.play(`char_${w.charKey}_walk_right`);
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // 전체 톤 오버레이 (저녁/밤)
  // ══════════════════════════════════════════════════════════
  private applyTint() {
    if (this.isNight) {
      const overlay = this.add.graphics().setDepth(150);
      overlay.fillStyle(0x000033, 0.4);
      overlay.fillRect(0, 0, W, H);
    } else if (this.isEvening) {
      const overlay = this.add.graphics().setDepth(150);
      overlay.fillStyle(0xff7040, 0.15);
      overlay.fillRect(0, 0, W, H);
    }
  }

  // ══════════════════════════════════════════════════════════
  // 날씨
  // ══════════════════════════════════════════════════════════
  private initWeather() {
    const wc = this.weatherCode;
    const isRain = (wc >= 51 && wc <= 82) || wc >= 95;
    const isSnow = wc >= 71 && wc <= 77;
    if (isRain) for (let i = 0; i < 50; i++) this.rainDrops.push({
      x: Math.random() * W, y: Math.random() * H, speed: 2.5 + Math.random() * 2, len: 6 + Math.random() * 5 });
    if (isSnow) for (let i = 0; i < 40; i++) this.snowFlakes.push({
      x: Math.random() * W, y: Math.random() * H, speed: 0.3 + Math.random() * 0.4,
      size: 1 + Math.random() * 1.5, dx: (Math.random() - 0.5) * 0.4 });
  }

  private createReturnButton() {
    const bw = 140, bh = 34;
    const bx = 16, by = 16;
    const bg = this.add.graphics().setDepth(250);
    bg.fillStyle(0x1a1a2e, 0.92); bg.fillRoundedRect(bx, by, bw, bh, 6);
    bg.lineStyle(1.5, 0xf5c842, 0.9); bg.strokeRoundedRect(bx, by, bw, bh, 6);
    const btn = this.add.text(bx + bw / 2, by + bh / 2, "사무실로", {
      fontSize: "14px", fontFamily: FONT, color: "#f5c842",
      fontStyle: "700", resolution: DPR * 3,
    }).setOrigin(0.5).setDepth(251).setInteractive({ useHandCursor: true });
    btn.on("pointerdown", () => this.enterOffice());
  }

  private enterOffice() {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.notifyOutdoor(false);
      this.scene.stop("LoginScene");
      this.scene.resume("OfficeScene");
      const officeScene = this.scene.get("OfficeScene");
      if (officeScene) officeScene.cameras.main.fadeIn(300, 0, 0, 0);
    });
  }

  // ══════════════════════════════════════════════════════════
  // 캐릭터 애니메이션 (RMXP 표준: 4x4 프레임, 28×48)
  // 행: 0=down, 1=left, 2=right, 3=up
  // ══════════════════════════════════════════════════════════
  private ensureAnims() {
    // /assets/chars/char_${i}.png (128×192, 32×48 프레임, 4×4)
    // 행0=down, 1=left, 2=right, 3=up. walk 패턴 [0,1,0,3]
    CHAR_KEYS.forEach(key => {
      const k = `char_${key}`;
      const cols = 4;
      const dirs: [string, number][] = [
        ["walk_down", 0], ["walk_left", 1], ["walk_right", 2], ["walk_up", 3],
      ];
      dirs.forEach(([name, row]) => {
        const animKey = `${k}_${name}`;
        if (this.anims.exists(animKey)) return;
        const base = row * cols;
        this.anims.create({
          key: animKey,
          frames: [base, base + 1, base, base + 3].map(f => ({ key: k, frame: f })),
          frameRate: 6, repeat: -1,
        });
      });
    });
  }

  update() {
    if (!this.particleG?.active) return;
    if (this.rainDrops.length === 0 && this.snowFlakes.length === 0) return;
    this.particleG.clear();
    this.rainDrops.forEach(d => {
      this.particleG.lineStyle(1, 0x8ab8d8, 0.5);
      this.particleG.lineBetween(d.x, d.y, d.x - 1, d.y + d.len);
      d.y += d.speed; d.x -= 0.3;
      if (d.y > H) { d.y = -d.len; d.x = Math.random() * W; }
    });
    this.snowFlakes.forEach(f => {
      this.particleG.fillStyle(0xeeeeff, 0.75);
      this.particleG.fillCircle(f.x, f.y, f.size);
      f.y += f.speed; f.x += f.dx + Math.sin(f.y * 0.05) * 0.25;
      if (f.y > H) { f.y = -4; f.x = Math.random() * W; }
    });
  }
}
