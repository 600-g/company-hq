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
const CHAR_SCALE = 0.75;  // 도심 스케일 — 건물 대비 자연스러운 포켓몬 비율

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
  // 뒷줄 — HGSS 컬러 빌딩 5채 (좌→우, 높이 variation)
  { x: 85, y: BACK_ROW_BOTTOM_Y, key: "city_yellow" },
  { x: 225, y: BACK_ROW_BOTTOM_Y, key: "city_blue" },
  { x: 480, y: BACK_ROW_BOTTOM_Y, key: "city_hq", isHQ: true },
  { x: 700, y: BACK_ROW_BOTTOM_Y, key: "city_red" },
  { x: 870, y: BACK_ROW_BOTTOM_Y, key: "city_purple" },
  // 앞줄: 마트(좌 대형) + 공원(중) + 카페(우)
  { x: 170, y: FRONT_ROW_BOTTOM_Y, key: "city_mart" },
  { x: 480, y: FRONT_ROW_BOTTOM_Y, key: "park", isPark: true },
  { x: 820, y: FRONT_ROW_BOTTOM_Y, key: "bld_main_1f" },
];

interface Walker {
  sprite: Phaser.GameObjects.Sprite;
  charKey: string;
  speed: number;
  mode: "road" | "sidewalk" | "alley";
  dir: -1 | 1;
  minX?: number; maxX?: number;
  minY?: number; maxY?: number;
  pauseUntil?: number;  // ms 기준 일시정지 끝 시간
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
    const v = "v3";
    // HGSS 컬러 건물 (buildings/) — 메인 에셋
    const cityMap: Record<string, string> = {
      city_yellow: "house_yellow",
      city_blue: "house_blue",
      city_red: "house_red",
      city_purple: "house_purple",
      city_mart: "house_mart",
      city_hq: "hq",
    };
    Object.entries(cityMap).forEach(([k, f]) => {
      if (!this.textures.exists(k)) this.load.image(k, `/assets/buildings/${f}.png?${v}`);
    });
    // 보조 건물 (original/) — 앞줄 오른쪽
    if (!this.textures.exists("bld_main_1f")) {
      this.load.image("bld_main_1f", `/assets/original/buildings/main_1f.png?${v}`);
    }
    // 타일 (그라운드 + fountain + HQ 광장 마감)
    ["road", "road_line", "sidewalk", "grass_green", "fountain", "floor_marble"].forEach(n => {
      if (!this.textures.exists(`tile_${n}`)) this.load.image(`tile_${n}`, `/assets/original/tiles/${n}.png?${v}`);
    });
    // 꽃 스캐터 (Pokemon Autotiles 추출)
    ["flowers1", "flowers2"].forEach(n => {
      if (!this.textures.exists(`tile_${n}`)) this.load.image(`tile_${n}`, `/assets/extracted/${n}_tile.png?${v}`);
    });
    // Props
    ["bench", "streetlight", "tree_spring", "tree_summer", "tree_autumn", "tree_winter",
     "potplant_0", "potplant_1", "potplant_2", "mailbox"].forEach(n => {
      if (!this.textures.exists(`prop_${n}`)) this.load.image(`prop_${n}`, `/assets/original/props/${n}.png?${v}`);
    });
    // 나무 3사이즈 (원근감) — /trees/
    ["spring", "summer", "autumn", "winter", "evergreen"].forEach(s => {
      ["sm", "md", "lg"].forEach(sz => {
        const k = `tree2_${s}_${sz}`;
        if (!this.textures.exists(k)) this.load.image(k, `/assets/trees/tree_${s}_${sz}.png?${v}`);
      });
    });
    // 실제 담장 (scene edge)
    if (!this.textures.exists("wall_0")) this.load.image("wall_0", `/assets/walls/wall_0.png?${v}`);
    // NPC static 스프라이트 (첫 프레임만 사용, 장식용)
    for (let i = 1; i <= 10; i++) {
      const k = `npc_${String(i).padStart(2, "0")}`;
      if (!this.textures.exists(k)) {
        this.load.spritesheet(k, `/assets/npcs/${k}.png?${v}`, { frameWidth: 32, frameHeight: 48 });
      }
    }
    // 캐릭터 32×48 (OfficeScene과 동일 — /assets/chars/)
    CHAR_KEYS.forEach(n => {
      if (!this.textures.exists(`char_${n}`)) {
        this.load.spritesheet(`char_${n}`, `/assets/chars/char_${n}.png`, { frameWidth: 32, frameHeight: 48 });
      }
    });
    // 간판 windowskin (HGSS town sign)
    if (!this.textures.exists("sign_town")) {
      this.load.image("sign_town", "/assets/pokemon_assets/Windowskins/sign%20hgss%20town.png");
    }
  }

  create() {
    this.computeTimeTone();
    this.ensureAnims();
    this.drawGrassBackground();
    this.drawRoadAndSidewalk();
    this.drawHQPlaza();
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
    // 잔디 타일 반복 (16×16, 2x 스케일 = 32×32 화면)
    const tex = this.textures.get("tile_grass_green");
    if (tex) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    for (let x = 0; x < W; x += TILE) {
      for (let y = 0; y < H; y += TILE) {
        this.add.image(x, y, "tile_grass_green")
          .setOrigin(0, 0).setScale(TILE_SCALE).setDepth(0);
      }
    }
    // 꽃 스캐터 — 도로/공원/건물 바닥과 겹치지 않는 영역에만 (상단 잔디 + 앞줄 공간 사이)
    const f1 = this.textures.get("tile_flowers1");
    const f2 = this.textures.get("tile_flowers2");
    if (f1) f1.setFilter(Phaser.Textures.FilterMode.NEAREST);
    if (f2) f2.setFilter(Phaser.Textures.FilterMode.NEAREST);
    // 결정적 랜덤 (매번 같은 배치)
    let seed = 7;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const safeZones: [number, number, number, number][] = [
      // 상단 건물-화면상단 사이 얇은 풀밭 띠 (HQ 간판 피해 좌우로)
      [0, 30, 380, 120],
      [580, 30, 960, 120],
      // 건물 사이 가장자리 풀밭 (건물 렌더링 뒤로 가므로 depth 조절됨)
      [0, 180, 120, 250],
      [840, 180, 960, 250],
      // 앞줄 카페-공원 / 공원-main_1f 사이
      [220, 340, 400, 430],
      [560, 340, 740, 430],
    ];
    for (let i = 0; i < 45; i++) {
      const zone = safeZones[Math.floor(rand() * safeZones.length)];
      const fx = zone[0] + rand() * (zone[2] - zone[0]);
      const fy = zone[1] + rand() * (zone[3] - zone[1]);
      const key = rand() > 0.5 ? "tile_flowers1" : "tile_flowers2";
      this.add.image(fx, fy, key)
        .setOrigin(0, 0).setScale(1).setDepth(7);
    }
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
    // 중앙 점선 (road_line.png) — 간격 좁혀 차선감 강화
    const midY = ROAD_Y + Math.floor(ROAD_HEIGHT / 2) - TILE / 2;
    for (let x = 0; x < W; x += TILE) {
      if ((x / TILE) % 2 === 0) {
        this.add.image(x, midY, "tile_road_line").setOrigin(0, 0).setScale(TILE_SCALE).setDepth(6);
      }
    }
    // 도로 가장자리 흰 실선 (인도와 구분)
    const edgeG = this.add.graphics().setDepth(6);
    edgeG.fillStyle(0xffffff, this.isNight ? 0.4 : 0.75);
    edgeG.fillRect(0, ROAD_Y + 2, W, 2);
    edgeG.fillRect(0, ROAD_Y + ROAD_HEIGHT - 4, W, 2);

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
      // 골목-도로 횡단보도는 placeStreetFurniture() 에서 그림 (5줄 스트라이프)
    });
  }

  private placeStreetFurniture() {
    // 가로등 — 도로 위/아래/하단 3단으로 촘촘히 (~96px 간격)
    const lampXs = [40, 140, 240, 340, 540, 640, 740, 840, 920];
    lampXs.forEach(lx => {
      this.add.image(lx, ROAD_Y - TILE, "prop_streetlight")
        .setOrigin(0.5, 1).setScale(TILE_SCALE).setDepth(15);
      this.add.image(lx, BOTTOM_SIDEWALK_Y, "prop_streetlight")
        .setOrigin(0.5, 1).setScale(TILE_SCALE).setDepth(15);
    });

    // 가로등 — HQ 앞 광장 양쪽 (강조)
    [420, 540].forEach(lx => {
      this.add.image(lx, ROAD_Y - TILE, "prop_streetlight")
        .setOrigin(0.5, 1).setScale(TILE_SCALE * 1.1).setDepth(15);
    });

    // 원근감 나무: 뒷벽(상단, sm) + 건물 틈새(md) + 전경 코너(lg)
    const season = this.getSeason();
    // 상단 먼 나무 라인 (sm) — HQ 간판(x~400~560) 피해 배치
    [30, 80, 130, 180, 260, 310, 630, 680, 730, 830, 880, 930].forEach(tx => {
      this.add.image(tx, 30, `tree2_${season}_sm`).setOrigin(0.5, 1).setScale(2).setDepth(1);
    });
    // evergreen 섞어 뉘앙스 (sm)
    [55, 105, 855, 905].forEach(tx => {
      this.add.image(tx, 35, `tree2_evergreen_sm`).setOrigin(0.5, 1).setScale(2).setDepth(1);
    });
    // 건물 사이 md 나무
    const medSpots: [number, number][] = [[18, 220], [165, 220], [795, 220], [942, 220]];
    medSpots.forEach(([tx, ty]) => {
      this.add.image(tx, ty, `tree2_${season}_md`).setOrigin(0.5, 1).setScale(2).setDepth(8);
    });
    // 화면 하단 코너 — lg 나무 (전경)
    [30, 940].forEach(tx => {
      this.add.image(tx, H - 2, `tree2_${season}_lg`).setOrigin(0.5, 1).setScale(1.8).setDepth(25);
    });

    // 정적 NPC 3명 — 벤치·마트 앞·카페 앞 (frame 0 남향, 움직이지 않음)
    const staticNpcs: { x: number; y: number; key: string; frame: number }[] = [
      { x: 245, y: BOTTOM_SIDEWALK_Y - 2, key: "npc_03", frame: 0 },   // 벤치 근처
      { x: 170, y: FRONT_ROW_BOTTOM_Y + 14, key: "npc_05", frame: 0 }, // 마트 앞
      { x: 820, y: FRONT_ROW_BOTTOM_Y + 14, key: "npc_07", frame: 0 }, // 카페 앞
    ];
    staticNpcs.forEach(n => {
      this.add.sprite(n.x, n.y, n.key, n.frame)
        .setOrigin(0.5, 1).setScale(0.75).setDepth(28);
    });

    // 우편함 2곳 (HQ 옆 + cafe 앞)
    this.add.image(410, ROAD_Y - TILE, "prop_mailbox")
      .setOrigin(0.5, 1).setScale(TILE_SCALE).setDepth(15);
    this.add.image(100, BOTTOM_SIDEWALK_Y, "prop_mailbox")
      .setOrigin(0.5, 1).setScale(TILE_SCALE).setDepth(15);

    // 인도 벤치 — 하단 인도 좌·우 2곳
    [240, 720].forEach(bx => {
      this.add.image(bx, BOTTOM_SIDEWALK_Y - 4, "prop_bench")
        .setOrigin(0.5, 1).setScale(1.7).setDepth(14);
    });

    // 화분 — 상점 입구/광장 가장자리 따라 반복 (3종 로테이션)
    const potXs = [40, 90, 860, 910];  // 좌·우 상점 입구 앞
    potXs.forEach((px, i) => {
      const key = `prop_potplant_${i % 3}`;
      this.add.image(px, BOTTOM_SIDEWALK_Y, key)
        .setOrigin(0.5, 1).setScale(1.6).setDepth(14);
    });
    // 도로 위 인도 가장자리 — 건물 사이 접합부 화분
    [115, 235, 375, 575, 695, 870].forEach((px, i) => {
      const key = `prop_potplant_${i % 3}`;
      this.add.image(px, ROAD_Y - TILE + 2, key)
        .setOrigin(0.5, 1).setScale(1.3).setDepth(13);
    });

    // 횡단보도 추가 — 세로 골목 2곳
    const cg = this.add.graphics().setDepth(7);
    cg.fillStyle(0xffffff, this.isNight ? 0.55 : 0.8);
    this.ALLEY_XS.forEach(ax => {
      for (let i = 0; i < 5; i++) {
        cg.fillRect(ax - 20, ROAD_Y + 8 + i * 10, 40, 4);
      }
    });
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
        // HGSS 컬러 건물 (원본 사이즈 활용)
        city_hq: 1.5,          // HQ 랜드마크 (216×222)
        city_blue: 1.0,        // 144×190
        city_red: 1.0,         // 144×144
        city_purple: 1.0,      // 144×192
        city_yellow: 1.0,      // 112×145
        city_mart: 0.7,        // 256×145 → 179×102 (앞줄용)
        // 보조 건물
        bld_main_1f: 2.0,
      };
      const scale = baseScale[slot.key] || BUILDING_SCALE;
      const img = this.add.image(slot.x, slot.y, slot.key)
        .setOrigin(0.5, 1).setScale(scale).setDepth(10);
      const tex = this.textures.get(slot.key);
      if (tex) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      // 그림자
      const sh = this.add.graphics().setDepth(9);
      sh.fillStyle(0x000000, 0.22);
      sh.fillEllipse(slot.x, slot.y + 2, img.displayWidth * 0.6, 8);

      // 상점류 어닝 + 간판 — 건물 하단 출입구 위에 굵은 줄무늬 + 이름
      // HGSS 건물은 facade 가 이미 풍부해 어닝 생략, 보조 cafe 에만 간판
      const awnings: Record<string, { colors: [number, number]; label: string }> = {
        bld_main_1f: { colors: [0xd68a40, 0xfff0c2], label: "CAFE" },
      };
      const aw = awnings[slot.key];
      if (aw) {
        const aY = slot.y - img.displayHeight * 0.28;
        const aW = img.displayWidth * 0.78;
        const aH = 11;
        const ag = this.add.graphics().setDepth(11);
        // 줄무늬 6줄 (굵게)
        const stripeW = aW / 6;
        for (let s = 0; s < 6; s++) {
          ag.fillStyle(s % 2 === 0 ? aw.colors[0] : aw.colors[1], 1);
          ag.fillRect(slot.x - aW / 2 + s * stripeW, aY, stripeW, aH);
        }
        // 어닝 하단 어두운 엣지
        ag.fillStyle(0x000000, 0.35);
        ag.fillRect(slot.x - aW / 2, aY + aH, aW, 2);
        // 상점 간판 (어닝 위 텍스트)
        this.add.text(slot.x, aY - 2, aw.label, {
          fontSize: "8px", fontFamily: FONT, color: "#ffffff",
          fontStyle: "700", resolution: DPR * 4,
          stroke: "#000000", strokeThickness: 2,
        }).setOrigin(0.5, 1).setDepth(12);
      }

      if (slot.isHQ) {
        // HQ 부드러운 빛 배경 (건물 바로 뒤)
        const glow = this.add.graphics().setDepth(9);
        glow.fillStyle(0xfff0a0, 0.12);
        glow.fillCircle(slot.x, slot.y - img.displayHeight / 2, img.displayWidth * 0.8);

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
    // 타일 그리드 정렬 (192 = 6 tiles × 32px)
    const cols = 6, rows = 6;
    const w = cols * TILE, h = rows * TILE;
    const x0 = Math.round(cx - w / 2);
    const y0 = Math.round(baseY - h);

    // 산책로 +자 (sidewalk 타일). 중앙 2타일 폭
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isCenterV = c === Math.floor(cols / 2) - 1 || c === Math.floor(cols / 2);
        const isCenterH = r === Math.floor(rows / 2) - 1 || r === Math.floor(rows / 2);
        if (isCenterV || isCenterH) {
          this.add.image(x0 + c * TILE, y0 + r * TILE, "tile_sidewalk")
            .setOrigin(0, 0).setScale(TILE_SCALE).setDepth(2);
        }
      }
    }

    // 외곽 코너에만 화분 (과밀 방지)
    const potKey = "prop_potplant_1";
    const corners: [number, number][] = [
      [x0 + 10, y0 + 10], [x0 + w - 10, y0 + 10],
      [x0 + 10, y0 + h - 2], [x0 + w - 10, y0 + h - 2],
    ];
    corners.forEach(([px, py]) => {
      this.add.image(px, py, potKey).setOrigin(0.5, 1).setScale(1.6).setDepth(9);
    });

    // 나무 — 계절 나무 4그루 (외곽 4코너, 분수 가리지 않게)
    const season = this.getSeason();
    const treeKey = `prop_tree_${season}`;
    const treeSpots: [number, number][] = [
      [x0 + TILE * 0.5, y0 + TILE * 1.5],
      [x0 + w - TILE * 0.5, y0 + TILE * 1.5],
      [x0 + TILE * 0.5, y0 + h - TILE * 0.5],
      [x0 + w - TILE * 0.5, y0 + h - TILE * 0.5],
    ];
    treeSpots.forEach(([tx, ty]) => {
      this.add.image(tx, ty, treeKey).setOrigin(0.5, 1).setScale(TILE_SCALE).setDepth(11);
    });

    // 벤치 2개 (+자 교차로 상하, 중앙 path 옆)
    this.add.image(cx - TILE * 2, y0 + h / 2 + TILE / 2, "prop_bench")
      .setOrigin(0.5, 1).setScale(1.5).setDepth(11);
    this.add.image(cx + TILE * 2, y0 + h / 2 + TILE / 2, "prop_bench")
      .setOrigin(0.5, 1).setScale(1.5).setDepth(11);

    // 중앙 분수 — fountain.png 에셋 사용 (32x64 → 2x = 64x128)
    const fTex = this.textures.get("tile_fountain");
    if (fTex) fTex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.add.image(cx, y0 + h / 2 + TILE / 2, "tile_fountain")
      .setOrigin(0.5, 1).setScale(2).setDepth(12);
    // 분수 주변 부드러운 하이라이트 (물 광채)
    const fg = this.add.graphics().setDepth(11);
    fg.fillStyle(0xbaeaff, 0.15);
    fg.fillCircle(cx, y0 + h / 2, 28);
  }

  private drawHQPlaza() {
    // HQ 앞 광장 — 도로 위 인도 (sidewalkTop) 구간 중 HQ 폭 만큼 floor_marble 로 교체
    // 원래 sidewalk 는 depth=5, 마블은 depth=6 로 덮어씀
    const mTex = this.textures.get("tile_floor_marble");
    if (mTex) mTex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const cols = 6;
    const plazaX0 = 480 - (cols * TILE) / 2;   // x: 384 ~ 576
    const plazaY = ROAD_Y - TILE;              // y: 238 (sidewalkTop)
    for (let c = 0; c < cols; c++) {
      this.add.image(plazaX0 + c * TILE, plazaY, "tile_floor_marble")
        .setOrigin(0, 0).setScale(TILE_SCALE).setDepth(6);
    }
    // 광장 테두리만 (HQ 에셋에 이미 노란 문 있어 graphics 문 표식 생략)
    const g = this.add.graphics().setDepth(7);
    g.lineStyle(3, 0xd9a838, 0.8);
    g.strokeRect(plazaX0 + 1, plazaY + 1, cols * TILE - 2, TILE - 2);
  }


  private drawHQSign() {
    const x = 480;
    const y = 46;
    // HGSS 타운 간판 에셋 (96×48 → 2.4x = 230×115 로 가로로 확장 불가, 세로 스케일 줄여 배너처럼)
    const signTex = this.textures.get("sign_town");
    if (signTex) signTex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const sign = this.add.image(x, y, "sign_town")
      .setOrigin(0.5, 0.5).setDepth(50);
    sign.setScale(2.6, 1.2);  // 가로 확장
    this.add.text(x, y - 1, "두근 컴퍼니", {
      fontSize: "20px", fontFamily: FONT, color: "#2a1a08",
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
    // 인도 위에서만 보행 (도로는 차선용)
    // 상단 인도 (도로 바로 위 sidewalk 타일 중심)
    for (let i = 0; i < 2; i++) this.spawnRoadWalker(ROAD_Y - 10, i);
    // 하단 인도 (도로 바로 아래)
    for (let i = 0; i < 2; i++) this.spawnRoadWalker(ROAD_Y + ROAD_HEIGHT + 26, i + 2);
    // 최하단 인도
    for (let i = 0; i < 2; i++) this.spawnRoadWalker(BOTTOM_SIDEWALK_Y + 14, i + 4);

    // 세로 골목 위↔아래 보행
    this.ALLEY_XS.forEach((ax, idx) => {
      const charKey = CHAR_KEYS[(idx + 6) % CHAR_KEYS.length];
      const dir: 1 | -1 = Math.random() > 0.5 ? 1 : -1;
      // 도로+건물 영역 피하고 건물 아래 인도 사이만
      const startY = ROAD_Y + ROAD_HEIGHT + 10 + Math.random() * (BOTTOM_SIDEWALK_Y - ROAD_Y - ROAD_HEIGHT - 30);
      const sp = this.add.sprite(ax, startY, `char_${charKey}`, 0)
        .setOrigin(0.5, 1).setScale(CHAR_SCALE).setDepth(30);
      sp.play(dir > 0 ? `char_${charKey}_walk_down` : `char_${charKey}_walk_up`);
      this.walkers.push({
        sprite: sp, charKey, speed: 0.5 + Math.random() * 0.3,
        mode: "alley", dir,
        minY: ROAD_Y + ROAD_HEIGHT + 10,
        maxY: BOTTOM_SIDEWALK_Y + 20,
      });
    });
  }

  private spawnRoadWalker(laneY: number, idx: number) {
    const charKey = CHAR_KEYS[idx % CHAR_KEYS.length];
    const dir: 1 | -1 = idx % 2 === 0 ? 1 : -1;
    // HQ 앞(x=440~520) 회피하여 시작
    let startX = 40 + Math.random() * (W - 80);
    if (startX > 420 && startX < 540) startX += 160 * (startX < 480 ? -1 : 1);
    const sp = this.add.sprite(startX, laneY, `char_${charKey}`, 0)
      .setOrigin(0.5, 1).setScale(CHAR_SCALE).setDepth(30);
    sp.play(dir > 0 ? `char_${charKey}_walk_right` : `char_${charKey}_walk_left`);
    this.walkers.push({
      sprite: sp, charKey, speed: 0.6 + Math.random() * 0.5,
      mode: "road", dir, minX: 20, maxX: W - 20,
    });
  }

  private moveWalkers() {
    const now = this.time.now;
    this.walkers.forEach(w => {
      // 랜덤 일시정지 (걷다 잠시 서기)
      if (w.pauseUntil && now < w.pauseUntil) return;
      if (!w.pauseUntil && Math.random() < 0.008) {
        w.pauseUntil = now + 500 + Math.random() * 1500;
        return;
      }
      w.pauseUntil = undefined;
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
    const bx = 16, by = 16;
    // HGSS town sign 를 버튼 배경으로 재활용 (통일성)
    const sign = this.add.image(bx, by, "sign_town")
      .setOrigin(0, 0).setScale(1.5, 0.8).setDepth(250);
    const cx = bx + sign.displayWidth / 2;
    const cy = by + sign.displayHeight / 2;
    const btn = this.add.text(cx, cy, "사무실로", {
      fontSize: "14px", fontFamily: FONT, color: "#2a1a08",
      fontStyle: "700", resolution: DPR * 3,
    }).setOrigin(0.5).setDepth(251).setInteractive({ useHandCursor: true });
    btn.on("pointerdown", () => this.enterOffice());
    // 클릭존을 sign 전체로 확장
    sign.setInteractive({ useHandCursor: true });
    sign.on("pointerdown", () => this.enterOffice());
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
