/**
 * 타이쿤 사무실 씬
 * - 층 시스템 (1F~3F 전환)
 * - 상단 통창 + 날씨
 * - 2x2 팀 배치, 그리드 겹침 방지
 * - 콤팩트 캐릭터
 */

import * as Phaser from "phaser";
import { preloadAssets, registerCharAnims, createCustomFurniture } from "./sprites";

const TILE = 32;
const COLS = 26;
const ROWS = 18;
const WORLD_W = COLS * TILE;
const WORLD_H = ROWS * TILE;
const SCALE = 1.5;
const WALL_H = 3; // 벽(통창) 높이 — 3칸으로 확장 (96px)
const DPR = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 3) : 2;
const FONT = "'Pretendard Variable', Pretendard, -apple-system, sans-serif";

interface TeamConfig {
  id: string; name: string; emoji: string;
  chars: number[]; gridX: number; gridY: number; gridW: number; gridH: number;
}

const ALL_FLOORS: Record<number, TeamConfig[]> = {
  1: [
    { id: "cpo-claude", name: "CPO", emoji: "🧠", chars: [1], gridX: 13, gridY: 10, gridW: 2, gridH: 2 },
    { id: "trading-bot", name: "매매봇", emoji: "🤖", chars: [0, 3, 1, 2], gridX: 1, gridY: 4, gridW: 4, gridH: 4 },
    { id: "date-map", name: "데이트지도", emoji: "🗺️", chars: [1, 2, 3, 0], gridX: 6, gridY: 4, gridW: 4, gridH: 4 },
    { id: "claude-biseo", name: "클로드비서", emoji: "🤵", chars: [2, 0, 1, 3], gridX: 11, gridY: 4, gridW: 4, gridH: 4 },
    { id: "ai900", name: "AI900", emoji: "📚", chars: [3, 1, 0, 2], gridX: 16, gridY: 4, gridW: 4, gridH: 4 },
    { id: "cl600g", name: "CL600G", emoji: "⚡", chars: [0, 2, 3, 1], gridX: 3, gridY: 10, gridW: 4, gridH: 4 },
    { id: "design-team", name: "디자인팀", emoji: "🎨", chars: [1, 3, 0, 2], gridX: 8, gridY: 10, gridW: 4, gridH: 4 },
  ],
  2: [],
  3: [],
};

interface MemberSprite { char: Phaser.GameObjects.Sprite; charIdx: number; baseX: number; baseY: number; bubble?: Phaser.GameObjects.Graphics; }
interface TeamGroup {
  container: Phaser.GameObjects.Container; members: MemberSprite[];
  label: Phaser.GameObjects.Text; highlight: Phaser.GameObjects.Rectangle;
  config: TeamConfig; gridX: number; gridY: number; prevGridX: number; prevGridY: number;
  workGlow?: Phaser.GameObjects.Graphics;
}

export default class OfficeScene extends Phaser.Scene {
  private teamGroups: Map<string, TeamGroup> = new Map();
  private workingSet: Set<string> = new Set();
  private onTeamClick?: (id: string, screenX?: number, screenY?: number) => void;
  private dragTarget: TeamGroup | null = null;
  private dragOffX = 0; private dragOffY = 0;
  private dragStartX = 0; private dragStartY = 0;
  private overlapRect: Phaser.GameObjects.Rectangle | null = null;
  private grid: boolean[][] = [];
  private currentFloor = 1;
  private floorLabel!: Phaser.GameObjects.Text;
  private envGroup!: Phaser.GameObjects.Group;
  private weatherCode = 0;
  private particleGraphics: Phaser.GameObjects.Graphics | null = null;
  private rainDrops: { x: number; y: number; speed: number; len: number }[] = [];
  private snowFlakes: { x: number; y: number; speed: number; size: number; dx: number }[] = [];
  private thunderTimer = 60;

  constructor() { super({ key: "OfficeScene" }); }

  init(data: { onTeamClick?: (id: string, screenX?: number, screenY?: number) => void; weatherCode?: number }) {
    this.onTeamClick = data.onTeamClick;
    this.weatherCode = data.weatherCode ?? 0;
  }

  preload() { preloadAssets(this); }

  create() {
    registerCharAnims(this);
    createCustomFurniture(this);
    this.envGroup = this.add.group();

    // 스프라이트 텍스처 픽셀 필터 (텍스트는 선명)
    const nearest = Phaser.Textures.LINEAR; // fallback
    const keys = ["desk_front","desk_side","pc_on1","pc_on2","pc_on3","pc_off","pc_back",
      "chair_front","chair_back","plant","large_plant","bookshelf","cactus","bin","pot",
      "floor_tile","wall_tile","whiteboard","coffee_table",
      "hanging_plant","large_painting","small_painting","small_painting_2","clock","plant_2",
      "sofa_front","small_table",
      "o_laptop","o_monitor","o_monitor_back","o_desk","o_desk_side","o_chair_front","o_chair_back",
      "o_bookshelf","o_server_rack","o_whiteboard","o_water_cooler","o_coffee","o_clock","o_ac","o_fire_ext"];
    for (let i = 0; i <= 5; i++) keys.push(`char_${i}`);
    keys.forEach(k => {
      const tex = this.textures.get(k);
      if (tex && tex.key !== "__MISSING") {
        tex.setFilter(0); // 0 = NEAREST
      }
    });

    this.buildFloor(this.currentFloor);

    // 겹침 표시
    this.overlapRect = this.add.rectangle(0, 0, 0, 0, 0xff0000, 0.3)
      .setStrokeStyle(2, 0xff0000, 0.8).setVisible(false).setDepth(100);

    // 엘리베이터 (우하단)
    this.drawElevator();

    // 카메라
    // 경계 여유 32px: 가장자리 팀 캐릭터 컬링 방지
    this.cameras.main.setBounds(-32, -32, WORLD_W + 64, WORLD_H + 64);
    this.cameras.main.setBackgroundColor(0x1a1a2e);

    // 입력
    this.input.on("pointerdown", this.onDown, this);
    this.input.on("pointermove", this.onMove, this);
    this.input.on("pointerup", this.onUp, this);

    // 랜덤 움직임
    this.time.addEvent({ delay: 3500, loop: true, callback: () => this.randomMove() });
  }

  // ═══════════════════════════════
  // 층 구축
  // ═══════════════════════════════

  private buildFloor(floor: number) {
    // 기존 제거
    this.envGroup.clear(true, true);
    this.teamGroups.forEach(tg => tg.container.destroy());
    this.teamGroups.clear();

    // 그리드 초기화
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < WALL_H; y++) this.grid[y][x] = true;
    }

    // ── 사무실 바닥 (다크 우드 + 구역별 차별화) ──
    const floorG = this.add.graphics();
    const fy = WALL_H * TILE;
    const fh = (ROWS - WALL_H - 3) * TILE; // 복도 제외
    const srvX = (COLS - 5) * TILE;
    const plankW = 48;
    const plankH = 16;

    // 메인 영역: 어두운 원목 바닥 (헤링본 느낌)
    for (let y = fy; y < fy + fh; y += plankH) {
      for (let x = 0; x < srvX; x += plankW) {
        const row = Math.floor((y - fy) / plankH);
        const col = Math.floor(x / plankW);
        const offset = (row % 2) * (plankW / 2); // 엇갈림
        const px = x + offset;
        // 나무결 색상 변화
        const hash = ((col * 2654435761 + row * 340573321) >>> 0) % 100;
        const baseColor = hash < 40 ? 0x3a3028 : hash < 70 ? 0x3e342a : hash < 90 ? 0x36302a : 0x423830;
        floorG.fillStyle(baseColor, 1);
        floorG.fillRect(px, y, plankW, plankH);
        // 나무결 디테일
        floorG.fillStyle(0xffffff, 0.03);
        floorG.fillRect(px + 2, y + 3, plankW - 4, 1);
        floorG.fillRect(px + 5, y + 8, plankW - 10, 1);
        floorG.fillRect(px + 3, y + 12, plankW - 6, 1);
        // 나무 옹이 (랜덤)
        if (hash % 17 === 0) {
          floorG.fillStyle(0x2a2420, 0.4);
          floorG.fillCircle(px + plankW / 2, y + plankH / 2, 2);
        }
        // 판자 경계
        floorG.fillStyle(0x252018, 0.5);
        floorG.fillRect(px + plankW - 1, y, 1, plankH);
        floorG.fillRect(px, y + plankH - 1, plankW, 1);
        // 상단 하이라이트
        floorG.fillStyle(0xffffff, 0.02);
        floorG.fillRect(px, y, plankW, 1);
      }
    }

    // 팀 구역별 러그/카펫 (각 팀 위치에 미묘한 영역 표시)
    const teamZones = ALL_FLOORS[floor] || [];
    const rugColors = [0x4a3a5a, 0x3a4a5a, 0x5a3a3a, 0x3a5a4a, 0x4a4a3a, 0x3a3a5a, 0x5a4a3a];
    teamZones.forEach((t, idx) => {
      if (t.chars.length <= 1) return; // 솔로(CPO)는 러그 없음
      const rx = t.gridX * TILE + 4;
      const ry = t.gridY * TILE + 4;
      const rw = t.gridW * TILE - 8;
      const rh = t.gridH * TILE - 8;
      const rugColor = rugColors[idx % rugColors.length];
      // 러그 본체
      floorG.fillStyle(rugColor, 0.12);
      floorG.fillRoundedRect(rx, ry, rw, rh, 4);
      // 러그 테두리
      floorG.lineStyle(1, rugColor, 0.18);
      floorG.strokeRoundedRect(rx + 3, ry + 3, rw - 6, rh - 6, 3);
    });

    this.envGroup.add(floorG);

    // ── 통창 ──
    this.drawPanoramaWindow();

    // ── 서버실 ──
    this.drawServerRoom();

    // ── 하단 복도 ──
    this.drawCorridor();

    // ── 사무실 디테일 장식 ──
    this.drawOfficeDetails();

    // 팀 배치 (저장된 위치 있으면 사용)
    const teams = ALL_FLOORS[floor] || [];
    const saved = this.loadPositions();
    teams.forEach(t => {
      if (saved && saved[t.id]) {
        t.gridX = saved[t.id].gx;
        t.gridY = saved[t.id].gy;
      }
      this.createTeamGroup(t);
      this.occupyGrid(t.gridX, t.gridY, t.gridW, t.gridH, true);
    });
  }

  private drawPanoramaWindow() {
    const g = this.add.graphics();
    const wh = WALL_H * TILE; // 96px
    const now = new Date();
    const hr  = now.getHours() + now.getMinutes() / 60;
    const mon = now.getMonth() + 1; // 1-12
    const wc  = this.weatherCode;

    const isRain     = (wc >= 51 && wc <= 67) || (wc >= 80 && wc <= 82);
    const isSnow     = (wc >= 71 && wc <= 77) || (wc >= 85 && wc <= 86);
    const isFog      = wc === 45 || wc === 48;
    const isCloudy   = wc >= 1;
    const isOvercast = wc === 3;
    const isThunder  = wc >= 95;
    const isNight    = hr >= 21 || hr < 5;
    const isSunset   = hr >= 17 && hr < 20;

    // ── 하늘 그라디언트 ─────────────────────────────────────────
    let skyT: number, skyB: number;
    if      (hr >= 21 || hr < 5)  { skyT = 0x050918; skyB = 0x0e1a30; }  // 밤
    else if (hr < 5.5)            { skyT = 0x0a0d20; skyB = 0x1a1838; }  // 새벽 시작
    else if (hr < 6)              { skyT = 0x101830; skyB = 0x6a3040; }  // 새벽 → 일출
    else if (hr < 6.5)            { skyT = 0x182848; skyB = 0xb05838; }  // 일출
    else if (hr < 7.5)            { skyT = 0x2858a0; skyB = 0xd88850; }  // 일출 → 아침
    else if (hr < 9)              { skyT = 0x1e5ab0; skyB = 0x8ac0f0; }  // 아침
    else if (hr < 17) {
      if (isRain || isThunder)       { skyT = 0x3a4050; skyB = 0x5a6068; }
      else if (isOvercast)           { skyT = 0x5a6070; skyB = 0x8a9098; }
      else if (isSnow)               { skyT = 0x7a8090; skyB = 0xa0a8b0; }
      else                           { skyT = 0x1e60b0; skyB = 0x7ac8f8; }  // 낮
    }
    else if (hr < 18)             { skyT = 0x2a50a0; skyB = 0xe0a060; }  // 오후 → 석양
    else if (hr < 19)             { skyT = 0x2a2058; skyB = 0xd06848; }  // 석양
    else if (hr < 20)             { skyT = 0x151838; skyB = 0x6a2a38; }  // 석양 → 황혼
    else if (hr < 21)             { skyT = 0x0a0e20; skyB = 0x281830; }  // 황혼
    else                          { skyT = 0x050918; skyB = 0x0e1a30; }  // 밤

    g.fillGradientStyle(skyT, skyT, skyB, skyB, 1);
    g.fillRect(0, 0, WORLD_W, wh);

    // ── 별 & 달 ─────────────────────────────────────────────────
    if (isNight || hr < 7) {
      const sa = isNight ? 0.85 : 0.28;
      const ss = [23,67,113,157,193,241,277,313,383,419,457,523,563,601,641,677,
                  751,787,857,907,977,1049,1103,1153,1201,1259,1303,1361,1409,1453];
      ss.forEach(s => {
        const sx = (s * 31337) % (WORLD_W - 8) + 4;
        const sy = 4 + (s * 7919) % (wh * 0.6);
        g.fillStyle(0xeeeeff, sa * (0.5 + (s % 7) * 0.07));
        g.fillRect(sx | 0, sy | 0, s % 5 === 0 ? 2 : 1, s % 5 === 0 ? 2 : 1);
      });
      if (isNight) {
        const phase = this.getMoonPhase(); // 0=신월, 0.5=보름달
        const illum = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2); // 0→1→0
        if (illum > 0.05) {
          const mx = 55, my = Math.round(wh * 0.3);
          const moonR = 8;
          // 보름에 가까울수록 강한 달빛
          g.fillStyle(0xf0e8cc, 0.06 + illum * 0.10); g.fillCircle(mx, my, 18);
          g.fillStyle(0xf5eedd, 0.14 + illum * 0.12); g.fillCircle(mx, my, 13);
          g.fillStyle(0xfffae0, 0.92); g.fillCircle(mx, my, moonR);
          // 위상 그림자 (terminator 기법)
          if (illum < 0.93) {
            const isWaxing = phase < 0.5;
            const terminator = Math.cos(phase * Math.PI * 2); // 1=신월, -1=보름
            const shadowCx = mx + (isWaxing ? 1 : -1) * terminator * moonR;
            g.fillStyle(skyT, 0.88);
            g.fillCircle(shadowCx, my, moonR);
          }
        }
      }
    }

    // ── 태양 (비/흐림/눈이면 숨김) ──────────────────────────────
    if (!isNight && !isRain && !isThunder && !isOvercast && !isSnow) {
      const sp  = (Math.max(6, Math.min(20, hr)) - 6) / 14;
      const sx  = 50 + sp * (WORLD_W - 100);
      const sy  = wh * 0.85 - Math.sin(sp * Math.PI) * wh * 0.75;
      if (sy > -12 && sy < wh + 12) {
        g.fillStyle(0xffdd88, 0.10); g.fillCircle(sx, sy, 22);
        g.fillStyle(0xffee99, 0.22); g.fillCircle(sx, sy, 15);
        g.fillStyle(0xfff5cc, 0.55); g.fillCircle(sx, sy, 9);
        g.fillStyle(0xffffff, 0.95); g.fillCircle(sx, sy, 6);
      }
    }

    // ── 정적 구름 레이어 (배경) ──────────────────────────────────
    if (isCloudy || isOvercast) {
      const cc = isNight ? 0x2a3a50 : ((isRain || isThunder) ? 0x607080 : (isSunset ? 0xd09870 : 0xffffff));
      const ca = isOvercast ? 0.4 : 0.2;
      ([
        [80, 8, 70, 16], [280, 15, 55, 14], [520, 6, 85, 18], [720, 12, 60, 15],
      ] as [number,number,number,number][]).forEach(([cx, cy, cw, ch]) => {
        g.fillStyle(cc, ca);
        g.fillRoundedRect(cx, cy + 5, cw, ch * 0.6, ch * 0.3);
        g.fillRoundedRect(cx + cw * 0.2, cy, cw * 0.6, ch, ch / 2);
      });
    }

    // ── 빌딩 실루엣 (고정 배치) ─────────────────────────────────
    const bc = isNight ? 0x080f1c : (isSunset ? 0x1a0a20 : 0x4a6a88);
    const ba = isNight ? 1 : 0.38;
    const bd: [number,number,number][] = [
      [0,18,35],[20,12,52],[34,22,42],[58,10,68],[70,16,38],[88,14,55],[104,20,45],
      [126,8,72],[136,18,40],[156,12,60],[170,24,48],[196,10,65],[208,16,38],
      [226,22,55],[250,14,42],[266,20,50],[288,8,70],[298,18,44],[318,14,58],
      [334,22,36],[358,12,62],[372,20,46],[394,16,52],[412,10,68],[424,24,40],
      [450,14,55],[466,18,42],[486,12,60],[500,20,48],[522,8,72],[532,16,38],
      [550,22,56],[574,10,65],[586,18,44],[606,14,50],[622,20,38],[644,24,62],
      [670,12,48],[684,18,55],[704,16,40],[722,22,68],[746,10,44],[758,20,52],
      [780,14,38],[796,18,60],[816,12,44],
    ];
    bd.forEach(([bx, bw, bh]) => {
      if (bh >= wh - 2) return;
      g.fillStyle(bc, ba);
      g.fillRect(bx, wh - bh, bw, bh);
      if (isNight) {
        const ha = ((bx * 1664525 + 1013904223) & 0xff) / 255;
        if (ha > 0.35) { g.fillStyle(0xf0df60, 0.45 + ha * 0.3); g.fillRect(bx + 3, wh - bh + 5, 2, 2); }
        if (bw > 14 && ((bx * 741103597 + 2891336453) & 0xff) > 120) {
          g.fillStyle(0xf0df60, 0.35); g.fillRect(bx + 8, wh - bh + 8, 2, 2);
        }
      }
    });

    // ── 계절별 나무 (PNG 에셋 사용) ─────────────────────────────
    const nightT = isNight || hr < 6.5 || hr >= 20.5;
    const season = mon >= 3 && mon <= 5 ? "spring"
      : mon >= 6 && mon <= 8 ? "summer"
      : mon >= 9 && mon <= 11 ? "autumn" : "winter";

    // 나무 위치 (빌딩 사이사이에 배치)
    const treePositions: { x: number; size: "sm" | "md" | "lg"; isEv: boolean }[] = [
      { x: 25, size: "sm", isEv: false },
      { x: 65, size: "md", isEv: false },
      { x: 120, size: "lg", isEv: true },
      { x: 170, size: "sm", isEv: false },
      { x: 230, size: "md", isEv: false },
      { x: 290, size: "lg", isEv: false },
      { x: 355, size: "sm", isEv: true },
      { x: 415, size: "md", isEv: false },
      { x: 480, size: "lg", isEv: false },
      { x: 545, size: "sm", isEv: false },
      { x: 600, size: "md", isEv: true },
      { x: 660, size: "lg", isEv: false },
      { x: 720, size: "sm", isEv: false },
      { x: 775, size: "md", isEv: false },
      { x: 825, size: "sm", isEv: true },
    ];

    treePositions.forEach(({ x, size, isEv }) => {
      const treeSeason = isEv ? "evergreen" : season;
      const key = `tree_${treeSeason}_${size}`;
      const tree = this.add.image(x, wh, key).setOrigin(0.5, 1).setDepth(6);
      if (nightT) tree.setTint(0x0a1520);
      this.envGroup.add(tree);
    });

    // ── 안개 오버레이 ─────────────────────────────────────────────
    if (isFog) {
      g.fillStyle(0xc0ccd8, 0.32); g.fillRect(0, wh*0.25|0, WORLD_W, wh*0.75);
      g.fillStyle(0xd0dce4, 0.18); g.fillRect(0, 0, WORLD_W, wh);
    }

    // ── 창틀 ─────────────────────────────────────────────────────
    g.fillStyle(0x3a4a5a, 1); g.fillRect(0, 0, WORLD_W, 3);
    g.fillStyle(0x3a4a5a, 1); g.fillRect(0, wh-3, WORLD_W, 3);
    g.fillStyle(0x5a6a7a, 0.5); g.fillRect(0, wh-5, WORLD_W, 2);
    for (let x = 0; x <= WORLD_W; x += 120) {
      g.fillStyle(0x3a4a5a, 1); g.fillRect(x-1, 0, 3, wh);
    }
    g.fillStyle(0xffffff, 0.04); g.fillRect(2, 3, 4, wh-6); // 유리 반사

    this.envGroup.add(g);

    // ── 파티클 그래픽스 (매 프레임 재드로우) ─────────────────────
    this.particleGraphics = this.add.graphics().setDepth(5);
    this.envGroup.add(this.particleGraphics);

    // 파티클 초기화
    this.rainDrops  = [];
    this.snowFlakes = [];
    if (isRain || isThunder) {
      const count = isThunder ? 40 : 25; // 줄임 (폭우감 → 적당한 비)
      for (let i = 0; i < count; i++) {
        this.rainDrops.push({ x: Math.random() * WORLD_W, y: Math.random() * wh,
          speed: 1.0 + Math.random() * 1.0, len: 3 + Math.random() * 4 }); // 느리고 짧게
      }
    }
    if (isSnow) {
      for (let i = 0; i < 30; i++) { // 눈도 살짝 줄임
        this.snowFlakes.push({ x: Math.random() * WORLD_W, y: Math.random() * wh,
          speed: 0.15 + Math.random() * 0.35, size: 1 + Math.random() * 1.5,
          dx: (Math.random() - 0.5) * 0.3 });
      }
    }

    // 애니메이션 구름 생성
    this.spawnAnimatedClouds();
  }

  private spawnAnimatedClouds() {
    const wh  = WALL_H * TILE;
    const wc  = this.weatherCode;
    const hr  = new Date().getHours();
    const isNight  = hr >= 21 || hr < 5;
    const isSunset = hr >= 17 && hr < 20;
    const isRain   = (wc >= 51 && wc <= 82) || wc >= 95;
    const isOvercast = wc === 3;
    const isCloudy   = wc >= 1;

    const col   = isNight ? 0x2a3a50 : (isRain ? 0x6a7a88 : (isSunset ? 0xd09878 : 0xfafafa));
    const alpha = isOvercast ? 0.72 : (isCloudy ? 0.5 : 0.2);
    const count = isOvercast ? 6 : (isCloudy ? 4 : 2);

    for (let i = 0; i < count; i++) {
      const cg = this.add.graphics().setDepth(3);
      const cw = 55 + i * 20;
      const ch = 15 + i * 4;
      cg.fillStyle(col, alpha * 0.70); cg.fillRoundedRect(0, ch * 0.45, cw, ch * 0.55, ch * 0.25);
      cg.fillStyle(col, alpha);        cg.fillRoundedRect(cw * 0.12, 0, cw * 0.65, ch, ch * 0.5);
      cg.fillStyle(col, alpha * 0.75); cg.fillRoundedRect(cw * 0.5, ch * 0.2, cw * 0.38, ch * 0.72, ch * 0.36);

      const startX = i * (WORLD_W / count) - 40;
      cg.setPosition(startX, 5 + i * 8);
      this.envGroup.add(cg);

      const dur = 48000 + i * 14000;
      const moveCloud = () => {
        if (!cg.active) return;
        this.tweens.add({
          targets: cg, x: WORLD_W + cw + 30,
          duration: dur + Math.random() * 5000, ease: "Linear",
          onComplete: () => { if (cg.active) { cg.setPosition(-cw - 20, 5 + Math.random() * (wh * 0.38)); moveCloud(); } },
        });
      };
      moveCloud();
    }
  }

  /** 달 위상 반환 (0=신월, 0.25=상현, 0.5=보름, 0.75=하현) */
  private getMoonPhase(): number {
    const knownNewMoon = new Date(2000, 0, 6).getTime(); // 2000-01-06 신월 기준
    const synodicMs = 29.53059 * 24 * 60 * 60 * 1000;
    return ((Date.now() - knownNewMoon) % synodicMs) / synodicMs;
  }

  private drawServerRoom() {
    const g = this.add.graphics();
    // 서버실 영역: 우측 5칸 x 전체 높이(벽~복도)
    const srX = (COLS - 5) * TILE;
    const srY = WALL_H * TILE;
    const srW = 5 * TILE;
    const srH = (ROWS - WALL_H - 3) * TILE;
    const midX = srX + srW / 2;

    // ── 서버실 바닥 (어두운 톤 + 격자) ──
    g.fillStyle(0x1e1e2e, 1);
    g.fillRect(srX, srY, srW, srH);
    g.lineStyle(1, 0x282840, 0.4);
    for (let y = srY; y < srY + srH; y += 16) g.lineBetween(srX, y, srX + srW, y);
    for (let x = srX; x < srX + srW; x += 16) g.lineBetween(x, srY, x, srY + srH);

    // ── 좌측 벽 (사무실 구분) ──
    g.fillStyle(0x4a4a5a, 1);
    g.fillRect(srX - 3, srY, 6, srH);
    g.fillStyle(0x5a5a6a, 0.5);
    g.fillRect(srX - 2, srY, 1, srH);
    // 출입구
    const doorY = srY + srH / 2 - 16;
    g.fillStyle(0x1e1e2e, 1);
    g.fillRect(srX - 3, doorY, 6, 32);
    g.lineStyle(1, 0x5a5a6a, 0.6);
    g.strokeRect(srX - 3, doorY, 6, 32);
    this.envGroup.add(g);

    // ── 상단: 점검 모니터 (크게) ──
    const monX = midX;
    const monY = srY + 26;
    // 모니터 프레임 (큰 화면)
    const monG = this.add.graphics().setDepth(100);
    monG.fillStyle(0x222233, 1);
    monG.fillRoundedRect(monX - 55, monY - 18, 110, 36, 3);
    monG.fillStyle(0x101828, 1);
    monG.fillRoundedRect(monX - 52, monY - 15, 104, 30, 2);
    // 화면 내용 (미니 대시보드 느낌)
    monG.fillStyle(0x40d080, 0.8);
    monG.fillRect(monX - 48, monY - 12, 30, 2); // 상태바
    monG.fillStyle(0x60a0e0, 0.6);
    monG.fillRect(monX - 48, monY - 8, 45, 1);
    monG.fillStyle(0x40d080, 0.5);
    monG.fillRect(monX - 48, monY - 5, 20, 1);
    monG.fillStyle(0xd0a050, 0.5);
    monG.fillRect(monX - 48, monY - 2, 35, 1);
    // 우측 미니 그래프
    [0, 3, 6, 9, 12, 15, 18, 21].forEach((dx, i) => {
      const h = 4 + Math.sin(i * 1.2) * 3;
      monG.fillStyle(0x40d080, 0.6);
      monG.fillRect(monX + 10 + dx, monY + 2 - h, 2, h);
    });
    // 스탠드
    monG.fillStyle(0x333344, 1);
    monG.fillRect(monX - 3, monY + 18, 6, 4);
    monG.fillStyle(0x444455, 1);
    monG.fillRect(monX - 12, monY + 22, 24, 3);
    this.envGroup.add(monG);

    // 모니터 라벨
    this.envGroup.add(this.add.text(midX, srY + 8, "🖥 서버실", {
      fontSize: "11px", fontFamily: FONT, color: "#50c080", resolution: DPR * 2,
    }).setOrigin(0.5).setDepth(101));

    // 모니터 클릭
    const monHit = this.add.zone(monX, monY, 120, 40).setInteractive({ useHandCursor: true }).setDepth(102);
    monHit.on("pointerdown", () => {
      const cam = this.cameras.main;
      const rect = this.game.canvas.getBoundingClientRect();
      const sx = rect.left + (monX - cam.scrollX) * (rect.width / cam.width);
      const sy = rect.top + (monY - cam.scrollY) * (rect.height / cam.height);
      this.onTeamClick?.("server-monitor", Math.round(sx), Math.round(sy));
    });
    this.envGroup.add(monHit);

    // ── Row 1: 에이전트 서버 (병렬, 이름 없이) ──
    const row1Y = srY + 70;
    const row1Count = 6;
    const r1Space = Math.floor(srW / (row1Count + 1));
    for (let i = 0; i < row1Count; i++) {
      const rx = srX + r1Space * (i + 1);
      const sg = this.add.graphics().setDepth(100);
      sg.fillStyle(0x1a1a2a, 1); sg.fillRect(rx - 7, row1Y - 12, 14, 24);
      sg.fillStyle(0x222235, 1); sg.fillRect(rx - 5, row1Y - 10, 10, 20);
      sg.fillStyle(0x40d080, 0.8); sg.fillCircle(rx, row1Y - 6, 1.5);
      sg.fillStyle(0x40a0d0, 0.5); sg.fillCircle(rx, row1Y - 2, 1);
      for (let v = 0; v < 3; v++) sg.fillRect(rx - 3, row1Y + 2 + v * 3, 6, 1);
      this.envGroup.add(sg);
    }

    // ── Row 2: 인프라 서버 (병렬, 이름 없이) ──
    const row2Y = row1Y + 44;
    const row2Count = 4;
    const r2Space = Math.floor(srW / (row2Count + 1));
    for (let i = 0; i < row2Count; i++) {
      const rx = srX + r2Space * (i + 1);
      const ig = this.add.graphics().setDepth(100);
      ig.fillStyle(0x1a1a2a, 1); ig.fillRect(rx - 9, row2Y - 12, 18, 24);
      ig.fillStyle(0x252540, 1); ig.fillRect(rx - 7, row2Y - 10, 14, 20);
      ig.fillStyle(0x40d080, 0.8); ig.fillCircle(rx - 3, row2Y - 6, 1.5);
      ig.fillStyle(0x40a0d0, 0.5); ig.fillCircle(rx + 3, row2Y - 6, 1.5);
      for (let v = 0; v < 2; v++) ig.fillRect(rx - 5, row2Y + v * 4, 10, 2);
      this.envGroup.add(ig);
    }

    // ── 그리드 점유 ──
    for (let y = WALL_H; y < ROWS - 3; y++)
      for (let x = COLS - 5; x < COLS; x++)
        if (y >= 0 && x >= 0) this.grid[y][x] = true;
  }

  private drawCorridor() {
    const g = this.add.graphics();
    const corY = (ROWS - 3) * TILE;
    const corH = 3 * TILE;

    // 복도 바닥 (밝은 회색 타일)
    for (let x = 0; x < WORLD_W; x += 48) {
      const alt = (x / 48) % 2 === 0;
      g.fillStyle(alt ? 0xd0d0d8 : 0xc8c8d0, 1);
      g.fillRect(x, corY, 48, corH);
      // 줄눈
      g.fillStyle(0xb8b8c0, 0.3);
      g.fillRect(x + 47, corY, 1, corH);
    }
    g.fillStyle(0xb8b8c0, 0.3);
    g.fillRect(0, corY + corH / 2, WORLD_W, 1);

    // 복도 상단 벽 (두꺼운 벽)
    g.fillStyle(0x7a7a8a, 1);
    g.fillRect(0, corY, WORLD_W, 5);
    g.fillStyle(0x9a9aaa, 0.6);
    g.fillRect(0, corY + 1, WORLD_W, 1);
    // 벽 하단 그림자
    g.fillStyle(0x000000, 0.05);
    g.fillRect(0, corY + 5, WORLD_W, 3);

    // 복도 출입구 (사무실 → 복도, 가운데)
    const doorX = WORLD_W / 2 - 20;
    g.fillStyle(0xe0e0e8, 1);
    g.fillRect(doorX, corY, 40, 5);

    // 소화기 (복도 안 좌측, 고퀄)
    g.fillStyle(0xcc2222, 1);
    g.fillRect(16, corY + 18, 10, 20);
    g.fillStyle(0xee3333, 1);
    g.fillRect(18, corY + 20, 6, 16);
    g.fillStyle(0xff5555, 0.4);
    g.fillRect(18, corY + 20, 2, 14);
    g.fillStyle(0x666666, 1);
    g.fillRect(18, corY + 14, 6, 5);
    g.fillStyle(0x888888, 1);
    g.fillRect(19, corY + 15, 4, 3);
    g.fillStyle(0x444444, 1);
    g.fillRect(24, corY + 16, 4, 2);

    // 비상구 표시 (복도 안 중앙 위)
    g.fillStyle(0x22aa44, 0.8);
    g.fillRoundedRect(WORLD_W / 2 + 40, corY + 12, 24, 10, 2);

    // 복도 조명 반사
    [150, 350, 550].forEach(lx => {
      g.fillStyle(0xffffff, 0.04);
      g.fillCircle(lx, corY + corH / 2 + 4, 18);
    });

    this.envGroup.add(g);

    // 비상구 텍스트
    const exitLabel = this.add.text(WORLD_W / 2 + 52, corY + 14, "EXIT", {
      fontSize: "10px", fontFamily: FONT,
      color: "#ffffff", resolution: DPR * 2,
    }).setOrigin(0.5);
    this.envGroup.add(exitLabel);

    // 복도 점유
    for (let y = ROWS - 3; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        this.grid[y][x] = true;
  }

  private drawOfficeDetails() {
    const wallY = WALL_H * TILE;
    const corY = (ROWS - 3) * TILE;
    const srvX = (COLS - 5) * TILE;

    // ═══════════════════════════════
    // 벽면 장식 (상단 벽 바로 아래)
    // ═══════════════════════════════

    // ── 좌측 벽면 — 책장 2개 (오리지널 에셋) ──
    this.envGroup.add(this.add.image(30, wallY + 45, "o_bookshelf").setDepth(5));
    this.envGroup.add(this.add.image(30, wallY + 120, "o_bookshelf").setDepth(5));

    // ── 벽면 그림 (소품으로 분위기) ──
    this.envGroup.add(this.add.image(4 * TILE, wallY + 14, "large_painting").setScale(SCALE).setDepth(5));
    this.envGroup.add(this.add.image(7 * TILE, wallY + 12, "small_painting").setScale(SCALE).setDepth(5));
    this.envGroup.add(this.add.image(12 * TILE, wallY + 14, "small_painting_2").setScale(SCALE).setDepth(5));
    this.envGroup.add(this.add.image(17 * TILE, wallY + 12, "large_painting").setScale(SCALE).setDepth(5));

    // ── 벽걸이 시계 ──
    this.envGroup.add(this.add.image(10 * TILE, wallY + 10, "clock").setScale(SCALE).setDepth(5));

    // ── 행잉 플랜트 (천장 매달린 화분) ──
    this.envGroup.add(this.add.image(3 * TILE, wallY + 8, "hanging_plant").setScale(SCALE).setDepth(5));
    this.envGroup.add(this.add.image(9 * TILE, wallY + 6, "hanging_plant").setScale(SCALE).setDepth(5));
    this.envGroup.add(this.add.image(16 * TILE, wallY + 8, "hanging_plant").setScale(SCALE).setDepth(5));

    // ── 서버실 벽 옆 — 화이트보드 ──
    this.envGroup.add(this.add.image(srvX - 35, wallY + 30, "o_whiteboard").setDepth(5));

    // ── 벽면 에어컨 2대 ──
    this.envGroup.add(this.add.image(6 * TILE, wallY + 4, "o_ac").setDepth(5));
    this.envGroup.add(this.add.image(14 * TILE, wallY + 4, "o_ac").setDepth(5));

    // ═══════════════════════════════
    // 소품/가구 배치 (팀 구역 주변)
    // ═══════════════════════════════

    // ── 정수기 + 커피머신 (휴게 코너, 좌측 하단) ──
    this.envGroup.add(this.add.image(30, corY - 22, "o_water_cooler").setDepth(5));
    this.envGroup.add(this.add.image(70, corY - 18, "o_coffee").setDepth(5));
    // 커피테이블 + 머그 느낌
    this.envGroup.add(this.add.image(50, corY - 38, "small_table").setScale(SCALE).setDepth(5));

    // ── 소파 (휴게 공간) ──
    this.envGroup.add(this.add.image(50, corY - 58, "sofa_front").setScale(SCALE).setDepth(5));

    // ── 창가 화분들 (다양한 종류) ──
    this.envGroup.add(this.add.image(2 * TILE, wallY + 20, "plant").setScale(SCALE).setDepth(5));
    this.envGroup.add(this.add.image(5 * TILE, wallY + 22, "cactus").setScale(SCALE).setDepth(5));
    this.envGroup.add(this.add.image(8 * TILE, wallY + 20, "large_plant").setScale(SCALE).setDepth(5));
    this.envGroup.add(this.add.image(11 * TILE, wallY + 22, "plant_2").setScale(SCALE).setDepth(5));
    this.envGroup.add(this.add.image(15 * TILE, wallY + 20, "plant").setScale(SCALE).setDepth(5));
    this.envGroup.add(this.add.image(19 * TILE, wallY + 22, "cactus").setScale(SCALE).setDepth(5));

    // ── 팀 구역 사이 소품 (구분감 + 디테일) ──
    // 매매봇~데이트지도 사이
    this.envGroup.add(this.add.image(5.5 * TILE, 8 * TILE, "large_plant").setScale(SCALE).setDepth(5));
    // 데이트지도~클로드비서 사이
    this.envGroup.add(this.add.image(10.5 * TILE, 8 * TILE, "bin").setScale(SCALE).setDepth(5));
    // 클로드비서~AI900 사이
    this.envGroup.add(this.add.image(15.5 * TILE, 8 * TILE, "plant_2").setScale(SCALE).setDepth(5));
    // CL600G~디자인팀 사이
    this.envGroup.add(this.add.image(7.5 * TILE, 14 * TILE, "pot").setScale(SCALE).setDepth(5));
    // CPO 근처 화분
    this.envGroup.add(this.add.image(15 * TILE, 11 * TILE, "cactus").setScale(SCALE).setDepth(5));

    // ── 소화기 (오리지널, 서버실 옆 + 복도) ──
    this.envGroup.add(this.add.image(srvX - 12, corY - 16, "o_fire_ext").setDepth(5));

    // ── 시계 (오리지널, 서버실 벽) ──
    this.envGroup.add(this.add.image(srvX - 35, wallY + 10, "o_clock").setDepth(5));

    // ═══════════════════════════════
    // 조명 효과
    // ═══════════════════════════════

    // ── 천장 조명 반사 (더 넓은 범위) ──
    [3, 7, 11, 15, 19].forEach(col => {
      [6, 10, 14].forEach(row => {
        if (col * TILE < srvX) {
          const glow = this.add.image(col * TILE, row * TILE, "light_glow").setScale(2.5).setAlpha(0.6);
          this.envGroup.add(glow);
        }
      });
    });

    // ── 모니터 글로우 (팀 구역의 모니터에서 나오는 빛) ──
    const teams = ALL_FLOORS[this.currentFloor] || [];
    teams.forEach(t => {
      if (t.chars.length <= 1) return;
      const cx = t.gridX * TILE + (t.gridW * TILE) / 2;
      const cy = t.gridY * TILE + (t.gridH * TILE) / 2;
      // 모니터 빛 (작은 원형, 초록/파랑 톤)
      const monGlow = this.add.graphics();
      // 좌측 모니터 글로우
      monGlow.fillStyle(0x40d080, 0.04);
      monGlow.fillCircle(cx - 13, cy - 18, 18);
      monGlow.fillCircle(cx - 13, cy + 18, 18);
      // 우측 모니터 글로우
      monGlow.fillStyle(0x4080d0, 0.04);
      monGlow.fillCircle(cx + 13, cy - 18, 18);
      monGlow.fillCircle(cx + 13, cy + 18, 18);
      this.envGroup.add(monGlow);
    });

    // ── 걸레받이 (벽 하단 몰딩) ──
    const baseG = this.add.graphics();
    baseG.fillStyle(0x4a4a58, 0.5);
    baseG.fillRect(0, wallY, srvX, 3);
    baseG.fillStyle(0x5a5a68, 0.3);
    baseG.fillRect(0, wallY, srvX, 1);
    this.envGroup.add(baseG);

    // ── 벽면 간접 조명 (따뜻한 앰비언트) ──
    const ambientG = this.add.graphics();
    ambientG.fillGradientStyle(0xf5c842, 0xf5c842, 0xf5c842, 0xf5c842, 0.03, 0.03, 0, 0);
    ambientG.fillRect(0, wallY, srvX, 40);
    this.envGroup.add(ambientG);
  }

  changeFloor(floor: number) {
    if (floor < 1 || floor > 3) return;
    this.currentFloor = floor;
    this.floorLabel?.setText(`${floor}F`);
    this.buildFloor(floor);
  }

  // ═══════════════════════════════
  // 엘리베이터
  // ═══════════════════════════════

  private drawElevator() {
    // 복도 안 우측에 엘리베이터
    const corY = (ROWS - 3) * TILE;
    const corH = 3 * TILE;
    const ex = WORLD_W - 40;
    const ey = corY + corH / 2;
    const ew = 50;
    const eh = corH - 10;

    const g = this.add.graphics().setDepth(150);
    // 벽면
    g.fillStyle(0x555565, 1);
    g.fillRect(ex - ew / 2, ey - eh / 2, ew, eh);
    // 문 (가운데 갈라짐)
    g.fillStyle(0x888898, 1);
    g.fillRect(ex - ew / 2 + 4, ey - eh / 2 + 4, ew / 2 - 5, eh - 8);
    g.fillRect(ex + 1, ey - eh / 2 + 4, ew / 2 - 5, eh - 8);
    // 문 사이 선
    g.fillStyle(0x3a3a4a, 1);
    g.fillRect(ex - 1, ey - eh / 2 + 4, 2, eh - 8);
    // 프레임
    g.lineStyle(2, 0x444454, 1);
    g.strokeRect(ex - ew / 2, ey - eh / 2, ew, eh);
    // 문 위 디스플레이 패널 (층 표시)
    g.fillStyle(0x1a1a2a, 1);
    g.fillRect(ex - 12, ey - eh / 2 + 2, 24, 12);
    g.fillStyle(0x111118, 1);
    g.fillRect(ex - 10, ey - eh / 2 + 3, 20, 10);

    // 층 표시 (디스플레이 안)
    this.floorLabel = this.add.text(ex, ey - eh / 2 + 8, `${this.currentFloor}F`, {
      fontSize: "12px", fontFamily: FONT,
      color: "#40d080", resolution: DPR * 2,
    }).setOrigin(0.5).setDepth(151);

    // ▲▼ 버튼 (문 왼쪽, 크게 — 모바일 터치용)
    const btnUp = this.add.text(ex - ew / 2 - 20, ey - 14, "▲", {
      fontSize: "18px", color: "#ccc", backgroundColor: "#333345",
      padding: { x: 6, y: 4 },
    }).setOrigin(0.5).setDepth(151).setInteractive({ useHandCursor: true });

    const btnDown = this.add.text(ex - ew / 2 - 20, ey + 14, "▼", {
      fontSize: "18px", color: "#ccc", backgroundColor: "#333345",
      padding: { x: 6, y: 4 },
    }).setOrigin(0.5).setDepth(151).setInteractive({ useHandCursor: true });

    btnUp.on("pointerdown", () => this.changeFloor(this.currentFloor + 1));
    btnDown.on("pointerdown", () => this.changeFloor(this.currentFloor - 1));

    btnUp.on("pointerover", () => btnUp.setColor("#40d080"));
    btnUp.on("pointerout", () => btnUp.setColor("#aaa"));
    btnDown.on("pointerover", () => btnDown.setColor("#40d080"));
    btnDown.on("pointerout", () => btnDown.setColor("#aaa"));
  }

  // ═══════════════════════════════
  // 그리드
  // ═══════════════════════════════

  private occupyGrid(gx: number, gy: number, gw: number, gh: number, occupy: boolean) {
    for (let y = gy; y < gy + gh && y < ROWS; y++)
      for (let x = gx; x < gx + gw && x < COLS; x++)
        if (y >= 0 && x >= 0) this.grid[y][x] = occupy;
  }

  private canPlace(gx: number, gy: number, gw: number, gh: number, excludeId?: string): boolean {
    for (let y = gy; y < gy + gh; y++)
      for (let x = gx; x < gx + gw; x++) {
        if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return false;
        if (this.grid[y][x]) {
          if (excludeId) {
            const tg = this.teamGroups.get(excludeId);
            if (tg && x >= tg.gridX && x < tg.gridX + tg.config.gridW &&
              y >= tg.gridY && y < tg.gridY + tg.config.gridH) continue;
          }
          return false;
        }
      }
    return true;
  }

  // ═══════════════════════════════
  // 팀 구역
  // ═══════════════════════════════

  private createTeamGroup(t: TeamConfig) {
    const cx = t.gridX * TILE + (t.gridW * TILE) / 2;
    const cy = t.gridY * TILE + (t.gridH * TILE) / 2;
    const container = this.add.container(cx, cy);
    container.setData("teamId", t.id);
    // Y좌표 기반 depth → 아래쪽(앞쪽) 팀이 위쪽(뒤쪽) 팀 위에 그려짐
    container.setDepth(t.gridY + 10);
    const pw = t.gridW * TILE;
    const ph = t.gridH * TILE;
    container.setSize(pw, ph);

    // 배경 (완전 투명 — 겹침 판정용으로만 존재)
    container.add(this.add.rectangle(0, 0, pw, ph, 0x000000, 0));

    // 하이라이트
    const highlight = this.add.rectangle(0, 0, pw, ph, 0xf5c842, 0)
      .setStrokeStyle(1, 0xf5c842, 0);
    container.add(highlight);

    // 2x2 등맞대기 배치
    // 윗줄: PC → 데스크 → 캐릭(정면) | 아랫줄: 캐릭(뒷면) → 데스크 → PC뒷면
    // LimeZu(0~3)=16x32 — 원본 크기로 선명하게
    const members: MemberSprite[] = [];
    // 2x2 등맞대기 — 2× 업스케일 스프라이트 (32×64 프레임)
    const S = 0.5;       // 2× 스프라이트(32×64) × 0.5 = 원래 크기(16px). 고화질은 소스 해상도에서 확보
    const gapX = 36;     // dy = ±18 (약간 겹침 — 탑뷰 원근감으로 자연스러움)

    // 모니터: PC 스프라이트 에셋 사용 (깜빡임 애니메이션 지원)
    const addMonitorSprite = (cx: number, cy: number, facing: number): Phaser.GameObjects.Sprite => {
      const mon = this.add.sprite(cx, cy, "pc_on1");
      mon.setScale(0.5);
      mon.play("pc_blink");
      if (facing < 0) mon.setFlipX(true);
      return mon;
    };

    const isSolo = t.chars.length === 1;

    // 좌우 마주보기 배치 — depth 문제 없음
    // 왼쪽 2명: 오른쪽 바라봄 | 오른쪽 2명: 왼쪽 바라봄
    const cols = 7; // spritesheet columns
    t.chars.forEach((charIdx, i) => {
      if (i >= 4) return;

      if (isSolo) {
        const char = this.add.sprite(0, 0, `char_${charIdx}`, 0)
          .setScale(S).setOrigin(0.5, 0.75)
          .play(`char_${charIdx}_idle`);
        container.add(char);
        members.push({ char, charIdx, baseX: 0, baseY: 0 });
        return;
      }

      const isLeft = i < 2;
      const row = i % 2;
      const dy = row === 0 ? -gapX / 2 : gapX / 2;

      if (isLeft) {
        // 왼쪽: 캐릭(→) → 책상 → 모니터(→)
        const deskX = -13;
        container.add(this.add.image(deskX, dy + 4, "desk_front").setScale(0.55));
        const mon = addMonitorSprite(deskX + 1, dy - 6, 1);
        container.add(mon);
        const charX = deskX - 22;
        const char = this.add.sprite(charX, dy, `char_${charIdx}`, cols * 2)
          .setScale(S).setOrigin(0.5, 0.75);
        container.add(char);
        members.push({ char, charIdx, baseX: charX, baseY: dy });
      } else {
        // 오른쪽: 모니터(←) → 책상 → 캐릭(←)
        const deskX = 13;
        container.add(this.add.image(deskX, dy + 4, "desk_front").setScale(0.55));
        const mon = addMonitorSprite(deskX - 1, dy - 6, -1);
        container.add(mon);
        const charX = deskX + 22;
        const char = this.add.sprite(charX, dy, `char_${charIdx}`, cols)
          .setScale(S).setOrigin(0.5, 0.75);
        container.add(char);
        members.push({ char, charIdx, baseX: charX, baseY: dy });
      }
    });

    // 화이트보드 명패
    const nameY = ph / 2 + 2;
    const nameBg = this.add.graphics();
    nameBg.fillStyle(0xffffff, 0.95);
    nameBg.fillRoundedRect(-42, nameY - 10, 84, 18, 2);
    nameBg.lineStyle(1, 0xcccccc, 0.8);
    nameBg.strokeRoundedRect(-42, nameY - 10, 84, 18, 2);
    nameBg.fillStyle(0x4a90d9, 1);
    nameBg.fillRect(-42, nameY - 10, 84, 2);
    container.add(nameBg);

    const label = this.add.text(0, nameY, `${t.emoji} ${t.name}`, {
      fontSize: "13px", fontFamily: FONT,
      color: "#222222", resolution: DPR * 2,
      stroke: "#ffffff", strokeThickness: 0.3,
    }).setOrigin(0.5);
    container.add(label);

    // 인터랙션
    const hit = this.add.zone(0, 0, pw, ph).setInteractive({ useHandCursor: true });
    container.add(hit);
    hit.on("pointerover", () => { highlight.setStrokeStyle(1, 0xf5c842, 0.4); highlight.setFillStyle(0xf5c842, 0.02); });
    hit.on("pointerout", () => { highlight.setStrokeStyle(1, 0xf5c842, 0); highlight.setFillStyle(0xf5c842, 0); });

    this.teamGroups.set(t.id, {
      container, members, label, highlight, config: t,
      gridX: t.gridX, gridY: t.gridY, prevGridX: t.gridX, prevGridY: t.gridY,
    });
  }

  // ═══════════════════════════════
  // 드래그
  // ═══════════════════════════════

  private onDown(ptr: Phaser.Input.Pointer) {
    this.dragStartX = ptr.worldX; this.dragStartY = ptr.worldY;
    for (const [, tg] of this.teamGroups) {
      if (tg.container.getBounds().contains(ptr.worldX, ptr.worldY)) {
        this.dragTarget = tg;
        this.dragOffX = ptr.worldX - tg.container.x;
        this.dragOffY = ptr.worldY - tg.container.y;
        tg.container.setData("dragging", false);
        tg.prevGridX = tg.gridX; tg.prevGridY = tg.gridY;
        this.occupyGrid(tg.gridX, tg.gridY, tg.config.gridW, tg.config.gridH, false);
        tg.container.setDepth(50);
        break;
      }
    }
  }

  private onMove(ptr: Phaser.Input.Pointer) {
    if (!this.dragTarget || !ptr.isDown) return;
    if (Phaser.Math.Distance.Between(this.dragStartX, this.dragStartY, ptr.worldX, ptr.worldY) < 8) return;

    this.dragTarget.container.setData("dragging", true);
    const t = this.dragTarget;
    t.container.x = ptr.worldX - this.dragOffX;
    t.container.y = ptr.worldY - this.dragOffY;

    const sgx = Math.round((t.container.x - (t.config.gridW * TILE) / 2) / TILE);
    const sgy = Math.round((t.container.y - (t.config.gridH * TILE) / 2) / TILE);
    const ok = this.canPlace(sgx, sgy, t.config.gridW, t.config.gridH, t.config.id);

    if (this.overlapRect) {
      this.overlapRect.setPosition(sgx * TILE + (t.config.gridW * TILE) / 2, sgy * TILE + (t.config.gridH * TILE) / 2);
      this.overlapRect.setSize(t.config.gridW * TILE, t.config.gridH * TILE);
      this.overlapRect.setFillStyle(ok ? 0x4ade80 : 0xff0000, 0.15);
      this.overlapRect.setStrokeStyle(2, ok ? 0x4ade80 : 0xff0000, 0.6);
      this.overlapRect.setVisible(true);
    }
  }

  private onUp() {
    if (!this.dragTarget) return;
    const t = this.dragTarget;

    if (!t.container.getData("dragging")) {
      this.occupyGrid(t.prevGridX, t.prevGridY, t.config.gridW, t.config.gridH, true);
      t.gridX = t.prevGridX; t.gridY = t.prevGridY;
      // 팀의 캔버스 좌표 → 화면 좌표 변환
      const cam = this.cameras.main;
      const canvas = this.game.canvas;
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / cam.width;
      const scaleY = rect.height / cam.height;
      const sx = rect.left + (t.container.x - cam.scrollX) * scaleX;
      const sy = rect.top + (t.container.y - cam.scrollY) * scaleY;
      this.onTeamClick?.(t.config.id, Math.round(sx), Math.round(sy));
    } else {
      const sgx = Math.round((t.container.x - (t.config.gridW * TILE) / 2) / TILE);
      const sgy = Math.round((t.container.y - (t.config.gridH * TILE) / 2) / TILE);

      if (this.canPlace(sgx, sgy, t.config.gridW, t.config.gridH, t.config.id)) {
        t.gridX = sgx; t.gridY = sgy;
        this.occupyGrid(sgx, sgy, t.config.gridW, t.config.gridH, true);
        this.tweens.add({ targets: t.container,
          x: sgx * TILE + (t.config.gridW * TILE) / 2,
          y: sgy * TILE + (t.config.gridH * TILE) / 2,
          duration: 120, ease: "Back.easeOut" });
        this.savePositions();
      } else {
        this.occupyGrid(t.prevGridX, t.prevGridY, t.config.gridW, t.config.gridH, true);
        t.gridX = t.prevGridX; t.gridY = t.prevGridY;
        this.tweens.add({ targets: t.container,
          x: t.prevGridX * TILE + (t.config.gridW * TILE) / 2,
          y: t.prevGridY * TILE + (t.config.gridH * TILE) / 2,
          duration: 250, ease: "Back.easeOut" });
      }
    }

    // Y좌표 기반 depth 복원 (아래쪽 = 앞쪽 = 높은 depth)
    t.container.setDepth(t.gridY + 10);
    this.overlapRect?.setVisible(false);
    this.dragTarget = null;
  }

  // ═══════════════════════════════
  // 위치 저장/로드 (localStorage)
  // ═══════════════════════════════

  private savePositions() {
    const positions: Record<string, { gx: number; gy: number }> = {};
    this.teamGroups.forEach((tg, id) => {
      positions[id] = { gx: tg.gridX, gy: tg.gridY };
    });
    try {
      localStorage.setItem(`hq-positions-${this.currentFloor}`, JSON.stringify(positions));
    } catch {}
  }

  private loadPositions(): Record<string, { gx: number; gy: number }> | null {
    try {
      const data = localStorage.getItem(`hq-positions-${this.currentFloor}`);
      return data ? JSON.parse(data) : null;
    } catch { return null; }
  }

  // ═══════════════════════════════
  // 움직임 & 상태
  // ═══════════════════════════════

  private randomMove() {
    this.teamGroups.forEach((tg, teamId) => {
      if (this.workingSet.has(teamId)) return;
      if (Phaser.Math.Between(1, 10) > 3) return;
      const m = tg.members[Phaser.Math.Between(0, tg.members.length - 1)];
      const mx = Phaser.Math.Between(-2, 2);
      if (mx === 0) return; // 이동 없으면 스킵
      const COLS = 7;
      const isDeskChar = m.baseX !== 0;
      if (!isDeskChar) {
        // 솔로 캐릭: 이동 방향에 맞는 워크 애니 (좌우만)
        const anim = mx > 0 ? `char_${m.charIdx}_walk_right` : `char_${m.charIdx}_walk_left`;
        m.char.play(anim);
      }
      // 움직이는 캐릭터를 컨테이너 맨 앞으로 → 다른 요소에 가려지지 않음
      tg.container.bringToTop(m.char);
      // 책상 캐릭: 방향 유지, 슬라이드만
      this.tweens.add({ targets: m.char, x: m.baseX + mx, duration: 350, ease: "Sine.easeInOut",
        onComplete: () => {
          if (isDeskChar) {
            if (m.baseX < 0) m.char.setFrame(COLS * 2);  // 오른쪽 옆모습 유지
            else m.char.setFrame(COLS);                    // 왼쪽 옆모습 유지
          }
          // 리턴 트윈 — 솔로는 끝나면 idle로
          this.tweens.add({ targets: m.char, x: m.baseX, duration: 300, ease: "Sine.easeInOut",
            onComplete: () => {
              if (!isDeskChar) m.char.play(`char_${m.charIdx}_idle`);
            },
          });
        },
      });
    });
  }

  setWorking(teamId: string, working: boolean) {
    const tg = this.teamGroups.get(teamId);
    if (!tg) return;
    if (working) this.workingSet.add(teamId); else this.workingSet.delete(teamId);

    // 팀 영역 펄스 글로우
    if (working && !tg.workGlow) {
      const pw = tg.config.gridW * TILE;
      const ph = tg.config.gridH * TILE;
      const glow = this.add.graphics().setDepth(9);
      glow.lineStyle(2, 0xf5c842, 0.7);
      glow.strokeRoundedRect(-pw / 2 - 3, -ph / 2 - 3, pw + 6, ph + 6, 6);
      glow.fillStyle(0xf5c842, 0.04);
      glow.fillRoundedRect(-pw / 2 - 3, -ph / 2 - 3, pw + 6, ph + 6, 6);
      // index 2에 삽입 → bg(0), highlight(1) 뒤, 모든 캐릭터/가구 앞
      // (add()로 마지막에 추가하면 캐릭터 위에 렌더되어 잘림 현상 발생)
      tg.container.addAt(glow, 2);
      tg.workGlow = glow;
      this.tweens.add({
        targets: glow, alpha: 0.25, duration: 900,
        yoyo: true, repeat: -1, ease: "Sine.easeInOut",
      });
    } else if (!working && tg.workGlow) {
      this.tweens.killTweensOf(tg.workGlow);
      tg.workGlow.destroy();
      tg.workGlow = undefined;
    }

    tg.members.forEach(m => {
      if (working) {
        // 오른쪽 책상(baseX>0)=왼쪽 향함 → type_left, 나머지 → type
        const typeAnim = m.baseX > 0 ? `char_${m.charIdx}_type_left` : `char_${m.charIdx}_type`;
        m.char.play(typeAnim);
      } else {
        const COLS = 7;
        if (m.baseX < 0) m.char.setFrame(COLS * 2);   // 왼쪽 책상 → 오른쪽 옆모습 복원
        else if (m.baseX > 0) m.char.setFrame(COLS);  // 오른쪽 책상 → 왼쪽 옆모습 복원
        else m.char.play(`char_${m.charIdx}_idle`);   // 솔로 → 정면
      }

      // 말풍선 — 캐릭터 머리 위 (scene 레벨 depth 200)
      if (working && !m.bubble) {
        const b = this.add.graphics().setDepth(200);
        b.fillStyle(0xfffbe6, 1);
        b.fillRoundedRect(-18, -16, 36, 18, 4);
        b.lineStyle(1.5, 0xf5c842, 0.9);
        b.strokeRoundedRect(-18, -16, 36, 18, 4);
        b.fillStyle(0xfffbe6, 1);
        b.fillTriangle(-3, 2, 3, 2, 0, 7);
        b.lineStyle(1, 0xf5c842, 0.7);
        b.lineBetween(-3, 2, 0, 7);
        b.lineBetween(3, 2, 0, 7);
        b.fillStyle(0x333333, 1);
        b.fillCircle(-6, -7, 2);
        b.fillCircle(0, -7, 2);
        b.fillCircle(6, -7, 2);
        // 머리 위 위치: 1인(CPO)은 container 중앙 위, 멀티는 캐릭 baseY 위
        const isSolo = tg.config.chars.length === 1;
        const headX = tg.container.x + (isSolo ? 0 : m.baseX);
        const headY = tg.container.y + (isSolo ? -30 : m.baseY - 22);
        b.setPosition(headX, headY);
        m.bubble = b;
        this.tweens.add({ targets: b, scaleX: 1.1, scaleY: 1.1, duration: 200, yoyo: true, ease: "Sine.easeOut" });
      } else if (!working && m.bubble) {
        m.bubble.destroy();
        m.bubble = undefined;
      }
    });
  }

  update() {
    const wh = WALL_H * TILE;

    // ── 날씨 파티클 ────────────────────────────────────────────
    if (this.particleGraphics?.active) {
      const pg = this.particleGraphics;
      if (this.rainDrops.length > 0 || this.snowFlakes.length > 0) {
        pg.clear();
        // 비 — 창문 영역(wh) 안에서만 렌더, 넘치지 않음
        if (this.rainDrops.length > 0) {
          this.rainDrops.forEach(d => {
            const endY = Math.min(d.y + d.len, wh - 3); // 창문 하단 넘지 않음
            if (d.y < wh - 3) {
              pg.lineStyle(1, 0x8ab8d8, 0.25 + Math.random() * 0.12);
              pg.lineBetween(d.x, d.y, d.x - 0.3, endY);
            }
            d.y += d.speed; d.x -= 0.15;
            if (d.y > wh - 2) { d.y = -(d.len + 6); d.x = Math.random() * WORLD_W; }
            if (d.x < 0) d.x += WORLD_W;
          });
        }
        // 눈 — 창문 영역 안에서만
        if (this.snowFlakes.length > 0) {
          this.snowFlakes.forEach(f => {
            if (f.y < wh - 2) {
              pg.fillStyle(0xeeeeff, 0.6);
              pg.fillCircle(f.x, f.y, f.size);
            }
            f.y += f.speed;
            f.x += f.dx + Math.sin(f.y * 0.05) * 0.25;
            if (f.y > wh - 2) { f.y = -4; f.x = Math.random() * WORLD_W; }
            if (f.x < 0) f.x += WORLD_W;
            if (f.x > WORLD_W) f.x -= WORLD_W;
          });
        }
      }
    }

    // ── 번개 번쩍임 ────────────────────────────────────────────
    if (this.weatherCode >= 95) {
      this.thunderTimer--;
      if (this.thunderTimer <= 0) {
        this.thunderTimer = 120 + Math.floor(Math.random() * 300);
        const flash = this.add.rectangle(0, 0, WORLD_W, wh, 0xffffff, 0.45)
          .setDepth(20).setOrigin(0, 0);
        this.tweens.add({
          targets: flash, alpha: 0, duration: 160,
          onComplete: () => { if (flash.active) flash.destroy(); },
        });
      }
    }

    // ── 말풍선 위치 동기화 (머리 위, scene 좌표) ────────────────
    this.workingSet.forEach(teamId => {
      const tg = this.teamGroups.get(teamId);
      if (!tg) return;
      const isSolo = tg.config.chars.length === 1;
      tg.members.forEach(m => {
        if (m.bubble) {
          const hx = tg.container.x + (isSolo ? 0 : m.baseX);
          const hy = tg.container.y + (isSolo ? -30 : m.baseY - 22);
          m.bubble.setPosition(hx, hy);
        }
      });
    });
  }
}
