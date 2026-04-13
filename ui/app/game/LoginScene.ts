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
  // 뒷줄 5채 — 건물 128px wide 기준 겹침 없이 재배치
  { x: 100, y: BACK_ROW_BOTTOM_Y, key: "palet_red" },
  { x: 270, y: BACK_ROW_BOTTOM_Y, key: "palet_green" },
  { x: 480, y: BACK_ROW_BOTTOM_Y, key: "city_hq", isHQ: true },
  { x: 695, y: BACK_ROW_BOTTOM_Y, key: "palet_blue" },
  { x: 865, y: BACK_ROW_BOTTOM_Y, key: "city_purple" },
  // 앞줄: 마트(좌) + 공원(중) + 카페(우)
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
    const v = "v4";
    // Bourg Palette (FRLG 정식) 깨끗히 crop 된 집 3채
    ["red", "green", "blue"].forEach(c => {
      const k = `palet_${c}`;
      if (!this.textures.exists(k)) this.load.image(k, `/assets/extracted/house_${c}_palet.png?${v}`);
    });
    // HGSS 에셋 (HQ + purple variation + mart)
    if (!this.textures.exists("city_purple")) this.load.image("city_purple", `/assets/buildings/house_purple.png?${v}`);
    if (!this.textures.exists("city_mart")) this.load.image("city_mart", `/assets/extracted/house_mart_clean.png?${v}`);
    if (!this.textures.exists("city_hq")) this.load.image("city_hq", `/assets/buildings/hq.png?${v}`);
    // 폴백 원본 (main_1f 만 사용)
    if (!this.textures.exists("bld_main_1f")) this.load.image("bld_main_1f", `/assets/original/buildings/main_1f.png?${v}`);
    // Bourg Palette 소품 타일
    ["tile_fence_h", "tile_signpost", "tile_bush_small", "tile_rock"].forEach(n => {
      if (!this.textures.exists(n)) this.load.image(n, `/assets/extracted/${n}.png?${v}`);
    });
    // 타일 (그라운드 + fountain + HQ 광장 마감)
    ["road", "road_line", "sidewalk", "grass_green", "fountain", "floor_marble"].forEach(n => {
      if (!this.textures.exists(`tile_${n}`)) this.load.image(`tile_${n}`, `/assets/original/tiles/${n}.png?${v}`);
    });
    // 꽃 스캐터 + 라이트 그라스 (Pokemon Autotiles)
    ["flowers1", "flowers2", "light_grass"].forEach(n => {
      if (!this.textures.exists(`tile_${n}`)) this.load.image(`tile_${n}`, `/assets/extracted/${n}_tile.png?${v}`);
    });
    // 베리나무 (Pokemon Characters 에서 성숙 단계 crop)
    ["cheri", "bluk"].forEach(n => {
      const k = `berry_${n}`;
      if (!this.textures.exists(k)) this.load.image(k, `/assets/extracted/berrytree_${n}.png?${v}`);
    });
    // Props
    ["bench", "streetlight", "tree_spring", "tree_summer", "tree_autumn", "tree_winter",
     "potplant_0", "potplant_1", "potplant_2", "mailbox"].forEach(n => {
      if (!this.textures.exists(`prop_${n}`)) this.load.image(`prop_${n}`, `/assets/original/props/${n}.png?${v}`);
    });
    // Pokemon 오브젝트 나무 (Object tree 1/2 에서 frame 추출, 32×64)
    ["obj_tree_1a", "obj_tree_1b", "obj_tree_2a", "obj_tree_2b", "obj_bush_1", "obj_flower_1"].forEach(n => {
      if (!this.textures.exists(n)) this.load.image(n, `/assets/extracted/${n}.png?${v}`);
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
    // 잔디 타일 반복 + 라이트 그라스 패치 섞어 텍스처 다양화
    const tex = this.textures.get("tile_grass_green");
    const lgTex = this.textures.get("tile_light_grass");
    if (tex) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    if (lgTex) lgTex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    // 결정적 노이즈 (매번 같은 패턴) — 변수명 gseed/grand (아래 꽃 스캐터와 구분)
    let gseed = 13;
    const grand = () => { gseed = (gseed * 9301 + 49297) % 233280; return gseed / 233280; };
    for (let x = 0; x < W; x += TILE) {
      for (let y = 0; y < H; y += TILE) {
        const key = grand() < 0.18 ? "tile_light_grass" : "tile_grass_green";
        this.add.image(x, y, key)
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
    // 상단 띠(y=30-120) 제거 — 나무 라인과 엉킴 심함
    // 오직 하단/중앙 풀밭 구간만 (공원 x=384-576 피함)
    const safeZones: [number, number, number, number][] = [
      [0, 320, 140, 470],      // 좌측 풀밭 (mart 앞 건너편)
      [820, 320, 960, 470],    // 우측 풀밭
      [200, 340, 360, 430],    // 공원 좌측 풀밭 슬리버
      [600, 340, 760, 430],    // 공원 우측 풀밭 슬리버
    ];
    for (let i = 0; i < 22; i++) {
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

    // Pokemon 오브젝트 나무 — 32×64 기본, 캐릭(24px) 대비 자연스러운 비율
    // 상단 먼 나무 라인 (scale 0.9 → 29×58, HQ 간판 x=400~560 회피)
    [20, 70, 120, 170, 220, 270, 320, 640, 690, 740, 790, 840, 890, 940].forEach((tx, i) => {
      const key = i % 2 === 0 ? "obj_tree_1a" : "obj_tree_2a";
      this.add.image(tx, 38, key).setOrigin(0.5, 1).setScale(0.9).setDepth(1);
    });
    // 건물 사이 틈새 — 새 좌표 기준
    // palet_red 100 ±83 = 17-183, palet_green 270 ±83 = 187-353, HQ 480 ±108 = 372-588
    // palet_blue 695 ±83 = 612-778, purple 865 ±79 = 786-944
    // 간극: 183-187 (너무 좁음), 353-372, 588-612, 778-786
    const betweenSpots: [number, number, string][] = [
      [362, 230, "obj_tree_2a"],   // green-HQ 사이
      [600, 230, "obj_tree_1b"],   // HQ-blue 사이
      [782, 230, "obj_tree_1a"],   // blue-purple 사이
    ];
    betweenSpots.forEach(([tx, ty, k]) => {
      this.add.image(tx, ty, k).setOrigin(0.5, 1).setScale(1.2).setDepth(8);
    });
    // 전경 코너 나무 (scale 1.3 → 42×83, 얌전한 프레임)
    [12, 948].forEach(tx => {
      this.add.image(tx, H - 10, "obj_tree_1a").setOrigin(0.5, 1).setScale(1.3).setDepth(24);
    });

    // 부쉬 (scale 1.2 → 38×38)
    // 주의: HQ 광장 y=238~270, HQ 건물 x=372~588, front row 건물/공원 y=340~500 피함
    // 안전 영역: 뒷줄 건물 사이 풀밭 y=210~230, 하단 인도-공원 사이 y=460~490
    const bushSpots: [number, number][] = [
      // 새 건물 좌표 기준 틈새 (간극 183-187 미사용, 353-372, 588-612, 778-786)
      [360, 244],
      [600, 244],
      [782, 244],
      // 하단: 공원 밖(x=384-576 피함), mart 밖(80-260 피함), cafe 밖(756-884 피함)
      [300, 475],       // mart-공원 사이
      [620, 475],       // 공원-cafe 사이
      [700, 475],       // 공원-cafe 중간
      [60, 455],        // 좌외곽
      [920, 455],       // 우외곽
    ];
    bushSpots.forEach(([bx, by]) => {
      this.add.image(bx, by, "obj_bush_1").setOrigin(0.5, 1).setScale(1.2).setDepth(9);
    });

    // 화단 — 공원/건물 footprint 피해 풀밭에만 클러스터
    // 뒷줄 건물 사이 풀밭(y=210-240) + 하단 풀밭(y=450-485, 공원 x=384-576 피함)
    const flowerBeds: [number, number, number, number][] = [
      // [cx, cy, cols (음수=좌로), rows]
      [40, 460, 2, 2],        // 좌하단 외곽
      [920, 460, 2, 2],       // 우하단 외곽
      [160, 475, 3, 1],       // 하단 좌 (공원 밖)
      [780, 475, -3, 1],      // 하단 우
      [300, 475, 2, 1],       // 하단 중좌
      [620, 475, 2, 1],       // 하단 중우
    ];
    flowerBeds.forEach(([cx, cy, cols, rows]) => {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < Math.abs(cols); c++) {
          const sign = Math.sign(cols || 1);
          const fx = cx + sign * c * 16;
          const fy = cy + r * 16;
          const key = (r + c) % 2 === 0 ? "tile_flowers1" : "tile_flowers2";
          this.add.image(fx, fy, key)
            .setOrigin(0, 0).setScale(1).setDepth(7);
        }
      }
    });

    // 베리나무 장식 — 공원 주변, 건물 옆 등 (32×64)
    const berrySpots: [number, number, string][] = [
      [350, 470, "berry_cheri"],  // mart-park 간극 상단
      [610, 470, "berry_bluk"],   // park-cafe 간극 상단
      // 뒷줄 (y=220) 베리는 건물 footprint 겹쳐 제거
    ];
    berrySpots.forEach(([bx, by, key]) => {
      this.add.image(bx, by, key)
        .setOrigin(0.5, 1).setScale(1.2).setDepth(9);
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

    // 목재 울타리 — 화면 상단 경계 (먼 풀밭 끝)
    const fenceTex = this.textures.get("tile_fence_h");
    if (fenceTex) fenceTex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    for (let fx = 0; fx < W; fx += 96) {
      this.add.image(fx, 18, "tile_fence_h")
        .setOrigin(0, 0).setScale(1).setDepth(0);
    }

    // 바위 생략 — 베리나무·꽃밭과 z-depth 충돌 발생하여 제거 (decor 단순화)

    // 표지판 — 하단 인도 벤치 근처 (HQ 영역 피함)
    const signTex = this.textures.get("tile_signpost");
    if (signTex) signTex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.add.image(130, BOTTOM_SIDEWALK_Y - 4, "tile_signpost")
      .setOrigin(0.5, 1).setScale(1.3).setDepth(15);
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
        // Bourg Palette FRLG 정식 (CLEAN)
        palet_red: 1.3,        // 128×128 → 166×166 (half 83)
        palet_green: 1.3,      // 128×144 → 166×187 (half 83)
        palet_blue: 1.3,       // 128×128 → 166×166 (half 83)
        // HGSS
        city_hq: 1.5,          // 144×148 → 216×222
        city_purple: 1.1,      // 144×192 → 158×211
        city_mart: 0.7,        // 256×145 → 179×102 (앞줄용)
        // 폴백
        bld_main_1f: 2.0,      // 64×80 → 128×160
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
