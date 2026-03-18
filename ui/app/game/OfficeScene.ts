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
    { id: "cpo-claude", name: "CPO 클로드", emoji: "🧠", chars: [3], gridX: 10, gridY: 10, gridW: 2, gridH: 4 },
    { id: "trading-bot", name: "매매봇", emoji: "🤖", chars: [0, 3, 4, 5], gridX: 1, gridY: 4, gridW: 4, gridH: 4 },
    { id: "date-map", name: "데이트지도", emoji: "🗺️", chars: [1, 5, 3, 0], gridX: 6, gridY: 4, gridW: 4, gridH: 4 },
    { id: "claude-biseo", name: "클로드비서", emoji: "🤵", chars: [2, 4, 5, 1], gridX: 11, gridY: 4, gridW: 4, gridH: 4 },
    { id: "ai900", name: "AI900", emoji: "📚", chars: [3, 0, 1, 2], gridX: 16, gridY: 4, gridW: 4, gridH: 4 },
    { id: "cl600g", name: "CL600G", emoji: "⚡", chars: [4, 2, 0, 3], gridX: 3, gridY: 10, gridW: 4, gridH: 4 },
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
      "floor_tile","wall_tile","whiteboard","coffee_table"];
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
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
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

    // ── 사무실 바닥 (밝은 흰색 대리석) ──
    const floorG = this.add.graphics();
    const fy = WALL_H * TILE;
    const fh = (ROWS - WALL_H) * TILE;
    const tileSize = 64;
    for (let y = fy; y < fy + fh; y += tileSize) {
      for (let x = 0; x < WORLD_W; x += tileSize) {
        const isLight = ((x / tileSize) + ((y - fy) / tileSize)) % 2 === 0;
        floorG.fillStyle(isLight ? 0xe8e8ee : 0xdcdce4, 1);
        floorG.fillRect(x, y, tileSize, tileSize);
        // 대리석 결
        floorG.fillStyle(isLight ? 0xf0f0f4 : 0xe2e2ea, 0.25);
        for (let s = 3; s < tileSize; s += 10) {
          floorG.fillRect(x + s, y, 1, tileSize);
        }
        for (let s = 5; s < tileSize; s += 14) {
          floorG.fillRect(x, y + s, tileSize, 1);
        }
        // 광택 하이라이트
        floorG.fillStyle(0xffffff, 0.08);
        floorG.fillRect(x, y, tileSize, 2);
        floorG.fillRect(x, y, 2, tileSize);
        // 줄눈
        floorG.fillStyle(0xc0c0c8, 0.4);
        floorG.fillRect(x + tileSize - 1, y, 1, tileSize);
        floorG.fillRect(x, y + tileSize - 1, tileSize, 1);
      }
    }
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

    // ── 계절별 나무 (삼각형 실루엣 + 동그라미 뭉글뭉글) ─────────
    const nightT = isNight || hr < 6.5 || hr >= 20.5;
    const sR = (a: number, b: number) =>
      (((a * 1664525 + b * 1013904223) | 0) >>> 1) / 0x7fffffff;

    // 나무는 빌딩 앞 + 창틀 뒤 (depth 6, 창틀 그래픽은 g에 나중에 그려짐)
    const treeG = this.add.graphics().setDepth(6);
    this.envGroup.add(treeG);

    // 계절 색상: [그림자, 어두운, 중간, 밝은, 하이라이트]
    const seasonCols = mon >= 3 && mon <= 5
      ? [0x98607a, 0xc07898, 0xd898b0, 0xe8b0c8, 0xf0c8d8]  // 봄
      : mon >= 6 && mon <= 8
      ? [0x0e3810, 0x1a5818, 0x287820, 0x389828, 0x48b038]  // 여름
      : mon >= 9 && mon <= 11
      ? [0x802810, 0xa84818, 0xc86820, 0xd88828, 0xe8a838]  // 가을
      : [];
    const evCols = [0x082810, 0x143c18, 0x205020, 0x2c6828, 0x387830];

    const positions = [20, 58, 105, 155, 218, 272, 340, 400, 462, 530, 582, 645, 705, 758, 810];
    const ty = wh - 3;

    positions.forEach(tx => {
      if (sR(tx, 55) < 0.12) return;

      const sz = sR(tx, 3); // 0~1
      const isEv = sR(tx, 90) > 0.8;
      const cols = isEv ? evCols : seasonCols;
      const isWinter = mon === 12 || mon <= 2;

      // 나무 전체 크기 (약간 축소)
      const treeH = 16 + (sz * 22 | 0); // 16~38
      const treeW = 8 + (sz * 13 | 0);  // 8~21 (반폭 기준)
      const trunkH = 6 + (sz * 4 | 0);  // 줄기 보이는 부분 6~10
      const trunkW = sz > 0.6 ? 3 : 2;

      // ── 줄기 ──
      const tc = nightT ? 0x151010 : 0x4a3018;
      treeG.fillStyle(tc, 0.95);
      treeG.fillRect(tx - (trunkW >> 1), ty - trunkH, trunkW, trunkH);

      // ── 겨울: 앙상한 가지 ──
      if (isWinter) {
        const wH = 12 + (sz * 14 | 0);
        treeG.fillStyle(tc, 0.95);
        treeG.fillRect(tx - (trunkW >> 1), ty - wH, trunkW, wH);
        const brC = nightT ? 0x111010 : 0x3a3030;
        treeG.fillStyle(brC, 0.8);
        const bN = 3 + (sz * 3 | 0);
        for (let b = 0; b < bN; b++) {
          const side = sR(tx, b * 3 + 40) > 0.5 ? 1 : -1;
          const bLen = 4 + (sR(tx, b * 3 + 41) * 8 | 0);
          const by = ty - wH + 2 + (b * ((wH * 0.55) / bN) | 0);
          const bx = side > 0 ? tx + 1 : tx - bLen;
          treeG.fillRect(bx, by, bLen, 1);
          if (bLen > 5) treeG.fillRect(side > 0 ? bx + bLen - 1 : bx, by - 1, 1, 1);
        }
        if (sR(tx, 55) > 0.35) {
          treeG.fillStyle(0xddeeff, 0.45);
          treeG.fillRect(tx - 3, ty - wH + 3, 3, 1);
        }
        return;
      }

      // ── 수관: 삼각형 범위 안에 동그라미 가득 ──
      const canopyTop = ty - treeH;
      const canopyBot = ty - trunkH + 3; // 줄기 덮음
      const canopyH = canopyBot - canopyTop;

      // 동그라미 배치: 삼각형을 빈틈없이 채움
      // 균등 그리드 + 시드 jitter → 원끼리 반드시 겹침
      const baseR = treeW * 0.35; // 크게 (겹침 보장)
      const rows = 4 + (sz * 2 | 0); // 4~6줄
      const step = canopyH / (rows + 0.5);

      for (let row = 0; row < rows; row++) {
        const yRatio = (row + 0.3) / rows;
        const cy = canopyTop + step * (row + 0.5);

        // 삼각형 폭: 위에서 좁고 아래서 넓음
        const widthAtY = treeW * (0.25 + yRatio * 0.75);
        // 한 줄에 2~4개 (폭에 따라)
        const perRow = Math.max(2, Math.round(widthAtY / (baseR * 0.8)));

        for (let col = 0; col < perRow; col++) {
          // 균등 배치 + 살짝 jitter
          const xBase = -widthAtY * 0.5 + widthAtY * (col + 0.5) / perRow;
          const jx = (sR(tx, row * 17 + col * 7 + 10) - 0.5) * baseR * 0.5;
          const jy = (sR(tx, row * 17 + col * 7 + 11) - 0.5) * step * 0.3;
          const cx = tx + xBase + jx;
          const ccY = cy + jy;

          // 원 크기: 기본 + 약간 랜덤 (크게 유지해서 겹침)
          const cr = baseR * (0.85 + sR(tx, row * 17 + col * 7 + 13) * 0.3);

          if (nightT) {
            // 야간: 거의 검은 실루엣 + 미세한 색 힌트
            treeG.fillStyle(0x050805, 0.92);
            treeG.fillCircle(cx, ccY, cr);
            treeG.fillStyle(cols[1] || 0x0a1a08, 0.08);
            treeG.fillCircle(cx, ccY, cr);
          } else {
            // 그림자 (오른쪽 아래)
            treeG.fillStyle(cols[0], 0.35);
            treeG.fillCircle(cx + 1, ccY + 1, cr);
            // 메인 (줄마다 색 변화)
            const mi = 1 + ((row + col + (tx & 3)) % (cols.length - 2));
            treeG.fillStyle(cols[mi], 0.92);
            treeG.fillCircle(cx, ccY, cr);
            // 하이라이트 (상단 2줄만)
            if (row < 2) {
              treeG.fillStyle(cols[cols.length - 1], 0.25);
              treeG.fillCircle(cx - cr * 0.15, ccY - cr * 0.15, cr * 0.4);
            }
          }
        }
      }

      // 봄: 꽃잎 점
      if (mon >= 3 && mon <= 5 && !nightT && sR(tx, 12) > 0.3) {
        for (let p = 0; p < 3; p++) {
          const px = tx + ((sR(tx, p * 7 + 20) - 0.5) * treeW * 1.4) | 0;
          const py = canopyTop + (sR(tx, p * 7 + 21) * canopyH * 0.8) | 0;
          treeG.fillStyle(0xffdde8, 0.65);
          treeG.fillCircle(px, py, 1.5);
        }
      }

      // 쌍둥이: 일부 위치에 작은 나무 추가
      if (sR(tx, 88) > 0.82) {
        const tx2 = tx + 18 + (sR(tx, 66) * 6 | 0);
        const sz2 = 0.15 + sR(tx, 44) * 0.25;
        const h2 = 14 + (sz2 * 12 | 0);
        const w2 = 6 + (sz2 * 6 | 0);
        const r2 = w2 * 0.22;
        const ct2 = ty - h2;
        const cb2 = ty - 3;
        const ch2 = cb2 - ct2;
        treeG.fillStyle(tc, 0.9);
        treeG.fillRect(tx2, ty - 4, 2, 4);
        for (let c = 0; c < 5; c++) {
          const yr = sR(tx2, c * 7 + 10) * 0.8 + 0.1;
          const wd = w2 * (0.2 + yr * 0.8);
          const ccx = tx2 + ((sR(tx2, c * 7 + 12) - 0.5) * wd * 1.4);
          const ccy = ct2 + yr * ch2;
          const ccr = r2 * (0.7 + sR(tx2, c * 7 + 13) * 0.4);
          if (nightT) {
            treeG.fillStyle(0x050805, 0.9);
            treeG.fillCircle(ccx, ccy, ccr);
          } else {
            treeG.fillStyle(cols[0], 0.35);
            treeG.fillCircle(ccx + 0.5, ccy + 0.5, ccr);
            treeG.fillStyle(cols[2], 0.88);
            treeG.fillCircle(ccx, ccy, ccr);
          }
        }
      }
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
    // 서버실 영역: 우측 5칸 x 전체 높이(벽 제외)
    const srX = (COLS - 5) * TILE;
    const srY = WALL_H * TILE;
    const srW = 5 * TILE;
    const srH = Math.floor((ROWS - WALL_H - 3) / 2) * TILE; // 반토막

    // 서버실 바닥 (어두운 톤)
    g.fillStyle(0x2a2a3a, 1);
    g.fillRect(srX, srY, srW, srH);
    // 바닥 패턴 (서버실 느낌 — 격자)
    g.lineStyle(1, 0x333345, 0.4);
    for (let y = srY; y < srY + srH; y += 16) g.lineBetween(srX, y, srX + srW, y);
    for (let x = srX; x < srX + srW; x += 16) g.lineBetween(x, srY, x, srY + srH);

    // 좌측 벽 (사무실과 구분)
    g.fillStyle(0x4a4a5a, 1);
    g.fillRect(srX - 3, srY, 6, srH);
    // 벽 하이라이트
    g.fillStyle(0x5a5a6a, 0.5);
    g.fillRect(srX - 2, srY, 1, srH);

    // 출입구 (벽 중간에 빈 공간)
    const doorY = srY + srH / 2 - 16;
    g.fillStyle(0x2a2a3a, 1);
    g.fillRect(srX - 3, doorY, 6, 32);
    // 문 프레임
    g.lineStyle(1, 0x5a5a6a, 0.6);
    g.strokeRect(srX - 3, doorY, 6, 32);

    // 서버 랙들 (세로 직사각형)
    for (let ry = 0; ry < 3; ry++) {
      const rackX = srX + 16;
      const rackY = srY + 20 + ry * 50;
      // 랙 본체
      g.fillStyle(0x1a1a2a, 1);
      g.fillRect(rackX, rackY, 24, 40);
      g.fillStyle(0x222235, 1);
      g.fillRect(rackX + 2, rackY + 2, 20, 36);
      // 서버 유닛 (가로 줄)
      for (let u = 0; u < 5; u++) {
        g.fillStyle(0x2a2a40, 1);
        g.fillRect(rackX + 3, rackY + 4 + u * 7, 18, 5);
        // LED
        g.fillStyle(u % 2 === 0 ? 0x40d080 : 0x40a0d0, 0.8);
        g.fillRect(rackX + 4, rackY + 5 + u * 7, 2, 2);
        g.fillStyle(0x40d080, 0.5);
        g.fillRect(rackX + 8, rackY + 5 + u * 7, 2, 2);
      }
    }

    // 우측에도 랙 (1개만)
    for (let ry = 0; ry < 1; ry++) {
      const rackX = srX + srW - 42;
      const rackY = srY + 30 + ry * 60;
      g.fillStyle(0x1a1a2a, 1);
      g.fillRect(rackX, rackY, 24, 40);
      g.fillStyle(0x222235, 1);
      g.fillRect(rackX + 2, rackY + 2, 20, 36);
      for (let u = 0; u < 5; u++) {
        g.fillStyle(0x2a2a40, 1);
        g.fillRect(rackX + 3, rackY + 4 + u * 7, 18, 5);
        g.fillStyle(0x40d080, 0.6);
        g.fillRect(rackX + 4, rackY + 5 + u * 7, 2, 2);
      }
    }

    // "SERVER ROOM" 라벨
    this.envGroup.add(g);
    const srLabel = this.add.text(srX + srW / 2, srY + 10, "🖥 서버실", {
      fontSize: "13px", fontFamily: FONT,
      color: "#60d090", resolution: DPR * 2,
    }).setOrigin(0.5);
    this.envGroup.add(srLabel);

    // 서버실 모니터 (클릭 가능)
    const monX = srX + srW - 30;
    const monY = srY + 30;
    const monG = this.add.graphics();
    monG.fillStyle(0x222233, 1); monG.fillRect(monX - 16, monY - 12, 32, 24);
    monG.fillStyle(0x1a2a40, 1); monG.fillRect(monX - 14, monY - 10, 28, 18);
    monG.fillStyle(0x50d070, 0.8); monG.fillRect(monX - 12, monY - 8, 10, 1);
    monG.fillStyle(0x60a0e0, 0.7); monG.fillRect(monX - 12, monY - 5, 16, 1);
    monG.fillStyle(0x50d070, 0.6); monG.fillRect(monX - 12, monY - 2, 8, 1);
    monG.fillStyle(0xd0a050, 0.5); monG.fillRect(monX - 12, monY + 1, 12, 1);
    monG.fillStyle(0x333344, 1); monG.fillRect(monX - 2, monY + 12, 4, 3);
    monG.fillStyle(0x444455, 1); monG.fillRect(monX - 8, monY + 15, 16, 2);
    this.envGroup.add(monG);

    // 모니터 클릭 영역
    const monHit = this.add.zone(monX, monY, 36, 28).setInteractive({ useHandCursor: true });
    monHit.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      const cam = this.cameras.main;
      const canvas = this.game.canvas;
      const rect = canvas.getBoundingClientRect();
      const sx = rect.left + (monX - cam.scrollX) * (rect.width / cam.width);
      const sy = rect.top + (monY - cam.scrollY) * (rect.height / cam.height);
      this.onTeamClick?.("server-monitor", Math.round(sx), Math.round(sy));
    });
    this.envGroup.add(monHit);

    const monLabel = this.add.text(monX, monY + 22, "점검", {
      fontSize: "11px", fontFamily: FONT,
      color: "#60d090", resolution: DPR * 2,
    }).setOrigin(0.5);
    this.envGroup.add(monLabel);

    // 서버실 영역 점유 (반토막)
    const srRows = Math.floor((ROWS - WALL_H - 3) / 2);
    for (let y = WALL_H; y < WALL_H + srRows; y++)
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
    const wallY = WALL_H * TILE + 12;
    const corY = (ROWS - 3) * TILE;
    const srvX = (COLS - 5) * TILE;

    // ── 좌측 벽면 — 벽장 (벽 아래, 겹침 없게) ──
    this.envGroup.add(this.add.image(30, wallY + 35, "wall_cabinet").setScale(1.2));
    this.envGroup.add(this.add.image(30, wallY + 115, "wall_cabinet").setScale(1.2));

    // ── 서버실 벽 옆 — 벽장 (벽에서 충분히 떨어지게) ──
    this.envGroup.add(this.add.image(srvX - 40, wallY + 50, "wall_cabinet").setScale(1.2));

    // ── 정수기 (좌측 하단, 고퀄 그래픽스) ──
    const wc = this.add.graphics();
    const wcX = 24, wcY = corY - 42;
    wc.fillStyle(0x5599cc, 1); wc.fillRect(wcX, wcY, 14, 12); // 물통
    wc.fillStyle(0x77bbee, 1); wc.fillRect(wcX + 2, wcY + 2, 10, 8);
    wc.fillStyle(0xaaddff, 0.4); wc.fillRect(wcX + 3, wcY + 3, 4, 6); // 반사
    wc.fillStyle(0xcccccc, 1); wc.fillRect(wcX - 1, wcY + 12, 16, 24); // 본체
    wc.fillStyle(0xdddddd, 1); wc.fillRect(wcX + 1, wcY + 14, 12, 20);
    wc.fillStyle(0x4444ff, 1); wc.fillRect(wcX + 2, wcY + 18, 4, 3); // 차가운물
    wc.fillStyle(0xff4444, 1); wc.fillRect(wcX + 8, wcY + 18, 4, 3); // 뜨거운물
    wc.fillStyle(0xaaaaaa, 1); wc.fillRect(wcX - 2, wcY + 36, 18, 4); // 받침
    this.envGroup.add(wc);

    // ── 창가 선인장 ──
    this.envGroup.add(this.add.image(8 * TILE, wallY + 6, "cactus").setScale(SCALE));
    this.envGroup.add(this.add.image(15 * TILE, wallY + 6, "cactus").setScale(SCALE));

    // ── 쓰레기통 ──
    this.envGroup.add(this.add.image(srvX - 40, corY - 16, "bin").setScale(SCALE));

    // ── 천장 조명 반사 ──
    [5, 11, 17].forEach(col => {
      [6, 12].forEach(row => {
        this.envGroup.add(this.add.image(col * TILE, row * TILE, "light_glow").setScale(2));
      });
    });

    // ── 걸레받이 ──
    const baseG = this.add.graphics();
    baseG.fillStyle(0xc0c0c8, 0.3);
    baseG.fillRect(0, WALL_H * TILE, srvX, 2);
    this.envGroup.add(baseG);
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
    // Pixel Agents 에셋 비율 맞추기
    // DESK=48x32, PC=16x32(세로 길음, 상단 절반만 보이게), CHAR=16x16
    // 모든 에셋 동일 스케일, PC는 cropY로 모니터 부분만
    const members: MemberSprite[] = [];
    // 2x2 등맞대기 — 그래픽스 모니터
    const S = 1.0;
    const gapX = 34;
    const rowGap = 24;

    // 모니터 그리기 헬퍼
    const drawMonFront = (g: Phaser.GameObjects.Graphics) => {
      g.fillStyle(0x2a2a2a, 1); g.fillRect(-10, -10, 20, 14);
      g.fillStyle(0x1a2a40, 1); g.fillRect(-8, -8, 16, 10);
      g.fillStyle(0x50d070, 0.9); g.fillRect(-6, -6, 7, 1);
      g.fillStyle(0x60a0e0, 0.8); g.fillRect(-6, -4, 10, 1);
      g.fillStyle(0x50d070, 0.7); g.fillRect(-6, -2, 5, 1);
      g.fillStyle(0xd0a050, 0.6); g.fillRect(-6, 0, 8, 1);
      g.fillStyle(0x444444, 1); g.fillRect(-1, 4, 2, 3);
      g.fillStyle(0x555555, 1); g.fillRect(-5, 7, 10, 2);
    };
    const drawMonBack = (g: Phaser.GameObjects.Graphics) => {
      g.fillStyle(0x2a2a2a, 1); g.fillRect(-10, -4, 20, 14);
      g.fillStyle(0x3a3a3a, 1); g.fillRect(-8, -2, 16, 10);
      g.fillStyle(0x444444, 1); g.fillRect(-1, 10, 2, 3);
      g.fillStyle(0x555555, 1); g.fillRect(-5, 13, 10, 2);
    };

    const isSolo = t.chars.length === 1;

    t.chars.forEach((charIdx, i) => {
      if (i >= 4) return;

      // 1인(CPO) — 코드로 정면 전신 미니미 그리기
      if (isSolo) {
        const cg = this.add.graphics().setDepth(3);
        // 머리 (둥글게)
        cg.fillStyle(0xfcd9a8, 1); cg.fillCircle(0, -10, 7);
        // 머리카락
        cg.fillStyle(0x333333, 1); cg.fillRect(-7, -17, 14, 5);
        cg.fillRect(-7, -14, 3, 6); cg.fillRect(4, -14, 3, 6);
        // 눈
        cg.fillStyle(0x222222, 1); cg.fillRect(-4, -11, 2, 2); cg.fillRect(2, -11, 2, 2);
        cg.fillStyle(0xffffff, 1); cg.fillRect(-4, -11, 1, 1); cg.fillRect(2, -11, 1, 1);
        // 입
        cg.fillStyle(0xe0a080, 1); cg.fillRect(-2, -7, 4, 1);
        // 셔츠 (파란색)
        cg.fillStyle(0x3366aa, 1); cg.fillRect(-6, -3, 12, 10);
        cg.fillStyle(0x4477bb, 1); cg.fillRect(-5, -2, 10, 8);
        // 넥타이
        cg.fillStyle(0xcc3333, 1); cg.fillRect(-1, -2, 2, 7);
        // 팔
        cg.fillStyle(0xfcd9a8, 1); cg.fillRect(-8, -2, 3, 8); cg.fillRect(5, -2, 3, 8);
        // 바지
        cg.fillStyle(0x2a2a3a, 1); cg.fillRect(-5, 7, 4, 8); cg.fillRect(1, 7, 4, 8);
        // 신발
        cg.fillStyle(0x222222, 1); cg.fillRect(-6, 15, 5, 2); cg.fillRect(1, 15, 5, 2);
        container.add(cg);

        // 더미 sprite (애니메이션/참조용)
        const char = this.add.sprite(0, 100, `char_${charIdx}`, 0)
          .setScale(0.01).setAlpha(0);
        container.add(char);
        members.push({ char, charIdx, baseX: 0, baseY: 0 });
        return;
      }

      const isTop = i < 2;
      const col = i % 2;
      const dx = col === 0 ? -gapX / 2 : gapX / 2;

      if (isTop) {
        // 윗줄: 모니터 → 책상 → 캐릭(앞)
        const baseY = -rowGap / 2 - 2;
        const mon = this.add.graphics().setDepth(1);
        drawMonFront(mon);
        mon.setPosition(dx, baseY - 6);
        container.add(mon);
        container.add(this.add.image(dx, baseY + 4, "desk_front").setScale(S * 0.55, S * 0.65).setDepth(2));
        const char = this.add.sprite(dx, baseY + 16, `char_${charIdx}`, 0)
          .setScale(S).setDepth(3).play(`char_${charIdx}_idle`);
        container.add(char);
        members.push({ char, charIdx, baseX: dx, baseY: baseY + 16 });
      } else {
        // 아랫줄: 캐릭(뒤) → 책상 → 모니터뒷면
        const baseY = rowGap / 2 + 2;
        const char = this.add.sprite(dx, baseY - 16, `char_${charIdx}`, 3 * 7)
          .setScale(S).setDepth(1);
        container.add(char);
        container.add(this.add.image(dx, baseY - 4, "desk_front").setScale(S * 0.55, S * 0.65).setDepth(2));
        const mon = this.add.graphics().setDepth(3);
        drawMonBack(mon);
        mon.setPosition(dx, baseY - 10);
        container.add(mon);
        members.push({ char, charIdx, baseX: dx, baseY: baseY - 16 });
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

    t.container.setDepth(0);
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
      m.char.play(`char_${m.charIdx}_walk_down`);
      const mx = Phaser.Math.Between(-2, 2);
      this.tweens.add({ targets: m.char, x: m.baseX + mx, duration: 350, ease: "Sine.easeInOut",
        onComplete: () => {
          m.char.play(`char_${m.charIdx}_idle`);
          this.tweens.add({ targets: m.char, x: m.baseX, duration: 300, ease: "Sine.easeInOut" });
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
      tg.container.add(glow);
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
      m.char.play(working ? `char_${m.charIdx}_type` : `char_${m.charIdx}_idle`);

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
