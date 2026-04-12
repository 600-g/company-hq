/**
 * 타이쿤 사무실 씬
 * - 층 시스템 (1F~3F 전환)
 * - 상단 통창 + 날씨
 * - 2x2 팀 배치, 그리드 겹침 방지
 * - 콤팩트 캐릭터
 */

import * as Phaser from "phaser";
import { preloadAssets, registerCharAnims, createCustomFurniture, NPC_POOL_SIZE, PRIMARY_CHAR_POOL_SIZE } from "./sprites";

// ─────────────────────────────────────────
// NPC 랜덤 픽 (팀 ID 시드 기반 — 리로드 간 동일 결과)
// ─────────────────────────────────────────
function hashString(s: string): number {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F9) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickNpcs(teamId: string, count: number = 3): string[] {
  const pool: string[] = [];
  for (let i = 1; i <= NPC_POOL_SIZE; i++) {
    pool.push(`npc_${String(i).padStart(2, "0")}`);
  }
  const rand = mulberry32(hashString(teamId));
  // Fisher-Yates partial shuffle (duplicates allowed across teams via seed independence)
  const picks: string[] = [];
  for (let i = 0; i < count; i++) {
    picks.push(pool[Math.floor(rand() * pool.length)]!);
  }
  return picks;
}

/** 팀 id + primary 캐릭터 2개 → [primary1, primary2, ...2 random NPCs] */
function buildTeamChars(teamId: string, primaries: readonly [number, number]): (number | string)[] {
  return [primaries[0], primaries[1], ...pickNpcs(teamId, 2)];
}

const TILE = 32;
const COLS = 26;
const ROWS = 18;
const WORLD_W = COLS * TILE;
const WORLD_H = ROWS * TILE;
const WALL_H = 3; // 벽(통창) 높이 — 3칸으로 확장 (96px)
const DPR = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 3) : 2;
const TEXT_RES = 8; // 텍스트 전용 최고 해상도 (DPR 무관 고정 8x)
const FONT = "'Pretendard Variable', Pretendard, -apple-system, sans-serif";
// 팀 라벨용 폰트 — Pretendard Variable 단일 기반
// (PokemonClearBold는 @font-face 미정의 + PokemonClear는 400/700만 있어 600이 폴백 불안정 → weight 불규칙 문제)
// Pretendard Variable은 100~900 전 weight 지원하므로 600 semibold 일관 적용됨
const POKEMON_FONT = "'Pretendard Variable', Pretendard, -apple-system, sans-serif";

interface TeamConfig {
  id: string; name: string; emoji: string;
  chars: (number | string)[]; gridX: number; gridY: number; gridW: number; gridH: number;
}

// 팀 메타데이터 (서버 floor_layout.json이 층 배치의 소스오브트루스)
// gridX/gridY = 기본 위치. localStorage로 덮어씌워짐.
// 팀 메타 — 서버 동기화 시 동적으로 업데이트됨
// 팀별 primary 캐릭터 2개 (0 ~ PRIMARY_CHAR_POOL_SIZE-1, 전체 팀 간 중복 없음)
// 0~19: 기본 캐릭터 / 20~29: phone001~010 / 30~207: 이름 있는 트레이너
// 나머지 2명은 buildTeamChars()가 NPC 풀에서 시드 기반으로 픽
const PRIMARY_CHARS: Record<string, [number, number]> = {
  "trading-bot":   [0, 100],
  "date-map":      [4, 104],
  "claude-biseo":  [8, 108],
  "ai900":         [12, 112],
  "design-team":   [16, 116],
  "content-lab":   [1, 101],
  "frontend-team": [2, 102],
  "backend-team":  [3, 103],
  "qa-agent":      [5, 105],
};

/** 이미 쓰인 primary 집합 */
function usedPrimarySet(): Set<number> {
  const used = new Set<number>();
  for (const pair of Object.values(PRIMARY_CHARS)) {
    used.add(pair[0]);
    used.add(pair[1]);
  }
  return used;
}

/** 사용 중이지 않은 primary 2개를 결정적으로 할당 (teamId 해시 시드) */
function allocatePrimaryPair(teamId: string): [number, number] {
  const used = usedPrimarySet();
  const rand = mulberry32(hashString(teamId));
  const picks: number[] = [];
  // 1차: 사용되지 않은 슬롯 중 시드 기반 랜덤 픽
  const available: number[] = [];
  for (let i = 0; i < PRIMARY_CHAR_POOL_SIZE; i++) {
    if (!used.has(i)) available.push(i);
  }
  while (picks.length < 2 && available.length > 0) {
    const idx = Math.floor(rand() * available.length);
    picks.push(available.splice(idx, 1)[0]!);
  }
  // 풀 소진 시 해시 폴백 (중복 허용)
  while (picks.length < 2) {
    picks.push(hashString(teamId + "#" + picks.length) % PRIMARY_CHAR_POOL_SIZE);
  }
  return [picks[0]!, picks[1]!];
}

const TEAM_META: Record<string, Omit<TeamConfig, "id" | "gridX" | "gridY">> = {
  "trading-bot":   { name: "매매봇",    emoji: "🤖", chars: buildTeamChars("trading-bot",   PRIMARY_CHARS["trading-bot"]!),   gridW: 4, gridH: 4 },
  "date-map":      { name: "데이트지도", emoji: "🗺️", chars: buildTeamChars("date-map",      PRIMARY_CHARS["date-map"]!),      gridW: 4, gridH: 4 },
  "claude-biseo":  { name: "클로드비서", emoji: "🤵", chars: buildTeamChars("claude-biseo",  PRIMARY_CHARS["claude-biseo"]!),  gridW: 4, gridH: 4 },
  "ai900":         { name: "AI900",     emoji: "📚", chars: buildTeamChars("ai900",         PRIMARY_CHARS["ai900"]!),         gridW: 4, gridH: 4 },
  "design-team":   { name: "디자인팀",  emoji: "🎨", chars: buildTeamChars("design-team",   PRIMARY_CHARS["design-team"]!),   gridW: 4, gridH: 4 },
  "content-lab":   { name: "콘텐츠랩",  emoji: "🔬", chars: buildTeamChars("content-lab",   PRIMARY_CHARS["content-lab"]!),   gridW: 4, gridH: 4 },
  "frontend-team": { name: "프론트엔드",emoji: "🖼",  chars: buildTeamChars("frontend-team", PRIMARY_CHARS["frontend-team"]!), gridW: 4, gridH: 4 },
  "backend-team":  { name: "백엔드",    emoji: "⚙️", chars: buildTeamChars("backend-team",  PRIMARY_CHARS["backend-team"]!),  gridW: 4, gridH: 4 },
  "qa-agent":      { name: "QA에이전트",emoji: "🧪", chars: buildTeamChars("qa-agent",      PRIMARY_CHARS["qa-agent"]!),      gridW: 4, gridH: 4 },
};

/** 서버에서 받은 팀 정보로 TEAM_META에 없는 팀 자동 등록 */
function ensureTeamMeta(t: { id: string; name?: string; emoji?: string }) {
  if (!TEAM_META[t.id]) {
    const pair = allocatePrimaryPair(t.id);
    PRIMARY_CHARS[t.id] = pair;
    TEAM_META[t.id] = {
      name: t.name || t.id,
      emoji: t.emoji || "🤖",
      chars: buildTeamChars(t.id, pair),
      gridW: 4, gridH: 4,
    };
  }
}

// 서버 floor_layout.json과 동기화된 기본 배치 (폴백)
// 실제 배치는 서버 GET /api/layout/floors에서 로드
let ALL_FLOORS: Record<number, TeamConfig[]> = {
  1: [
    { id: "claude-biseo",  gridX: 1,  gridY: 4, ...TEAM_META["claude-biseo"]! },
    { id: "frontend-team", gridX: 6,  gridY: 4, ...TEAM_META["frontend-team"]! },
    { id: "backend-team",  gridX: 11, gridY: 4, ...TEAM_META["backend-team"]! },
    { id: "content-lab",   gridX: 16, gridY: 4, ...TEAM_META["content-lab"]! },
  ],
  2: [
    { id: "trading-bot",   gridX: 1,  gridY: 4, ...TEAM_META["trading-bot"]! },
    { id: "ai900",         gridX: 6,  gridY: 4, ...TEAM_META["ai900"]! },
    { id: "design-team",   gridX: 11, gridY: 4, ...TEAM_META["design-team"]! },
    { id: "date-map",      gridX: 16, gridY: 4, ...TEAM_META["date-map"]! },
  ],
};

interface MemberSprite { char: Phaser.GameObjects.Sprite; charIdx: number | string; baseX: number; baseY: number; bubble?: Phaser.GameObjects.Container; }
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
  private apiBase = "";
  private serverPositions: Record<string, { floor: number; gx: number; gy: number }> | null = null;
  private particleGraphics: Phaser.GameObjects.Graphics | null = null;
  private rainDrops: { x: number; y: number; speed: number; len: number }[] = [];
  private snowFlakes: { x: number; y: number; speed: number; size: number; dx: number }[] = [];
  private thunderTimer = 60;

  constructor() { super({ key: "OfficeScene" }); }

  init(data: {
    onTeamClick?: (id: string, screenX?: number, screenY?: number) => void;
    weatherCode?: number;
    apiBase?: string;
  }) {
    this.onTeamClick = data.onTeamClick;
    this.weatherCode = data.weatherCode ?? 0;

    // 서버에서 층 배치 동적 로드 (실패 시 하드코딩 폴백 사용)
    const apiBase = data.apiBase || "";
    this.apiBase = apiBase;
    // 서버 저장 위치 먼저 로드 (웹/모바일 동기화)
    if (apiBase) {
      fetch(`${apiBase}/api/layout/positions`)
        .then(r => r.json())
        .then((resp: any) => {
          if (resp.ok && resp.positions) {
            this.serverPositions = resp.positions;
            // 현재 층 다시 빌드해 저장 위치 반영
            this.buildFloor(this.currentFloor);
          }
        })
        .catch(() => {});
    }
    if (apiBase) {
      fetch(`${apiBase}/api/layout/floors`)
        .then(r => r.json())
        .then((resp: any) => {
          if (resp.ok && resp.floors) {
            const serverFloors: Record<number, TeamConfig[]> = {};
            const defaultPositions = [
              { gridX: 1, gridY: 4 }, { gridX: 6, gridY: 4 },
              { gridX: 11, gridY: 4 }, { gridX: 16, gridY: 4 },
              { gridX: 1, gridY: 9 }, { gridX: 6, gridY: 9 },
            ];
            for (const f of resp.floors) {
              const floorNum = f.floor;
              serverFloors[floorNum] = f.teams
                .map((t: any, i: number) => {
                  ensureTeamMeta(t);
                  return {
                    id: t.id,
                    gridX: defaultPositions[i]?.gridX ?? 1,
                    gridY: defaultPositions[i]?.gridY ?? 4,
                    ...TEAM_META[t.id]!,
                  };
                });
            }
            if (Object.keys(serverFloors).length > 0) {
              ALL_FLOORS = serverFloors;
              this.buildFloor(this.currentFloor);
            }
          }
        })
        .catch(() => { /* 폴백 유지 */ });
    }
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
    keys.push("char_cpo");
    for (let i = 0; i <= 19; i++) keys.push(`char_${i}`);
    for (let i = 1; i <= NPC_POOL_SIZE; i++) {
      keys.push(`char_npc_${String(i).padStart(2, "0")}`);
    }
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

    // 카메라 — roundPixels 명시적 활성화 (서브픽셀 이동 시 픽셀아트 깨짐 방지)
    this.cameras.main.setBounds(-32, -32, WORLD_W + 64, WORLD_H + 64);
    this.cameras.main.setBackgroundColor(0x1a1a2e);
    this.cameras.main.roundPixels = true;

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
    // 기존 제거 — 트윈 먼저 정리 후 소멸 (stuck 스프라이트 방지)
    this.envGroup.clear(true, true);
    this.teamGroups.forEach(tg => {
      tg.members.forEach(m => {
        this.tweens.killTweensOf(m.char);
        if (m.bubble) { m.bubble.destroy(); m.bubble = undefined; }
      });
      if (tg.workGlow) { this.tweens.killTweensOf(tg.workGlow); }
      tg.container.destroy();
    });
    this.teamGroups.clear();

    // 그리드 초기화
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < WALL_H; y++) this.grid[y][x] = true;
    }

    // ── 사무실 바닥 (깨끗한 화이트/라이트 마블 타일) ──
    const fy = WALL_H * TILE;
    const fh = (ROWS - WALL_H) * TILE;
    const tileSize = 32;
    const floorG = this.add.graphics();
    // 베이스: 밝은 화이트/그레이
    floorG.fillStyle(0xf0f0f0, 1);
    floorG.fillRect(0, fy, WORLD_W, fh);
    // 은은한 줄눈 (그리드)
    floorG.fillStyle(0x000000, 0.06);
    for (let x = 0; x <= WORLD_W; x += tileSize) {
      floorG.fillRect(x, fy, 1, fh);
    }
    for (let y = fy; y <= fy + fh; y += tileSize) {
      floorG.fillRect(0, y, WORLD_W, 1);
    }
    // 타일 하이라이트 (밝은 빛 반사)
    floorG.fillStyle(0xffffff, 0.35);
    for (let y = fy; y < fy + fh; y += tileSize) {
      for (let x = 0; x < WORLD_W; x += tileSize) {
        floorG.fillRect(x + 1, y + 1, 2, 1);
      }
    }
    floorG.setDepth(0);
    this.envGroup.add(floorG);

    // ── 통창 ──
    this.drawPanoramaWindow();

    // ── 서버실 ──
    this.drawServerRoom();

    // ── 하단 복도 ──
    this.drawCorridor();

    // ── 사무실 디테일 장식 ──
    this.drawOfficeDetails();

    // ── 구조물/서버실 점유 영역 그리드에 표시 (팀 이동 차단) ──
    // TILE=32, COLS=26, ROWS=18, WALL_H=3 가정
    // 각 영역은 시각적 에셋 실제 위치에 맞춰 넉넉히 마진 포함
    const STRUCTURE_ZONES: Array<{ x: number; y: number; w: number; h: number; label: string }> = [
      // 좌벽: 책장 2개 + 좌상단 plant (x=0~2)
      { x: 0, y: WALL_H, w: 2, h: 5, label: "좌벽_책장" },
      // 좌하단 plant_large (x=0~1, y=12~14)
      { x: 0, y: ROWS - 6, w: 2, h: 3, label: "좌하단_화분" },
      // 우벽: 화이트보드 + 우상단 plant (x=20~22)
      { x: 20, y: WALL_H, w: 2, h: 5, label: "우벽_화이트보드" },
      // 우하단 plant_1 (x=22~24, y=12~14)
      { x: 22, y: ROWS - 6, w: 2, h: 3, label: "우하단_화분" },
      // 서버실 (우상단, 책상+모니터+패드)
      { x: 21, y: WALL_H, w: 5, h: 3, label: "서버실" },
    ];
    STRUCTURE_ZONES.forEach(z => this.occupyGrid(z.x, z.y, z.w, z.h, true));

    // 팀 배치 (저장된 위치 있으면 사용)
    const teams = ALL_FLOORS[floor] || [];
    const saved = this.loadPositions();
    teams.forEach(t => {
      if (saved && saved[t.id]) {
        // 저장 위치가 벽/복도 영역에 걸치지 않도록 clamp
        t.gridX = Math.max(0, Math.min(COLS - t.gridW, saved[t.id].gx));
        t.gridY = Math.max(WALL_H, Math.min(ROWS - t.gridH - 3, saved[t.id].gy));
      }
      this.createTeamGroup(t);
      this.occupyGrid(t.gridX, t.gridY, t.gridW, t.gridH, true);
    });

    // ── CPO: 모든 층에 공용 배치 (엘리베이터 근처 복도 위) ──
    const cpoConfig: TeamConfig = {
      id: "cpo-claude", name: "CPO", emoji: "🧠",
      chars: ["cpo"], gridX: 22, gridY: 11, gridW: 2, gridH: 2,
    };
    if (saved && saved[cpoConfig.id]) {
      cpoConfig.gridX = saved[cpoConfig.id].gx;
      cpoConfig.gridY = saved[cpoConfig.id].gy;
    }
    this.createTeamGroup(cpoConfig);
    this.occupyGrid(cpoConfig.gridX, cpoConfig.gridY, cpoConfig.gridW, cpoConfig.gridH, true);
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

    // 나무 제거 — 도시 실루엣만 유지 (Pokemon 스타일 단순화)
    // treePositions.forEach(({ x, size, isEv }) => {
    //   const treeSeason = isEv ? "evergreen" : season;
    //   const key = `tree_${treeSeason}_${size}`;
    //   const tree = this.add.image(x, wh, key).setOrigin(0.5, 1).setDepth(6);
    //   if (nightT) tree.setTint(0x0a1520);
    //   this.envGroup.add(tree);
    // });
    void treePositions; void nightT;

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
    // 서버실 컴퓨터 워크스테이션 (우상단 구석) — 시각적 요소 + 클릭 영역
    const monX = WORLD_W - 52;
    const monY = WALL_H * TILE + 16;

    // 데스크 (팀 책상과 동일: desk_front = 64x32, center origin)
    const deskCX = monX;
    const deskCY = monY + 32;
    this.envGroup.add(
      this.add.image(deskCX, deskCY, "desk_front").setOrigin(0.5, 0.5).setDepth(50)
    );
    // 모니터 (책상 위 — 팀과 동일 앵커링, bottom-origin at desk top edge)
    this.envGroup.add(
      this.add.image(deskCX, deskCY - 16, "monitor").setOrigin(0.5, 1).setDepth(60)
    );
    // 서버실 라벨
    const label = this.add.text(monX, monY - 6, "SERVER", {
      fontSize: "9px", fontFamily: FONT,
      color: "#4a90d9", resolution: TEXT_RES,
    }).setOrigin(0.5, 1).setDepth(7);
    this.envGroup.add(label);

    // 클릭 영역 (대시보드 트리거)
    const monHit = this.add.zone(monX, monY + 24, 100, 60).setInteractive({ useHandCursor: true }).setDepth(102);
    monHit.on("pointerdown", () => {
      const cam = this.cameras.main;
      const rect = this.game.canvas.getBoundingClientRect();
      const sx = rect.left + (monX - cam.scrollX) * (rect.width / cam.width);
      const sy = rect.top + (monY - cam.scrollY) * (rect.height / cam.height);
      this.onTeamClick?.("server-monitor", Math.round(sx), Math.round(sy));
    });
    this.envGroup.add(monHit);
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

    // 복도 상단 벽 (두꺼운 벽) — 중앙에 1타일(32px) 출입구 갭
    const gapCenterX = WORLD_W / 2;
    const gapW = 32;
    const gapLeft = gapCenterX - gapW / 2;
    const gapRight = gapCenterX + gapW / 2;
    g.fillStyle(0x7a7a8a, 1);
    g.fillRect(0, corY, gapLeft, 5);
    g.fillRect(gapRight, corY, WORLD_W - gapRight, 5);
    g.fillStyle(0x9a9aaa, 0.6);
    g.fillRect(0, corY + 1, gapLeft, 1);
    g.fillRect(gapRight, corY + 1, WORLD_W - gapRight, 1);
    // 벽 하단 그림자 (갭 제외)
    g.fillStyle(0x000000, 0.05);
    g.fillRect(0, corY + 5, gapLeft, 3);
    g.fillRect(gapRight, corY + 5, WORLD_W - gapRight, 3);

    // 출입구 갭 측면 기둥(문틀) — 얇은 어두운 선으로 개구부 강조
    g.fillStyle(0x4a4a5a, 0.8);
    g.fillRect(gapLeft - 1, corY, 1, 5);
    g.fillRect(gapRight, corY, 1, 5);

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

    // 비상구 텍스트 (클릭 시 야외씬 전환)
    const exitLabel = this.add.text(WORLD_W / 2 + 52, corY + 14, "EXIT", {
      fontSize: "10px", fontFamily: FONT,
      color: "#ffffff", resolution: TEXT_RES,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    exitLabel.on("pointerover", () => exitLabel.setColor("#f5c842"));
    exitLabel.on("pointerout",  () => exitLabel.setColor("#ffffff"));
    exitLabel.on("pointerdown", () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.pause("OfficeScene");
        this.scene.launch("LoginScene", { weatherCode: this.weatherCode, showReturnBtn: true });
      });
    });
    this.envGroup.add(exitLabel);

    // 복도 점유
    for (let y = ROWS - 3; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        this.grid[y][x] = true;
  }

  private drawOfficeDetails() {
    const wallY = WALL_H * TILE + 12;
    const corY = (ROWS - 3) * TILE;

    // ── 좌측 벽면 — 책장 (Pokemon 에셋, 32x64) ──
    this.envGroup.add(this.add.image(30, wallY + 40, "bookshelf").setOrigin(0.5, 1).setDepth(5));
    this.envGroup.add(this.add.image(30, wallY + 110, "bookshelf").setOrigin(0.5, 1).setDepth(5));

    // ── 우측 벽면 — 화이트보드 (Pokemon 에셋) ──
    this.envGroup.add(this.add.image(WORLD_W - 130, wallY + 20, "whiteboard").setDepth(5));

    // ── 사무실 네 구석 — 화분만 ──
    // 좌하단 구석 (큰 화분)
    this.envGroup.add(
      this.add.image(40, corY - 8, "plant_large").setOrigin(0.5, 1).setDepth(5)
    );
    // 우하단 구석 (작은 화분)
    this.envGroup.add(
      this.add.image(WORLD_W - 40, corY - 8, "plant_1").setOrigin(0.5, 1).setDepth(5)
    );
    // 좌상단 (책장 아래, 보조 화분)
    this.envGroup.add(
      this.add.image(80, wallY + 130, "plant_1").setOrigin(0.5, 1).setDepth(5)
    );
    // 우상단
    this.envGroup.add(
      this.add.image(WORLD_W - 80, wallY + 130, "plant_2").setOrigin(0.5, 1).setDepth(5)
    );

    // ── 천장 조명 반사 ──
    [5, 11, 17, 23].forEach(col => {
      [6, 12].forEach(row => {
        this.envGroup.add(this.add.image(col * TILE, row * TILE, "light_glow"));
      });
    });

    // ── 걸레받이 ──
    const baseG = this.add.graphics();
    baseG.fillStyle(0xc0c0c8, 0.3);
    baseG.fillRect(0, WALL_H * TILE, WORLD_W, 2);
    this.envGroup.add(baseG);
  }

  changeFloor(floor: number) {
    const maxFloor = Math.max(1, ...Object.keys(ALL_FLOORS).map(Number).filter(f => (ALL_FLOORS[f]?.length || 0) > 0));
    if (floor < 1 || floor > maxFloor) return;
    if (!ALL_FLOORS[floor]) ALL_FLOORS[floor] = [];
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
      color: "#40d080", resolution: TEXT_RES,
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

    // 2x2 포켓몬 스타일 사무실 배치
    // 윗줄: 캐릭(↓ 정면) 위 + 책상 아래 (캐릭이 책상 앞에 서 있음, 캐릭이 책상보다 위 depth)
    // 아랫줄: 책상 위 + 캐릭(↑ 뒷면) 아래 (책상이 캐릭 앞에 있음, 책상이 캐릭보다 위 depth)
    const members: MemberSprite[] = [];
    const S = 1.0;   // 32x48 * 1.0 = 32x48 (정수 스케일 = 선명한 픽셀)

    const isSolo = t.chars.length === 1;

    const cols = 4; // spritesheet columns (Pokemon Another Red format)
    // Side-view facing frames (RPG Maker row layout: 0=down,1=left,2=right,3=up)
    const rightFrame = cols * 2; // facing right (first col of row 2)
    const leftFrame  = cols * 1; // facing left  (first col of row 1)

    // Side-view 2x2: 캐릭별로 개별 책상(32x56) + 노트북은 laptop_v를 좌/우 반으로 분리해 사용
    const gapX = 44;       // 캐릭 x (±44)
    const deskOffset = 14; // 책상 x (±14) — 캐릭 바로 옆 안쪽
    const gapY = 40;       // 위아래 줄 간격
    const charYOffset = -12; // 캐릭을 책상 위쪽으로 올림 (이전에 책상 아래쪽에 있던 버그 수정)
    const topY = -gapY / 2 + charYOffset;
    const botY =  gapY / 2 + charYOffset;

    const workstations = [
      // Top-left: 왼쪽 캐릭 → 오른쪽 바라봄
      { charX: -gapX, charY: topY, facing: rightFrame, deskX: -deskOffset, isTopRow: true  },
      // Top-right: 오른쪽 캐릭 → 왼쪽 바라봄
      { charX:  gapX, charY: topY, facing: leftFrame,  deskX:  deskOffset, isTopRow: true  },
      // Bottom-left
      { charX: -gapX, charY: botY, facing: rightFrame, deskX: -deskOffset, isTopRow: false },
      // Bottom-right
      { charX:  gapX, charY: botY, facing: leftFrame,  deskX:  deskOffset, isTopRow: false },
    ];

    // 노트북 A안: laptop_v 원본 통짜, 줄마다 x=0(두 책상 사이 정중앙), 캐릭 face-level
    // ※ Phaser Container는 add 순서로 렌더. depth도 명시해 책상(50/55)·캐릭(52/57) 위에 표시
    const drawLaptop = (rowY: number, depth: number) => {
      // 52x28 완전체를 반갈 → 각 반쪽(26x28)을 각 캐릭 앞 책상(±13)에 배치
      // 두 반쪽 붙이면 원본 노트북 재구성, 각자 독립 노트북으로도 인식됨
      const yPos = rowY - 18;
      const left  = this.add.image(-13, yPos, "laptop_half_left").setOrigin(0.5, 0.5).setDepth(depth);
      const right = this.add.image( 13, yPos, "laptop_half_right").setOrigin(0.5, 0.5).setDepth(depth);
      ["laptop_half_left", "laptop_half_right"].forEach(k => {
        const tex = this.textures.get(k);
        if (tex && tex.source[0]) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      });
      container.add(left);
      container.add(right);
    };


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

      const ws = workstations[i];
      const { isTopRow } = ws;

      // Depth: 책상 < 캐릭
      const deskDepth = isTopRow ? 50 : 55;
      const charDepth = isTopRow ? 52 : 57;

      // 책상 (32x56 short wicker, 캐릭별 개별)
      const desk = this.add.image(ws.deskX, ws.charY + 20, "desk_side_wicker")
        .setOrigin(0.5, 1)
        .setDepth(deskDepth);
      container.add(desk);


      // Character facing toward desk (side-view idle frame)
      const char = this.add.sprite(ws.charX, ws.charY, `char_${charIdx}`, ws.facing)
        .setScale(S).setOrigin(0.5, 0.75)
        .setDepth(charDepth)
        .play(`char_${charIdx}_idle`);
      container.add(char);

      members.push({ char, charIdx, baseX: ws.charX, baseY: ws.charY });
    });

    // 노트북 — forEach(책상+캐릭) 뒤에 추가 + 높은 depth로 맨 위에 렌더
    if (t.chars.length >= 2) drawLaptop(topY, 60);
    if (t.chars.length >= 3) drawLaptop(botY, 65);

    // 화이트보드 명패 — 팀 사각형 내부 아랫쪽에 걸치도록 (이전엔 사각형 밖 아래였음)
    const nameY = ph / 2 - 14;
    const nameBg = this.add.graphics();
    nameBg.fillStyle(0xffffff, 0.95);
    nameBg.fillRoundedRect(-42, nameY - 10, 84, 18, 2);
    nameBg.lineStyle(1, 0xcccccc, 0.8);
    nameBg.strokeRoundedRect(-42, nameY - 10, 84, 18, 2);
    nameBg.fillStyle(0x4a90d9, 1);
    nameBg.fillRect(-42, nameY - 10, 84, 2);
    container.add(nameBg);

    const label = this.add.text(0, nameY, `${t.emoji} ${t.name}`, {
      fontSize: "14px", fontFamily: POKEMON_FONT,
      fontStyle: "600", // semibold — 진하지도 흐리지도 않은 중간 두께
      color: "#111111", resolution: 32, // 해상도 2배 높여 선명도 향상
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
    // 1) localStorage (로컬 폴백/즉시반영)
    try {
      localStorage.setItem(`hq-positions-${this.currentFloor}`, JSON.stringify(positions));
    } catch {}
    // 2) 서버 동기화 (웹/모바일 동기화) — 플로어 정보 포함
    if (this.apiBase) {
      const serverPayload: Record<string, { floor: number; gx: number; gy: number }> = {};
      Object.entries(positions).forEach(([id, p]) => {
        serverPayload[id] = { floor: this.currentFloor, gx: p.gx, gy: p.gy };
      });
      fetch(`${this.apiBase}/api/layout/positions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: serverPayload }),
      }).catch(() => {}); // fire-and-forget
    }
  }

  private loadPositions(): Record<string, { gx: number; gy: number }> | null {
    // 서버 위치가 this.serverPositions에 있으면 우선 사용 (비동기 로드됨)
    if (this.serverPositions) {
      const filtered: Record<string, { gx: number; gy: number }> = {};
      Object.entries(this.serverPositions).forEach(([id, p]) => {
        if (p.floor === this.currentFloor) {
          filtered[id] = { gx: p.gx, gy: p.gy };
        }
      });
      if (Object.keys(filtered).length > 0) return filtered;
    }
    // 폴백: localStorage
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
      if (mx === 0) return;
      const SPRITE_COLS = 4;
      const isDeskChar = m.baseX !== 0;

      // 진행 중인 트윈 강제 종료 → 위치를 baseX로 리셋 (stuck 방지)
      if (this.tweens.isTweening(m.char)) {
        this.tweens.killTweensOf(m.char);
        m.char.x = m.baseX;
        if (isDeskChar) {
          m.char.setFrame(m.baseX < 0 ? SPRITE_COLS * 2 : SPRITE_COLS);
        } else {
          m.char.play(`char_${m.charIdx}_idle`);
        }
        return; // 이번 tick은 리셋만 하고 다음 tick에 이동
      }

      if (!isDeskChar) {
        const anim = mx > 0 ? `char_${m.charIdx}_walk_right` : `char_${m.charIdx}_walk_left`;
        m.char.play(anim);
        // Solo char has no desk/monitor siblings → safe to bring to top
        tg.container.bringToTop(m.char);
      }
      // NOTE: Do NOT bringToTop for desk chars — it would render them above
      // their desk/monitor siblings (Container siblings render in list order,
      // setDepth is ignored within a Container). Keep creation order intact
      // so chars stay behind desks/monitors as designed.

      // Math.round 보장: 트윈 중간값도 정수 좌표만 사용 (픽셀아트 깨짐 방지)
      this.tweens.add({ targets: m.char, x: Math.round(m.baseX + mx), duration: 350, ease: "Sine.easeInOut",
        onComplete: () => {
          if (!m.char.active) return;
          if (isDeskChar) {
            m.char.setFrame(m.baseX < 0 ? SPRITE_COLS * 2 : SPRITE_COLS);
          }
          this.tweens.add({ targets: m.char, x: Math.round(m.baseX), duration: 300, ease: "Sine.easeInOut",
            onComplete: () => {
              if (!m.char.active) return;
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
        const SPRITE_C = 4;
        if (m.baseX < 0) m.char.setFrame(SPRITE_C * 2);   // 왼쪽 책상 → 오른쪽 옆모습 복원
        else if (m.baseX > 0) m.char.setFrame(SPRITE_C);  // 오른쪽 책상 → 왼쪽 옆모습 복원
        else m.char.play(`char_${m.charIdx}_idle`);   // 솔로 → 정면
      }

      // 말풍선 — 캐릭터 머리 위 (scene 레벨 depth 200)
      if (working && !m.bubble) {
        // Pokemon windowskin 말풍선 (3슬라이스 스프라이트: 좌테두리/중앙/우테두리)
        // 프레임 0=left border, 1=center fill, 2=right border (각 32x48)
        const container = this.add.container(0, 0).setDepth(200);
        const BUBBLE_W = 44;
        const BUBBLE_H = 22;
        const BORDER = 4;
        const leftBorder = this.add.image(-BUBBLE_W / 2, 0, "speech_bubble", 0)
          .setOrigin(0, 0.5)
          .setDisplaySize(BORDER, BUBBLE_H);
        const center = this.add.image(-BUBBLE_W / 2 + BORDER, 0, "speech_bubble", 1)
          .setOrigin(0, 0.5)
          .setDisplaySize(BUBBLE_W - BORDER * 2, BUBBLE_H);
        const rightBorder = this.add.image(BUBBLE_W / 2 - BORDER, 0, "speech_bubble", 2)
          .setOrigin(0, 0.5)
          .setDisplaySize(BORDER, BUBBLE_H);
        [leftBorder, center, rightBorder].forEach(img => {
          const tex = img.texture;
          if (tex && tex.source[0]) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
        });
        container.add([leftBorder, center, rightBorder]);

        // 말풍선 꼬리 (아래로)
        const tail = this.add.graphics();
        tail.fillStyle(0xffffff, 1);
        tail.fillTriangle(-3, BUBBLE_H / 2 - 1, 3, BUBBLE_H / 2 - 1, 0, BUBBLE_H / 2 + 5);
        tail.lineStyle(1, 0x303030, 0.6);
        tail.lineBetween(-3, BUBBLE_H / 2 - 1, 0, BUBBLE_H / 2 + 5);
        tail.lineBetween(3, BUBBLE_H / 2 - 1, 0, BUBBLE_H / 2 + 5);
        container.add(tail);

        // 3점(...) 작업 표시
        const dots = this.add.graphics();
        dots.fillStyle(0x333333, 1);
        dots.fillCircle(-6, 0, 1.8);
        dots.fillCircle(0, 0, 1.8);
        dots.fillCircle(6, 0, 1.8);
        container.add(dots);

        // 머리 위 위치
        const isSolo = tg.config.chars.length === 1;
        const headX = tg.container.x + (isSolo ? 0 : m.baseX);
        const headY = tg.container.y + (isSolo ? -30 : m.baseY - 22);
        container.setPosition(headX, headY);
        m.bubble = container;
        this.tweens.add({ targets: container, scaleX: 1.1, scaleY: 1.1, duration: 200, yoyo: true, ease: "Sine.easeOut" });
      } else if (!working && m.bubble) {
        m.bubble.destroy();
        m.bubble = undefined;
      }
    });
  }

  /** 런타임에 새 팀을 사무실에 추가 (API로 팀 생성 후 호출) */
  addTeam(teamId: string, teamName: string, emoji: string) {
    // 이미 존재하면 무시
    if (this.teamGroups.has(teamId)) return;

    // 빈 그리드 위치 자동 탐색 (4x4 블록)
    const gridW = 4, gridH = 4;
    const pos = this.findEmptyGrid(gridW, gridH);
    if (!pos) return; // 공간 없으면 무시

    // Primary 2개를 고유하게 할당 (팀 간 중복 없음, teamId 시드 기반 결정적)
    const pair = allocatePrimaryPair(teamId);
    PRIMARY_CHARS[teamId] = pair;
    const charIndices: (number | string)[] = buildTeamChars(teamId, pair);

    const config: TeamConfig = {
      id: teamId, name: teamName, emoji,
      chars: charIndices, gridX: pos.x, gridY: pos.y, gridW, gridH,
    };

    // 가장 낮은 층 중 여유 있는 곳에 배치 (6팀/층 제한)
    let targetFloor = 1;
    for (let f = 1; f <= 10; f++) {
      const teams = ALL_FLOORS[f];
      if (!teams) { ALL_FLOORS[f] = []; targetFloor = f; break; }
      if (teams.length < 6) { targetFloor = f; break; }
    }
    ALL_FLOORS[targetFloor].push(config);
    // 해당 층으로 이동
    if (this.currentFloor !== targetFloor) {
      this.changeFloor(targetFloor);
    }

    this.createTeamGroup(config);
    this.occupyGrid(pos.x, pos.y, gridW, gridH, true);
    this.savePositions();
  }

  getTeamFloor(teamId: string): number | null {
    for (const [floor, teams] of Object.entries(ALL_FLOORS)) {
      if (teams.some(t => t.id === teamId)) return Number(floor);
    }
    return null;
  }

  moveTeamToFloor(teamId: string, targetFloor: number) {
    if (targetFloor < 1 || targetFloor > 10) return;

    // 1. Find current floor
    let sourceFloor: number | null = null;
    let teamConfig: TeamConfig | null = null;
    for (const [floor, teams] of Object.entries(ALL_FLOORS)) {
      const idx = teams.findIndex(t => t.id === teamId);
      if (idx !== -1) {
        sourceFloor = Number(floor);
        teamConfig = { ...teams[idx] };
        teams.splice(idx, 1);
        break;
      }
    }
    if (!teamConfig || sourceFloor === null || sourceFloor === targetFloor) return;

    // 2. Add to target floor with default grid position (will be auto-placed on build)
    if (!ALL_FLOORS[targetFloor]) ALL_FLOORS[targetFloor] = [];
    const targetTeams = ALL_FLOORS[targetFloor];

    // 대상 층의 기존 팀 위치를 기반으로 빈 자리 계산
    const occupied = new Set<string>();
    for (const t of targetTeams) {
      for (let dy = 0; dy < t.gridH; dy++) {
        for (let dx = 0; dx < t.gridW; dx++) {
          occupied.add(`${t.gridX + dx},${t.gridY + dy}`);
        }
      }
    }
    // 빈 4x4 슬롯 탐색
    let placed = false;
    for (let gy = WALL_H; gy <= ROWS - teamConfig.gridH - 3; gy++) {
      for (let gx = 0; gx <= COLS - teamConfig.gridW; gx++) {
        let free = true;
        for (let dy = 0; dy < teamConfig.gridH && free; dy++) {
          for (let dx = 0; dx < teamConfig.gridW && free; dx++) {
            if (occupied.has(`${gx + dx},${gy + dy}`)) free = false;
          }
        }
        if (free) {
          teamConfig.gridX = gx;
          teamConfig.gridY = gy;
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) { teamConfig.gridX = 1; teamConfig.gridY = 4; }
    targetTeams.push(teamConfig);

    // 3. Remove saved position from source floor, set default in target
    try {
      const srcKey = `hq-positions-${sourceFloor}`;
      const srcData = localStorage.getItem(srcKey);
      if (srcData) {
        const srcPositions = JSON.parse(srcData);
        delete srcPositions[teamId];
        localStorage.setItem(srcKey, JSON.stringify(srcPositions));
      }
    } catch {}

    // 4. If currently viewing source or target floor, rebuild
    if (this.currentFloor === sourceFloor || this.currentFloor === targetFloor) {
      this.buildFloor(this.currentFloor);
    }
  }

  /** gridW x gridH 크기의 빈 공간을 그리드에서 찾아 반환 */
  private findEmptyGrid(gridW: number, gridH: number): { x: number; y: number } | null {
    // 벽 아래부터 탐색 (WALL_H 이후)
    for (let y = WALL_H; y <= ROWS - gridH; y++) {
      for (let x = 0; x <= COLS - gridW; x++) {
        if (this.canPlace(x, y, gridW, gridH, "")) {
          return { x, y };
        }
      }
    }
    return null;
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
