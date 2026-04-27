/**
 * 타이쿤 사무실 씬
 * - 층 시스템 (1F~3F 전환)
 * - 상단 통창 + 날씨
 * - 2x2 팀 배치, 그리드 겹침 방지
 * - 콤팩트 캐릭터
 */

import * as Phaser from "phaser";
import { preloadAssets, registerCharAnims, createCustomFurniture, NPC_POOL_SIZE, PRIMARY_CHAR_POOL_SIZE } from "./sprites";
import { BubbleManager } from "./bubbles";
import { getFurnitureDef, WALKABLE_CATEGORIES, fetchAndApplyFurnitureOverrides } from "./tm-furniture-catalog";

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
  // TeamMaker 스타일 — 시각적으로 1명만 (실제 역량은 4명급)
  void teamId; void primaries;
  return [primaries[0]];
}

const TILE = 32;
const COLS = 32;   // TM layout 커버 (default.json 최대 col 30)
const ROWS = 23;   // TM layout 커버 (default.json 최대 row 22)
const WORLD_W = COLS * TILE;  // 1024
const WORLD_H = ROWS * TILE;  // 736
const WALL_H = 2; // 벽(통창) 높이 — 2칸(64px)로 축소해 바닥 16칸 확보
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
  "trading-bot":   { name: "매매봇",    emoji: "🤖", chars: buildTeamChars("trading-bot",   PRIMARY_CHARS["trading-bot"]!),   gridW: 1, gridH: 1 },
  "date-map":      { name: "데이트지도", emoji: "🗺️", chars: buildTeamChars("date-map",      PRIMARY_CHARS["date-map"]!),      gridW: 1, gridH: 1 },
  "claude-biseo":  { name: "클로드비서", emoji: "🤵", chars: buildTeamChars("claude-biseo",  PRIMARY_CHARS["claude-biseo"]!),  gridW: 1, gridH: 1 },
  "ai900":         { name: "AI900",     emoji: "📚", chars: buildTeamChars("ai900",         PRIMARY_CHARS["ai900"]!),         gridW: 1, gridH: 1 },
  "design-team":   { name: "디자인팀",  emoji: "🎨", chars: buildTeamChars("design-team",   PRIMARY_CHARS["design-team"]!),   gridW: 1, gridH: 1 },
  "content-lab":   { name: "콘텐츠랩",  emoji: "🔬", chars: buildTeamChars("content-lab",   PRIMARY_CHARS["content-lab"]!),   gridW: 1, gridH: 1 },
  "frontend-team": { name: "프론트엔드",emoji: "🖼",  chars: buildTeamChars("frontend-team", PRIMARY_CHARS["frontend-team"]!), gridW: 1, gridH: 1 },
  "backend-team":  { name: "백엔드",    emoji: "⚙️", chars: buildTeamChars("backend-team",  PRIMARY_CHARS["backend-team"]!),  gridW: 1, gridH: 1 },
  "qa-agent":      { name: "QA",       emoji: "🔍", chars: buildTeamChars("qa-agent",      PRIMARY_CHARS["qa-agent"]!),      gridW: 1, gridH: 1 },
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
      gridW: 1, gridH: 1,
    };
  }
}

// 서버 floor_layout.json과 동기화된 기본 배치 (폴백)
// 실제 배치는 서버 GET /api/layout/floors에서 로드
let ALL_FLOORS: Record<number, TeamConfig[]> = {
  1: [
    { id: "claude-biseo",  gridX: 2,  gridY: 5, ...TEAM_META["claude-biseo"]! },
    { id: "frontend-team", gridX: 7,  gridY: 5, ...TEAM_META["frontend-team"]! },
    { id: "backend-team",  gridX: 12, gridY: 5, ...TEAM_META["backend-team"]! },
    { id: "content-lab",   gridX: 17, gridY: 5, ...TEAM_META["content-lab"]! },
  ],
  2: [
    { id: "trading-bot",   gridX: 2,  gridY: 5, ...TEAM_META["trading-bot"]! },
    { id: "ai900",         gridX: 7,  gridY: 5, ...TEAM_META["ai900"]! },
    { id: "design-team",   gridX: 12, gridY: 5, ...TEAM_META["design-team"]! },
    { id: "date-map",      gridX: 17, gridY: 5, ...TEAM_META["date-map"]! },
  ],
};

interface MemberSprite { char: Phaser.GameObjects.Sprite; charIdx: number | string; baseX: number; baseY: number; bubble?: Phaser.GameObjects.Container; }
interface TeamGroup {
  container: Phaser.GameObjects.Container; members: MemberSprite[];
  label: Phaser.GameObjects.Text; highlight: Phaser.GameObjects.Rectangle;
  config: TeamConfig; gridX: number; gridY: number; prevGridX: number; prevGridY: number;
  workGlow?: Phaser.GameObjects.Graphics;
  statusBadge?: Phaser.GameObjects.Container;
}

export default class OfficeScene extends Phaser.Scene {
  private teamGroups: Map<string, TeamGroup> = new Map();
  private workingSet: Set<string> = new Set();
  private bubbleManager?: BubbleManager;
  private onTeamClick?: (id: string, screenX?: number, screenY?: number) => void;
  private dragTarget: TeamGroup | null = null;
  private dragOffX = 0; private dragOffY = 0;
  private dragStartX = 0; private dragStartY = 0;
  // 오브젝트(아케이드/서버실) 드래그 상태
  private objectDrag: {
    id: "arcade" | "server";
    storageKey: string;
    targets: Phaser.GameObjects.GameObject[];
    offX: number; offY: number;
    startX: number; startY: number;
    startTime: number;
    moved: boolean;
    minX: number; maxX: number; minY: number; maxY: number;
    baseX: number; baseY: number;
    onClick: () => void;
    setPos: (x: number, y: number) => void;
    onDragEnd?: () => void;
  } | null = null;
  private overlapRect: Phaser.GameObjects.Rectangle | null = null;
  private grid: boolean[][] = [];
  /** 바닥 타일이 깔린 셀 (검은 영역 차단용) */
  private floorMap: boolean[][] = [];
  /** 벽/비걷기 가구로 차단된 셀 — 검은영역 재계산 시 보존 */
  private blockedByFurn: boolean[][] = [];
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

    // apiBase만 저장. 실제 fetch는 create()에서 await로 처리 (경합 제거)
    const apiBase = data.apiBase || "";
    this.apiBase = apiBase;
  }

  preload() { preloadAssets(this); }

  async create() {
    // 서버 positions를 create 시작에 로드 (envGroup 초기화 전에 완료 → 경합 제거)
    if (this.apiBase) {
      try {
        const resp = await fetch(`${this.apiBase}/api/layout/positions`).then(r => r.json());
        if (resp.ok && resp.positions) {
          this.serverPositions = resp.positions;
        }
      } catch {}
      // 층 배치도 같이 로드
      try {
        const resp = await fetch(`${this.apiBase}/api/layout/floors`).then(r => r.json());
        if (resp.ok && resp.floors) {
          const serverFloors: Record<number, TeamConfig[]> = {};
          // 의자 위치에 캐릭이 앉도록 (chair = 걸을 수 있음 = 겹침 허용)
          // 책상 topDeskRow=7, chair row=9 / botDeskRow=13, chair row=15
          // 컬럼: 2, 6, 10, 14, 18, 22
          const defaultPositions = [
            { gridX: 2,  gridY: 9 },  { gridX: 6,  gridY: 9 },
            { gridX: 10, gridY: 9 },  { gridX: 14, gridY: 9 },
            { gridX: 18, gridY: 9 },  { gridX: 22, gridY: 9 },
            { gridX: 2,  gridY: 15 }, { gridX: 6,  gridY: 15 },
            { gridX: 10, gridY: 15 }, { gridX: 14, gridY: 15 },
            { gridX: 18, gridY: 15 }, { gridX: 22, gridY: 15 },
          ];
          for (const f of resp.floors) {
            serverFloors[f.floor] = f.teams.map((t: any, i: number) => {
              ensureTeamMeta(t);
              return {
                id: t.id,
                gridX: defaultPositions[i]?.gridX ?? 1,
                gridY: defaultPositions[i]?.gridY ?? 4,
                ...TEAM_META[t.id]!,
              };
            });
          }
          if (Object.keys(serverFloors).length > 0) ALL_FLOORS = serverFloors;
        }
      } catch {}
    }

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
    // drawElevator 제거됨 — TM 사무실 전체 채택 (엘베 나중에 다시)

    // 말풍선 매니저 (TeamMaker 패턴) — 팀 컨테이너 위 좌표 기준
    this.bubbleManager = new BubbleManager(this, (teamId) => {
      const tg = this.teamGroups.get(teamId);
      if (!tg) return null;
      // 그룹 컨테이너 중앙 상단 (가구 위)
      return { x: tg.container.x, y: tg.container.y - (tg.config.gridH * TILE) / 2 - 8 };
    });

    // 카메라 — 월드 전체가 캔버스에 딱 맞게 (Phaser Scale.FIT가 캔버스 자체 스케일)
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    // 배경 투명 — page 배경이 보이도록 (검은 bg 제거)
    this.cameras.main.setBackgroundColor("rgba(0,0,0,0)");
    this.cameras.main.roundPixels = true;

    // 입력
    this.input.on("pointerdown", this.onDown, this);
    this.input.on("pointermove", this.onMove, this);
    this.input.on("pointerup", this.onUp, this);
    this.setupEditorListeners();

    // 랜덤 움직임
    // 랜덤 움직임 제거됨 — 평소엔 정지, 작업/대화 시에만 애니메이션

    // 실시간 위치 동기화 — 5초마다 서버 positions 폴링, 변경 시 rebuild
    if (this.apiBase) {
      this.time.addEvent({ delay: 5000, loop: true, callback: () => this.pollPositions() });
    }
  }

  private async pollPositions() {
    // 드래그 중엔 폴링 스킵 (내가 움직이는 중에 덮어쓰지 않게)
    if (this.dragTarget) return;
    // 편집 중(Undo/Redo/Import/Export/Reset 직후)엔 폴링 스킵
    if (typeof window !== "undefined" && (window.__hqEditingUntil ?? 0) > Date.now()) return;
    // 걷기 중인 캐릭이 있으면 rebuild 스킵 — "덜덜떨면서 날라감" 방지
    for (const [, tg] of this.teamGroups) {
      for (const m of tg.members) {
        if (m.char?.getData("walking") || m.char?.getData("walkout")) return;
      }
    }
    try {
      const resp = await fetch(`${this.apiBase}/api/layout/positions`).then(r => r.json());
      if (!resp.ok || !resp.positions) return;
      const newSig = JSON.stringify(resp.positions);
      const oldSig = JSON.stringify(this.serverPositions || {});
      if (newSig === oldSig) return; // 변경 없음
      this.serverPositions = resp.positions;
      this.buildFloor(this.currentFloor);
    } catch {}
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
        // walkout OR walking 중이던 캐릭 전부 destroy (잔상/할루시네이션 방지).
        // 컨테이너 안이든 밖이든 무조건 명시적 제거.
        if (m.char?.getData) {
          const walkout = m.char.getData("walkout") === true;
          const walking = m.char.getData("walking") === true;
          if (walkout || walking) {
            try { m.char.destroy(); } catch {}
          }
        }
      });
      if (tg.workGlow) { this.tweens.killTweensOf(tg.workGlow); }
      tg.container.destroy();
    });
    this.teamGroups.clear();
    // 추가 안전망: 씬에 남아있는 orphan 캐릭 스프라이트 전부 제거 (parentContainer null + walking/walkout flag)
    this.children.getChildren().slice().forEach(obj => {
      const anyObj = obj as Phaser.GameObjects.GameObject & { getData?: (k: string) => unknown; parentContainer?: unknown };
      if (!anyObj.getData) return;
      const isOrphan = anyObj.getData("walkout") === true || anyObj.getData("walking") === true;
      if (isOrphan && !anyObj.parentContainer) {
        try { (obj as Phaser.GameObjects.GameObject).destroy(); } catch {}
      }
    });

    // 그리드 초기화
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    this.floorMap = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    this.blockedByFurn = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < WALL_H; y++) this.grid[y][x] = true;
    }

    // ── TM 사무실 전체 렌더 (우리 레거시 드로잉 전부 제거) ──
    // TM default.json이 바닥/벽/가구 전부 그림 → renderTMLayoutFull에서 처리
    // 상단 통창만 우리 것 유지

    this.drawPanoramaWindow();
    // drawServerRoom / drawElevator / drawArcade / drawCorridor / drawOfficeDetails 제거됨
    // TM 우측방 자리에 서버 랙만 별도 오버레이 (placeTMServerOverlay)

    // 구조물 점유 영역 제거 — TM 레이아웃이 자체 벽/가구 포함

    // 팀 배치 (저장된 위치 있으면 사용)
    const teams = ALL_FLOORS[floor] || [];
    const saved = this.loadPositions();
    teams.forEach(t => {
      if (saved && saved[t.id]) {
        // 저장 위치가 벽/복도 영역에 걸치지 않도록 clamp
        t.gridX = Math.max(0, Math.min(COLS - t.gridW, saved[t.id].gx));
        t.gridY = Math.max(WALL_H, Math.min(ROWS - t.gridH, saved[t.id].gy));
      }
      this.createTeamGroup(t);
      this.occupyGrid(t.gridX, t.gridY, t.gridW, t.gridH, true);
    });

    // ── CPO: 모든 층에 공용 배치 (엘리베이터 근처 복도 위) ──
    const cpoConfig: TeamConfig = {
      id: "cpo-claude", name: "CPO", emoji: "🧠",
      chars: ["cpo"], gridX: 22, gridY: 11, gridW: 1, gridH: 1,
    };
    if (saved && saved[cpoConfig.id]) {
      // CPO 저장 위치도 벽/복도 밖으로 clamp (벽 안쪽으로 들어간 경우 복구)
      cpoConfig.gridX = Math.max(0, Math.min(COLS - cpoConfig.gridW, saved[cpoConfig.id].gx));
      cpoConfig.gridY = Math.max(WALL_H, Math.min(ROWS - cpoConfig.gridH, saved[cpoConfig.id].gy));
    }
    this.createTeamGroup(cpoConfig);
    this.occupyGrid(cpoConfig.gridX, cpoConfig.gridY, cpoConfig.gridW, cpoConfig.gridH, true);

    // 사무실 중앙에 고정 가구 (책상 열 + 의자) — 팀 위치 무관 절대 좌표
    this.renderTMLayoutFull();

    // 비동기 텍스처 로딩 후 한번 더 검은영역 재계산
    this.time.delayedCall(500, () => this._applyBlackAreaBlock());
  }

  /** 복도(하단 3줄) grid 점유 해제 — 에이전트 통과/배치 허용 */
  private _clearCorridorGrid() {
    for (let y = ROWS - 3; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (this.grid[y]) this.grid[y][x] = false;
      }
    }
    // 전역에 grid 덤프 함수 노출 (콘솔에서 __hqGrid() 호출해 복도 상태 확인)
    if (typeof window !== "undefined") {
      (window as unknown as { __hqGrid?: () => void }).__hqGrid = () => {
        console.info("[hq-grid] corridor rows (복도):");
        for (let y = ROWS - 3; y < ROWS; y++) {
          const row = (this.grid[y] || []).map(v => v ? "#" : ".").join("");
          console.info(`  row ${y}:`, row);
        }
      };
    }
  }

  /** TM default.json 전체를 그대로 렌더 (크롭: cols 20..45 rows 3..20 → 우리 0..25, 3..20) */
  private renderTMLayoutFull() {
    // TM default.json 1:1 렌더 — 원본 col/row 그대로 + 상단만 WALL_H만큼 아래로 밀어서 통창 자리 확보
    this.ensureTMLayout().then(() => {
      const layout = this.tmLayout;
      if (!layout) return;
      void layout;
      this.renderUserLayout();
      // renderUserLayout 내부에서 _applyBlackAreaBlock가 돌며 차단/해제 정리됨
    });
  }

  /** 유저 레이아웃 (localStorage) 렌더 + 그리드 업데이트 */
  private userFurnitureObjs: Phaser.GameObjects.GameObject[] = [];
  private getUserLayout(): { items: Array<{ type: string; col: number; row: number; rotation?: number; flipX?: boolean }>; removed: string[] } {
    try {
      const raw = localStorage.getItem("hq-user-layout-v1");
      if (raw) {
        const p = JSON.parse(raw);
        return { items: p.items || [], removed: p.removed || [] };
      }
    } catch {}
    return { items: [], removed: [] };
  }
  private _saveLayoutDebounce: ReturnType<typeof setTimeout> | null = null;
  private saveUserLayout(layout: { items: Array<{ type: string; col: number; row: number; rotation?: number; flipX?: boolean }>; removed: string[] }) {
    const body = { version: 2, ...layout };
    try {
      localStorage.setItem("hq-user-layout-v1", JSON.stringify(body));
    } catch {}
    // 편집 중 플래그 — OfficeEditor 폴링이 서버로 덮어쓰지 않게
    if (typeof window !== "undefined") {
      (window as unknown as { __hqEditingUntil?: number }).__hqEditingUntil = Date.now() + 30_000;
    }
    // 서버 PUT (디바운스 600ms) — 새로고침 시 복구 방지 + 다른 기기 반영
    if (this._saveLayoutDebounce) clearTimeout(this._saveLayoutDebounce);
    this._saveLayoutDebounce = setTimeout(async () => {
      try {
        await fetch(`${this.apiBase}/api/layout/office`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layout: body }),
        });
      } catch {}
    }, 600);
  }
  private renderUserLayout() {
    this.userFurnitureObjs.forEach(o => o.destroy());
    this.userFurnitureObjs = [];
    // ★ 핵심 버그 수정: floorMap/blockedByFurn 을 매 렌더마다 리셋.
    // 리셋 안 하면 이전 렌더의 잔재가 남아 삭제된 타일 셀이 계속 walkable.
    this.floorMap = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    this.blockedByFurn = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const layout = this.getUserLayout();
    for (const it of layout.items) {
      let obj: Phaser.GameObjects.GameObject | undefined;
      if (it.type.startsWith("poke:")) {
        obj = this.placePokemonFurniture(it.type.slice(5), it.col, it.row, !!it.flipX);
      } else {
        obj = this.placeFurnitureFromCatalog(it.type, it.col, it.row, it.rotation || 0, !!it.flipX);
      }
      if (obj) this.userFurnitureObjs.push(obj);
    }
    // 검은 영역 차단 — floor/가구 없는 셀(검은) 차단, 있는 셀 unblock. 복도도 이 규칙 적용.
    this._applyBlackAreaBlock();
  }

  /** 타일 기반 walkability 계산 — 양방향 갱신 (async 재렌더 대응).
   *  규칙: floor 타일 있는 셀 = walkable, 없으면 차단.
   *  단, 벽/비걷기 가구(blockedByFurn) + 팀 점유 셀은 보존.
   *  안전 가드: floor 타일이 너무 적으면 레이아웃 미완 상태로 보고 생략 */
  private _applyBlackAreaBlock() {
    let covered = 0;
    for (let y = WALL_H; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (this.floorMap[y]?.[x]) covered++;
    if (covered < 50) return;
    // 팀 점유 셀 수집 (보존)
    const teamCells = new Set<string>();
    for (const [, tg] of this.teamGroups) {
      for (let dy = 0; dy < tg.config.gridH; dy++)
        for (let dx = 0; dx < tg.config.gridW; dx++)
          teamCells.add(`${tg.gridX + dx},${tg.gridY + dy}`);
    }
    for (let y = WALL_H; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (teamCells.has(`${x},${y}`)) continue;       // 팀 셀 건드리지 않음
        if (this.blockedByFurn[y]?.[x]) { this.grid[y][x] = true; continue; }  // 벽/가구 차단
        // floor 있으면 walkable, 없으면 차단
        this.grid[y][x] = !this.floorMap[y]?.[x];
      }
    }
  }

  /** 포켓몬 가구 배치 (pokemon_furniture/ 에셋) — 이름 기반 z-order 분류 + flipX */
  private placePokemonFurniture(name: string, col: number, row: number, flipX: boolean = false): Phaser.GameObjects.GameObject | undefined {
    const key = `pokeEdit_${name}`;
    if (!this.textures.exists(key)) {
      this.load.image(key, `/assets/pokemon_furniture/${name}.png`);
      this.load.once("complete", () => { this.renderUserLayout(); });
      this.load.start();
      return;
    }
    const px = col * TILE;
    const py = row * TILE;
    const fur = this.add.image(px, py, key).setOrigin(0, 0);
    if (flipX) fur.setFlipX(true);
    fur.disableInteractive();
    const tex = this.textures.get(key);
    if (tex && tex.source[0]) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const heightCells = Math.max(1, Math.ceil(fur.height / TILE));
    // 포켓몬 이름 기반 계층 분류 (scene 공식과 동기화)
    const isFloor = name.startsWith("floor_");
    const isWall = /^(wall|door|elevator)/.test(name);
    const isTallStack = /^(lamp|coat_rack|street)/.test(name) || name.includes("streetlight");
    const isStackable = /^(monitor|pc|laptop|clock|whiteboard|computer_monitor|computer_mouse|pda|printer|speech_bubble|mailbox)/.test(name);
    const baseZ = isFloor ? -10000 : isWall ? 10000 : isTallStack ? 5500 : isStackable ? 5000 : 0;
    fur.setDepth(baseZ + (row + heightCells) * 100 + col * 0.1);
    this.envGroup.add(fur);
    // 포켓몬 가구/타일 전부 "배치됨"으로 기록 (검은영역 판정용)
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS && this.floorMap[row]) {
      this.floorMap[row][col] = true;
    }
    return fur;
  }

  /** TM 우측방 자리에 서버 랙 오버레이 — 클릭 시 ServerDashboard 열림 */
  private placeTMServerOverlay() {
    // TM 우측방 = col 25~30, row 3~9 (우리 world에선 row+WALL_H = 5~11)
    const rackX = (27 * TILE) + TILE / 2;  // 중앙 col 27
    const rackY = (7 * TILE);               // 중앙 row 7 (WALL_H=2 + 5)
    const g = this.add.graphics().setDepth(10000 + 7 * 100);  // divider 레벨
    // 간단 서버 랙 (3대, 어두운 박스 + LED)
    for (let i = 0; i < 3; i++) {
      const rx = rackX + (i - 1) * 18;
      g.fillStyle(0x2a2a3a, 1);
      g.fillRect(rx - 7, rackY - 22, 14, 44);
      g.lineStyle(1, 0x4a90d9, 0.8);
      g.strokeRect(rx - 7, rackY - 22, 14, 44);
      // LED 점멸 효과
      for (let ly = 0; ly < 6; ly++) {
        g.fillStyle(0x22c55e, 0.8);
        g.fillRect(rx - 4, rackY - 18 + ly * 6, 2, 2);
      }
    }
    // 라벨
    const label = this.add.text(rackX, rackY - 28, "SERVER", {
      fontSize: "8px", color: "#4a90d9", fontStyle: "700",
      fontFamily: "system-ui,sans-serif", resolution: 32,
    }).setOrigin(0.5, 1).setDepth(10000 + 7 * 100 + 1);
    // 클릭 영역
    const hit = this.add.zone(rackX, rackY, 80, 60).setInteractive({ useHandCursor: true }).setDepth(10002);
    hit.on("pointerup", () => {
      const cam = this.cameras.main;
      const rect = this.game.canvas.getBoundingClientRect();
      const sx = rect.left + (rackX - cam.scrollX) * (rect.width / cam.width);
      const sy = rect.top + (rackY - cam.scrollY) * (rect.height / cam.height);
      this.onTeamClick?.("server-monitor", Math.round(sx), Math.round(sy));
    });
    this.envGroup.add(g);
    this.envGroup.add(label);
    this.envGroup.add(hit);
  }

  /** TM 가구 렌더 — standalone PNG 우선, 없으면 furniture-sheet 크롭. rotation 0~3 = 0/90/180/270°, flipX = 좌우반전 */
  private placeFurnitureFromCatalog(id: string, col: number, row: number, rotation: number = 0, flipX: boolean = false) {
    // 특수 ID — 우리 흰 마블 바닥
    if (id === "hq_white_marble") {
      const key = "hq_white_marble_tex";
      if (!this.textures.exists(key)) {
        const cv = document.createElement("canvas");
        cv.width = TILE; cv.height = TILE;
        const ctx = cv.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.fillStyle = "#f0f0f0"; ctx.fillRect(0, 0, TILE, TILE);
          ctx.fillStyle = "rgba(0,0,0,0.06)";
          ctx.fillRect(0, 0, TILE, 1); ctx.fillRect(0, 0, 1, TILE);
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.fillRect(1, 1, 2, 1);
          this.textures.addCanvas(key, cv);
        }
      }
      const img = this.add.image(col * TILE, row * TILE, key).setOrigin(0, 0);
      img.disableInteractive();
      img.setDepth(-10000 + (row + 1) * 100 + col * 0.1);
      this.envGroup.add(img);
      // 흰 마블 바닥은 floorMap에도 기록 — 사무실 내부 판정
      if (col >= 0 && col < COLS && row >= 0 && row < ROWS && this.floorMap[row]) {
        this.floorMap[row][col] = true;
      }
      return img;
    }
    const standaloneKey = `tm_${id}`;
    let texKey: string;
    let def = getFurnitureDef(id);

    if (this.textures.exists(standaloneKey)) {
      // divider/floor/wall 등 개별 PNG 있는 경우
      texKey = standaloneKey;
      if (!def) {
        // catalog에 없으면 1×1 걸을 수 있는 걸로 간주
        def = { id, label: id, category: "floor_decor", widthCells: 1, heightCells: 1, sprite: { x: 0, y: 0, w: 32, h: 32 } };
      }
    } else if (def && this.textures.exists("tm_furniture_sheet")) {
      // 카탈로그에 있고 sheet 있으면 크롭
      texKey = `tmf_${id}`;
      if (!this.textures.exists(texKey)) {
        try {
          const src = this.textures.get("tm_furniture_sheet");
          const img = src.getSourceImage() as HTMLImageElement;
          const cv = document.createElement("canvas");
          cv.width = def.sprite.w; cv.height = def.sprite.h;
          const ctx = cv.getContext("2d");
          if (ctx) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, def.sprite.x, def.sprite.y, def.sprite.w, def.sprite.h, 0, 0, def.sprite.w, def.sprite.h);
            this.textures.addCanvas(texKey, cv);
          }
        } catch {}
      }
    } else {
      return;
    }

    if (!def || !this.textures.exists(texKey)) return;
    // rotation 적용 (TM FurnitureLayer.ts 방식)
    const cellW = def.widthCells * TILE;
    const cellH = def.heightCells * TILE;
    const px = col * TILE;
    const py = row * TILE;
    const fur = this.add.image(px, py, texKey).setOrigin(0, 0);
    if (rotation === 1) { fur.setPosition(px + cellH, py); fur.setAngle(90); }
    else if (rotation === 2) { fur.setPosition(px + cellW, py + cellH); fur.setAngle(180); }
    else if (rotation === 3) { fur.setPosition(px, py + cellW); fur.setAngle(270); }
    if (flipX) fur.setFlipX(true);
    fur.disableInteractive();
    // Z-order 세분화:
    //  -10000 바닥 → -9000 바닥장식(카펫) → -8000 바닥소품 → -5000 벽 타일 → -3000 벽 장식
    //  → 0 기본 가구(책상) → 3000 사람 → 3500 의자(등받이가 사람을 가림) → 5000 책상위 도구
    //  → 5500 높은 소품(스탠드) → 10000 외벽 가림막
    // desk_plant_*, potted_plant_round/bushy 는 의자(옆모습)로 재분류됨 — deskTop 제거
    // floor_lamp, clipboard_ 도 제거 (삭제 또는 재분류됨)
    const deskTopPrefixes = ["book_", "pen_", "coffee_", "cup_", "mouse_", "keyboard", "desk_lamp",
      "desk_phone", "laptop_", "desk_divider_", "cup",
      // 유저 지적 — 카탈로그 라벨과 무관하게 실제 이미지는 모니터/프린터/컴퓨터/모니터암
      "desk_extension_lavender", "desk_with_pc", "desk_with_monitors",
      "binder_set", "tall_cabinet_a", "tall_cabinet_b", "workstation_large", "desk_module_a", "desk_module_b", "desk_module_c", "desk_module_d", "desk_module_e", "conference_table_end", "dual_workstation", "globe_on_stand", "coat_rack"];
    const tallStackPrefixes = ["floor_lamp", "lamp_", "coat_rack", "rack_"];
    const lbl = (def.label || "").toLowerCase();
    const idLower = id.toLowerCase();
    const isDeskTop = deskTopPrefixes.some(p => idLower.startsWith(p));
    const isTallStack = tallStackPrefixes.some(p => idLower.startsWith(p)) || /\blamp\b|coat rack|coat_rack/.test(lbl);
    const labelIsStackable = /monitor|printer|laptop|phone|dispenser|keyboard|mouse|speaker|tv|screen/.test(lbl);
    const labelIsWallDecor = /\b(art|photo|painting|frame|poster|picture|wall[\s_]art)\b/.test(lbl) || idLower.includes("wall_art") || idLower.includes("poster");
    const isDivider = def.category === "divider" || def.category === "partition";
    const isWallTile = def.category === "wall_tile";
    const isWallDecor = def.category === "wall_decor" || labelIsWallDecor;
    const isFloorTile2 = def.category === "floor_tile";
    const isFloorDecor = def.category === "floor_decor";  // 바닥 장식 (카펫 등)
    const isFloorItem = idLower.startsWith("backpack_") || idLower.startsWith("trash_") || idLower.startsWith("suitcase_") || idLower === "briefcase";  // 바닥 소품 (책상 뒤)
    const isChair = (def.category === "chair" || def.category === "seating" || def.isSeat === true) && !isDeskTop;
    const isStackable = (isDeskTop || labelIsStackable)
      || def.category === "appliance" || def.category === "accessory" || def.category === "board";
    // 쇼파/코너/서류/책상/의자 — Y-sort 통합 (top 1줄만 캐릭을 가리고 나머지는 캐릭이 앞)
    //  - baseZ=3000 (캐릭과 동일 layer) + 앵커 = top+0.5 또는 top+1.5
    //  - heightCells=1 (1자 쇼파/의자 앞·옆): 앵커 row+0.5 → 캐릭이 항상 앞
    //  - heightCells>=2 (2인 쇼파/L쇼파/2행 책상/3행 책상 Side Panel): 앵커 row+1.5 → top 1줄만 가림
    const isSeatedPiece = /쇼파|sofa|코너|corner|서류/i.test(def.label || "")
      || id === "corner_workstation" || id === "floor_cushion_set";
    const isYSortDesk = /\bdesk\b|책상/i.test(def.label || "") || idLower.startsWith("desk_") || idLower === "l_desk_beige" || idLower === "l_desk_brown";
    // 의자 앞모습/옆모습 (뒤모습 chair_back 은 아래에서 3500으로 별도)
    const chairLabel = def.label || "";
    const chairIsBackView = isChair && (/뒤|back/i.test(chairLabel)) && !/구멍/.test(chairLabel);
    const isYSortChair = isChair && !chairIsBackView;
    const isYSortPiece = isSeatedPiece || isYSortDesk || isYSortChair;
    let baseZ: number;
    if (isYSortPiece) baseZ = 3000;
    else if (isFloorTile2) baseZ = -10000;
    else if (isFloorDecor) baseZ = -9000;
    else if (isFloorItem) baseZ = -8000;
    else if (isWallTile) baseZ = -5000;
    else if (isWallDecor) baseZ = -3000;
    else if (isChair && chairIsBackView) baseZ = 3500;  // 등받이 뒤모습 — 항상 사람 가림
    else if (isDivider) baseZ = 10000;
    else if (isTallStack) baseZ = 5500;
    else if (isStackable) baseZ = 5000;
    else baseZ = 0;
    // Y-sort 앵커: top 1줄만 덮도록 — heightCells를 최대 2로 clamp
    const effectiveH = isYSortPiece ? Math.min(def.heightCells, 2) : def.heightCells;
    const rowAnchor = isYSortPiece ? (row + effectiveH - 0.5) : (row + def.heightCells);
    const finalDepth = baseZ + rowAnchor * 100 + col * 0.1;
    fur.setDepth(finalDepth);
    if (isYSortPiece) console.info(`[hq-furn] ysort: ${id} label="${def.label}" row=${row} col=${col} H=${def.heightCells} depth=${finalDepth.toFixed(1)}`);
    this.envGroup.add(fur);
    // floorMap = "뭐라도 배치된 셀" (사용자 규칙: 가구/타일 중 하나라도 있으면 사무실 내부, 아무것도 없으면 검은영역)
    for (let dx = 0; dx < def.widthCells; dx++) {
      for (let dy = 0; dy < def.heightCells; dy++) {
        const gx = col + dx, gy = row + dy;
        if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) this.floorMap[gy][gx] = true;
      }
    }
    // TM WALKABLE_CATEGORIES 룰 — 걸을 수 없는 카테고리는 grid 차단
    // walkableCells 지정 시 해당 offset은 통과 허용 (L-desk의 꺾인 빈 공간 등)
    // Y-sort 가구:
    //  · walkableCells 명시: 해당 셀만 통과 (나머지 차단) — 사용자 원래 요청 "L자 꺾인 부분만"
    //  · walkableCells 없음: 전체 통과 (쇼파·일반 책상 — row 기반 z-sort로 뒤/앞 갈림)
    const hasExplicitWalkable = (def.walkableCells?.length ?? 0) > 0;
    const shouldOccupy = !WALKABLE_CATEGORIES.has(def.category) && (!isYSortPiece || hasExplicitWalkable);
    if (shouldOccupy) {
      const walkSet = new Set((def.walkableCells || []).map(([x, y]) => `${x},${y}`));
      for (let dx = 0; dx < def.widthCells; dx++) {
        for (let dy = 0; dy < def.heightCells; dy++) {
          if (walkSet.has(`${dx},${dy}`)) continue;
          const gx = col + dx, gy = row + dy;
          if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) {
            this.occupyGrid(gx, gy, 1, 1, true);
            this.blockedByFurn[gy][gx] = true;
          }
        }
      }
    }
    return fur;
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
    // ══════════════════════════════════════════════════════════
    // 서버실 고도화 v2 — 서버 랙 3대 + LED 점멸 + 케이블 덕트 + 콘솔
    // ══════════════════════════════════════════════════════════
    // 서버실 — 우상단 고정 (드래그/이동 불가, 통창과 붙게)
    let ox = WORLD_W - 44;
    let oy = WALL_H * TILE;

    const RW = 80; const RH = 96; // 서버실 — 높이 확장으로 통창~TM 우측방 사이 검은 영역 제거
    const RACK_W = 18; const RACK_H = 50; const RACK_GAP = 6;
    const totalRackW = 3 * RACK_W + 2 * RACK_GAP; // 66px

    // ── 배경 + 랙 3대 그리기 ──────────────────────────────────
    const drawBase = (g: Phaser.GameObjects.Graphics, x: number, y: number) => {
      g.clear();
      // 서버실 바닥 영역 (어두운 타일)
      g.fillStyle(0x12121e, 0.95);
      g.fillRect(x - RW / 2, y, RW, RH);
      g.lineStyle(1, 0x3a3a58, 0.7);
      g.strokeRect(x - RW / 2, y, RW, RH);
      // 바닥 그리드 패턴
      g.fillStyle(0x1e1e30, 0.4);
      for (let fx = 0; fx < RW; fx += 8) g.fillRect(x - RW / 2 + fx, y, 1, RH);
      for (let fy = 0; fy < RH; fy += 8) g.fillRect(x - RW / 2, y + fy, RW, 1);

      // 서버 랙 3대
      const rsx = x - totalRackW / 2;
      const rsy = y + 6;
      for (let r = 0; r < 3; r++) {
        const rx = rsx + r * (RACK_W + RACK_GAP);
        // 랙 본체 (건트리)
        g.fillStyle(0x22222e, 1);
        g.fillRect(rx, rsy, RACK_W, RACK_H);
        // 랙 테두리 (밝은 금속 느낌)
        g.lineStyle(1, 0x5050748, 0.9);
        g.strokeRect(rx, rsy, RACK_W, RACK_H);
        // 전면 패널 (약간 밝은)
        g.fillStyle(0x2e2e40, 1);
        g.fillRect(rx + 1, rsy + 1, RACK_W - 2, 5);
        // 슬롯 구분 선 (7슬롯)
        g.fillStyle(0x0a0a18, 0.9);
        for (let s = 1; s <= 6; s++) g.fillRect(rx + 2, rsy + 5 + s * 6, RACK_W - 4, 1);
        // 케이블 구멍 (상단 바)
        g.fillStyle(0x080810, 1);
        g.fillRect(rx + 2, rsy, RACK_W - 4, 4);
        // 벤트 슬롯 (하단)
        g.fillStyle(0x181828, 0.8);
        for (let v = 0; v < 4; v++) g.fillRect(rx + 3, rsy + RACK_H - 8 + v * 2, RACK_W - 6, 1);
        // 하단 발판
        g.fillStyle(0x4a4a60, 1);
        g.fillRect(rx - 1, rsy + RACK_H, RACK_W + 2, 3);
        // 랙 측면 하이라이트
        g.fillStyle(0xffffff, 0.04);
        g.fillRect(rx, rsy, 2, RACK_H);
      }

      // 케이블 덕트 (천장 위, 랙 전체 폭)
      g.fillStyle(0x28283a, 1);
      g.fillRect(x - totalRackW / 2 - 3, y + 1, totalRackW + 6, 7);
      g.lineStyle(1, 0x4a4a60, 0.5);
      g.strokeRect(x - totalRackW / 2 - 3, y + 1, totalRackW + 6, 7);
      // 케이블 색상 번들 (빨/파/노/초)
      const cColors = [0xf03020, 0x2080f0, 0xe8c020, 0x20c050];
      cColors.forEach((c, i) => {
        g.fillStyle(c, 0.75);
        g.fillRect(x - totalRackW / 2 + 2 + i * 7, y + 2, 5, 4);
      });

      // 콘솔 워크스테이션 테이블 (하단)
      g.fillStyle(0x303040, 1);
      g.fillRect(x - 26, y + RH + 2, 52, 10);
      g.lineStyle(1, 0x5050688, 0.6);
      g.strokeRect(x - 26, y + RH + 2, 52, 10);
      // 키보드 선
      g.fillStyle(0x2a2a38, 1);
      g.fillRect(x - 20, y + RH + 4, 40, 5);
      g.fillStyle(0x4a4a58, 0.4);
      for (let k = 0; k < 6; k++) g.fillRect(x - 18 + k * 6, y + RH + 5, 4, 3);
    };

    // ── LED 점멸 애니메이션 ───────────────────────────────────
    const drawLEDs = (g: Phaser.GameObjects.Graphics, x: number, y: number) => {
      g.clear();
      const rsx = x - totalRackW / 2;
      const rsy = y + 6;
      for (let r = 0; r < 3; r++) {
        const rx = rsx + r * (RACK_W + RACK_GAP);
        // 전원 LED (초록, 항상 켜짐)
        g.fillStyle(0x00ff40, 0.9);
        g.fillRect(rx + RACK_W - 4, rsy + 2, 2, 2);
        // 슬롯별 활동 LED
        for (let s = 0; s < 6; s++) {
          const sy = rsy + 6 + s * 6 + 1;
          // 초록 (활동): 70% 확률로 켜짐
          const act = Math.random() > 0.3;
          g.fillStyle(act ? 0x00ff60 : 0x001808, act ? 0.85 : 0.2);
          g.fillRect(rx + 3, sy, 2, 2);
          // 파란 (네트워크): 50% 확률
          const net = Math.random() > 0.5;
          g.fillStyle(net ? 0x40b0ff : 0x000820, net ? 0.75 : 0.15);
          g.fillRect(rx + 7, sy, 2, 2);
          // 주황 (읽기/쓰기): 20% 확률
          const io = Math.random() > 0.8;
          g.fillStyle(io ? 0xff8020 : 0x100400, io ? 0.7 : 0.1);
          g.fillRect(rx + 11, sy, 2, 2);
        }
      }
      // 콘솔 모니터 CRT 글로우
      g.fillStyle(0x00ff60, 0.12);
      g.fillRect(x - 24, y + RH + 3, 48, 9);
      g.fillStyle(0x20ff80, 0.55);
      g.fillRect(x - 20, y + RH + 4, 40, 6);
      // 커서 블링크
      if (Math.random() > 0.4) {
        g.fillStyle(0xffffff, 0.7);
        g.fillRect(x - 18 + Math.floor(Math.random() * 32), y + RH + 6, 2, 3);
      }
    };

    const baseG = this.add.graphics().setDepth(50);
    const ledG  = this.add.graphics().setDepth(51);
    drawBase(baseG, ox, oy);
    drawLEDs(ledG, ox, oy);
    this.envGroup.add(baseG);
    this.envGroup.add(ledG);

    // LED 점멸 타이머 (550ms 주기, 각 랙 독립)
    this.time.addEvent({
      delay: 550, loop: true,
      callback: () => { if (ledG.active) drawLEDs(ledG, ox, oy); },
    });

    // ── 서버실 레이블 ─────────────────────────────────────────
    const label = this.add.text(ox, oy - 7, "SERVER ROOM", {
      fontSize: "7px", fontFamily: FONT,
      color: "#5090e8", resolution: TEXT_RES,
      backgroundColor: "#00000088", padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1).setDepth(52);
    this.envGroup.add(label);

    // ── 히트 존 (클릭 + 드래그) ──────────────────────────────
    const hitH = RH + 14;
    const hit = this.add.zone(ox, oy + hitH / 2, RW, hitH)
      .setInteractive({ useHandCursor: true }).setDepth(102);
    this.envGroup.add(hit);

    const setPos = (x: number, y: number) => {
      ox = x; oy = y;
      drawBase(baseG, x, y);
      drawLEDs(ledG, x, y);
      label.setPosition(x, y - 7);
      hit.setPosition(x, y + hitH / 2);
    };

    const onClick = () => {
      const cam = this.cameras.main;
      const rect = this.game.canvas.getBoundingClientRect();
      const sx = rect.left + (ox - cam.scrollX) * (rect.width / cam.width);
      const sy = rect.top + (oy - cam.scrollY) * (rect.height / cam.height);
      this.onTeamClick?.("server-monitor", Math.round(sx), Math.round(sy));
    };

    // 서버실 클릭만 허용 (드래그 비활성)
    hit.on("pointerup", onClick);
  }

  private drawArcadeMachine() {
    const ax = 1 * TILE + TILE / 2;
    const ay = (ROWS - 4) * TILE;
    const g = this.add.graphics().setDepth(50);
    this.envGroup.add(g);

    // 아케이드 본체
    g.fillStyle(0x2a2a5a, 1);
    g.fillRect(ax - 12, ay - 36, 24, 36);
    // 화면
    g.fillStyle(0x1a4a1a, 1);
    g.fillRect(ax - 9, ay - 33, 18, 14);
    // 화면 밝은 점 (게임 실행 중)
    g.fillStyle(0x50d070, 1);
    g.fillRect(ax - 4, ay - 28, 3, 3);
    g.fillRect(ax + 2, ay - 26, 2, 2);
    g.fillStyle(0xff6b6b, 1);
    g.fillRect(ax - 1, ay - 30, 2, 2);
    // 조이스틱
    g.fillStyle(0xf5c842, 1);
    g.fillRect(ax - 2, ay - 16, 4, 6);
    // 버튼
    g.fillStyle(0xff4444, 1);
    g.fillCircle(ax + 6, ay - 14, 2);
    g.fillStyle(0x4488ff, 1);
    g.fillCircle(ax - 6, ay - 14, 2);
    // 다리
    g.fillStyle(0x222244, 1);
    g.fillRect(ax - 10, ay, 4, 8);
    g.fillRect(ax + 6, ay, 4, 8);

    const label = this.add.text(ax, ay - 40, "🎮 FORTRESS", {
      fontSize: "6px", fontFamily: "Pretendard Variable, sans-serif",
      color: "#f5c842", resolution: 8,
      backgroundColor: "#00000088", padding: { x: 2, y: 1 },
    }).setOrigin(0.5, 1).setDepth(52);
    this.envGroup.add(label);

    const hit = this.add.zone(ax, ay - 18, 32, 48)
      .setInteractive({ useHandCursor: true }).setDepth(102);
    this.envGroup.add(hit);

    hit.on("pointerup", () => {
      this.scene.start("FortressScene", { multiplayer: false });
    });
  }

  private drawTamagotchiMachine() {
    // 두 번째 아케이드: 다마고치 (벽돌 스타일)
    const ax = 3 * TILE + TILE / 2;
    const ay = (ROWS - 4) * TILE;
    const g = this.add.graphics().setDepth(50);
    this.envGroup.add(g);

    // 케이스 (베이지 벽돌)
    g.fillStyle(0xd0c4a0, 1);
    g.fillRect(ax - 12, ay - 36, 24, 36);
    // 케이스 테두리 (진한 베이지)
    g.fillStyle(0x8a7a50, 1);
    g.fillRect(ax - 12, ay - 36, 24, 2);
    g.fillRect(ax - 12, ay - 2, 24, 2);
    // LCD 화면 (연두색)
    g.fillStyle(0x9cbd0e, 1);
    g.fillRect(ax - 9, ay - 33, 18, 14);
    // LCD 도트 (알/캐릭)
    g.fillStyle(0x0f380f, 1);
    g.fillRect(ax - 2, ay - 28, 2, 3);
    g.fillRect(ax, ay - 28, 2, 3);
    g.fillRect(ax - 3, ay - 25, 5, 2);
    // 하단 버튼 3개 (원형)
    g.fillStyle(0x8a7a50, 1);
    g.fillCircle(ax - 6, ay - 12, 2);
    g.fillCircle(ax, ay - 12, 2);
    g.fillCircle(ax + 6, ay - 12, 2);
    // 다리
    g.fillStyle(0x6a5a30, 1);
    g.fillRect(ax - 10, ay, 4, 8);
    g.fillRect(ax + 6, ay, 4, 8);

    const label = this.add.text(ax, ay - 40, "🥚 DIGIMON", {
      fontSize: "6px", fontFamily: "Pretendard Variable, sans-serif",
      color: "#9cbd0e", resolution: 8,
      backgroundColor: "#00000088", padding: { x: 2, y: 1 },
    }).setOrigin(0.5, 1).setDepth(52);
    this.envGroup.add(label);

    const hit = this.add.zone(ax, ay - 18, 32, 48)
      .setInteractive({ useHandCursor: true }).setDepth(102);
    this.envGroup.add(hit);

    hit.on("pointerup", () => {
      this.scene.start("TamagotchiScene");
    });
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

    // 복도: 편집은 허용하되 캐릭터 이동은 가능해야 하므로 grid 점유하지 않음.
    // (기존에는 가구 배치 방지용으로 grid=true 설정 → BFS 차단 부작용)
  }

  private drawOfficeDetails() {
    const wallY = WALL_H * TILE + 12;
    const corY = (ROWS - 3) * TILE;

    // ── 좌측 벽면 — 책장 (Pokemon 에셋, 32x64) ──
    this.envGroup.add(this.add.image(30, wallY + 40, "bookshelf").setOrigin(0.5, 1).setDepth(5));
    this.envGroup.add(this.add.image(30, wallY + 110, "bookshelf").setOrigin(0.5, 1).setDepth(5));

    // ── 우측 벽면 — (화이트보드 제거. 아케이드/탱크슈터는 제거됨 — 테스트 종료) ──

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
    // 팀 배치 우선순위: 다른 팀만 충돌 — 가구(책상/의자 등)는 팀 아래에 깔리는 걸 허용
    for (let y = gy; y < gy + gh; y++)
      for (let x = gx; x < gx + gw; x++) {
        if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return false;
        if (!this.grid[y][x]) continue;
        // 가구만 있는 셀은 팀 배치 허용 (우선순위: 팀 > 가구)
        if (this.blockedByFurn[y][x]) continue;
        // 다른 팀 영역인지 확인
        let blockedByOtherTeam = false;
        for (const [id, tg] of this.teamGroups) {
          if (id === excludeId) continue;
          if (x >= tg.gridX && x < tg.gridX + tg.config.gridW &&
              y >= tg.gridY && y < tg.gridY + tg.config.gridH) {
            blockedByOtherTeam = true;
            break;
          }
        }
        if (blockedByOtherTeam) return false;
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
    // TM 공식 통일 — 캐릭 container depth. -1로 같은 row 가구 뒤에 (의자 등받이가 가리게)
    const _charDepth = 3000 + (t.gridY + t.gridH) * 100 - 1;
    container.setDepth(_charDepth);
    console.info(`[hq-furn] team: ${t.id} gridY=${t.gridY} gridH=${t.gridH} depth=${_charDepth}`);
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
    const S = 1.0;   // TeamMaker 기준 — 32x48 원본 크기 (작게)

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
          .setScale(S).setOrigin(0.5, 0.75).setDepth(52);
        container.add(char);
        members.push({ char, charIdx, baseX: 0, baseY: 0 });
        return;
      }

      const ws = workstations[i];
      const { isTopRow } = ws;

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

    // 라벨 — Pretendard Variable bold + 고해상도 + shadow (스트로크 제거로 뭉침 방지)
    const nameY = ph / 2 + 4;
    const label = this.add.text(0, nameY, t.name, {
      fontSize: "11px",
      fontFamily: "'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif",
      fontStyle: "bold",
      color: "#ffffff", resolution: 32,
    }).setOrigin(0.5);
    label.setShadow(0, 1, "#0b0b14", 3, true, true);
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
    // 오브젝트 드래그 진행 중이면 팀 드래그 무시
    if (this.objectDrag) return;
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
    if (this.objectDrag && ptr.isDown) {
      const od = this.objectDrag;
      const dist = Phaser.Math.Distance.Between(od.startX, od.startY, ptr.worldX, ptr.worldY);
      if (!od.moved && dist < 6) return;
      od.moved = true;
      const nx = Phaser.Math.Clamp(ptr.worldX - od.offX, od.minX, od.maxX);
      const ny = Phaser.Math.Clamp(ptr.worldY - od.offY, od.minY, od.maxY);
      od.setPos(nx, ny);
      return;
    }
    if (!this.dragTarget || !ptr.isDown) return;
    if (Phaser.Math.Distance.Between(this.dragStartX, this.dragStartY, ptr.worldX, ptr.worldY) < 8) return;

    this.dragTarget.container.setData("dragging", true);
    const t = this.dragTarget;
    // 드래그 좌표 clamp: 상단 벽만 회피, 복도(하단 3줄)는 배치 허용
    const halfW = (t.config.gridW * TILE) / 2;
    const halfH = (t.config.gridH * TILE) / 2;
    const minX = halfW;
    const maxX = WORLD_W - halfW;
    const minY = WALL_H * TILE + halfH; // 벽 아래
    const maxY = WORLD_H - halfH;        // 월드 바닥까지 (복도 포함)
    t.container.x = Phaser.Math.Clamp(ptr.worldX - this.dragOffX, minX, maxX);
    t.container.y = Phaser.Math.Clamp(ptr.worldY - this.dragOffY, minY, maxY);

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
    if (this.objectDrag) {
      const od = this.objectDrag;
      const elapsed = performance.now() - od.startTime;
      // 투명도 원복
      od.targets.forEach(t => {
        const anyT = t as unknown as { setAlpha?: (a: number) => void };
        anyT.setAlpha?.(1);
      });
      if (!od.moved && elapsed < 200) {
        // 쇼트 클릭 → 위치 원복 + 원래 액션
        od.setPos(od.baseX, od.baseY);
        od.onClick();
      } else {
        // 드래그 종료 → localStorage 저장
        const finalX = od.targets[0] ? (od.targets[0] as unknown as { x: number }).x : od.baseX;
        const finalY = od.targets[0] ? (od.targets[0] as unknown as { y: number }).y : od.baseY;
        try {
          localStorage.setItem(od.storageKey, JSON.stringify({ x: Math.round(finalX), y: Math.round(finalY) }));
        } catch {}
        od.onDragEnd?.();
      }
      this.objectDrag = null;
      return;
    }
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
    t.container.setDepth(3000 + (t.gridY + t.config.gridH) * 100 - 1);
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
    // 서버 위치 우선 (create에서 await로 로드됨)
    if (this.serverPositions) {
      const filtered: Record<string, { gx: number; gy: number }> = {};
      Object.entries(this.serverPositions).forEach(([id, p]) => {
        if (Number(p.floor) === Number(this.currentFloor)) {
          filtered[id] = { gx: Number(p.gx), gy: Number(p.gy) };
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
  // 오브젝트 드래그 (아케이드 / 서버실)
  // ═══════════════════════════════

  private loadObjectPos(key: string): { x: number; y: number } | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
        return { x: parsed.x, y: parsed.y };
      }
      return null;
    } catch {
      return null;
    }
  }

  private attachObjectDrag(opts: {
    id: "arcade" | "server";
    storageKey: string;
    hit: Phaser.GameObjects.Zone;
    targets: Phaser.GameObjects.GameObject[];
    getAnchor: () => { x: number; y: number };
    setPos: (x: number, y: number) => void;
    onClick: () => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
  }) {
    opts.hit.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      if (this.objectDrag || this.dragTarget) return;
      const anchor = opts.getAnchor();
      // NOTE: Office editor history removed for teammaker-classic (editor not needed)
      opts.onDragStart?.();
      opts.targets.forEach(t => {
        const anyT = t as unknown as { setAlpha?: (a: number) => void };
        anyT.setAlpha?.(0.7);
      });
      this.objectDrag = {
        id: opts.id,
        storageKey: opts.storageKey,
        targets: opts.targets,
        offX: ptr.worldX - anchor.x,
        offY: ptr.worldY - anchor.y,
        startX: ptr.worldX,
        startY: ptr.worldY,
        startTime: performance.now(),
        moved: false,
        minX: 0,
        maxX: WORLD_W,
        minY: WALL_H * TILE,
        maxY: WORLD_H - 32,
        baseX: anchor.x,
        baseY: anchor.y,
        onClick: opts.onClick,
        setPos: opts.setPos,
        onDragEnd: opts.onDragEnd,
      };
    });
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

  /** 팀 머리 위 말풍선 (응답 미리보기/결과 표시) */
  private tmLayout: { cols: number; rows: number; furniture: Array<{ type: string; col: number; row: number }>; wallSetIds?: string[] } | null = null;

  private async ensureTMLayout() {
    if (this.tmLayout) return;
    try {
      const res = await fetch("/assets/teammaker/layouts/default.json");
      this.tmLayout = await res.json();
    } catch { this.tmLayout = null; }
  }

  private renderTMLayoutCrop(_floor: number) {
    const fy = WALL_H * TILE;
    const fh = (ROWS - WALL_H) * TILE;
    const bg = this.add.graphics();
    bg.fillStyle(0xebe3f5, 1);
    bg.fillRect(0, fy, WORLD_W, fh);
    bg.setDepth(0);
    this.envGroup.add(bg);

    if (this.textures.exists("tm_floor_lavender_1")) {
      for (let y = fy; y < fy + fh; y += TILE) {
        for (let x = 0; x < WORLD_W; x += TILE) {
          const tile = this.add.image(x, y, "tm_floor_lavender_1").setOrigin(0, 0).setDepth(1);
          this.envGroup.add(tile);
        }
      }
    }

    // TM 조밀 구역 크롭 (cols 20..45, rows 3..20 → 우리 local 0..25, 3..17)
    const CROP_COL = 20;
    const CROP_ROW = 3;
    this.ensureTMLayout().then(() => {
      const layout = this.tmLayout;
      if (!layout) return;
      for (const f of layout.furniture) {
        const lc = f.col - CROP_COL;
        const lr = f.row - CROP_ROW + WALL_H;
        if (lc < 0 || lc >= COLS) continue;
        if (lr < WALL_H || lr >= ROWS) continue;
        const key = `tm_${f.type}`;
        if (!this.textures.exists(key)) continue;
        const img = this.add.image(lc * TILE, lr * TILE, key).setOrigin(0, 0).setDepth(5);
        const tex = this.textures.get(key);
        if (tex && tex.source[0]) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
        this.envGroup.add(img);
      }
    });
  }

  /** 팀 A 캐릭이 팀 B로 걸어갔다가 돌아옴 (핸드오프/@태그 시각화) */
  // ── 에디터 모드 ───────────────────────────────────
  private editorState: { on: boolean; selectedId: string | null; rotation: 0|1|2|3; flipX?: boolean } = { on: false, selectedId: null, rotation: 0, flipX: false };
  /** 이동 모드 — pickup된 가구: 다음 클릭에 drop */
  private editorPickup: { type: string; origCol: number; origRow: number; rotation: number; flipX: boolean } | null = null;
  private editorCursor?: Phaser.GameObjects.Graphics;
  private editorGridOverlay?: Phaser.GameObjects.Graphics;
  private editorDragCell: string | null = null;

  /** 에디터 한 셀에 배치/삭제 — pointerup + 브러시 양쪽에서 공용 */
  private editorPlaceAt(col: number, row: number, isDelete: boolean) {
    const layout = this.getUserLayout();
    const cellKey = `${col},${row}`;
    if (isDelete) {
      const before = layout.items.length;
      layout.items = layout.items.filter(it => !(it.col === col && it.row === row));
      if (before === layout.items.length) {
        if (!layout.removed.includes(cellKey)) layout.removed.push(cellKey);
      }
    } else {
      const selId = this.editorState.selectedId;
      if (!selId) return;
      let w = 1, h = 1, isStackable = false;
      if (selId.startsWith("poke:")) {
        const pokeName = selId.slice(5);
        isStackable = /^(monitor|pc|laptop|clock|whiteboard|computer_monitor_only|computer_mouse_only|pda|floor_)/.test(pokeName);
      } else {
        const def = getFurnitureDef(selId);
        if (def) {
          w = def.widthCells; h = def.heightCells;
          isStackable = def.category === "appliance" || def.category === "accessory" || def.category === "wall_decor" || def.category === "board";
        }
      }
      const isFloorTile = selId.startsWith("floor_") || selId === "hq_white_marble" || (selId.startsWith("poke:") && selId.slice(5).startsWith("floor_"));
      if (isFloorTile) isStackable = true;
      const rot = this.editorState.rotation;
      const rw = rot % 2 === 1 ? h : w;
      const rh = rot % 2 === 1 ? w : h;
      const occupyCells: string[] = [];
      for (let dx = 0; dx < rw; dx++)
        for (let dy = 0; dy < rh; dy++)
          occupyCells.push(`${col + dx},${row + dy}`);
      // 새 아이템의 레이어 분류 (바닥/벽/가구/스택/캐릭 레이어)
      type Layer = "floor" | "floor_item" | "wall" | "chair" | "furniture" | "stackable";
      // desk_plant_*, potted_plant_round/bushy: 의자(옆모습)로 재분류되어 제거
      // floor_lamp, clipboard_: 삭제됨 / office_stool: accessory / floor_cushion_set: desk
      const deskTopPrefixes = ["book_", "pen_", "coffee_", "cup_", "mouse_", "keyboard", "desk_lamp", "desk_phone", "laptop_", "desk_divider_",
        "desk_extension_lavender", "desk_with_pc", "desk_with_monitors", "binder_set", "tall_cabinet_a", "tall_cabinet_b", "workstation_large", "desk_module_a", "desk_module_b", "desk_module_c", "desk_module_d", "desk_module_e", "conference_table_end", "dual_workstation", "globe_on_stand", "coat_rack"];
      // backpack_*: 듀얼모니터(appliance)로 재분류됨 / briefcase: 전화기(accessory)로 재분류됨
      const floorItemPrefixes = ["trash_", "suitcase_"];
      const getLayer = (id: string): Layer => {
        if (id === "hq_white_marble" || id.startsWith("floor_")) return "floor";
        if (floorItemPrefixes.some(p => id.startsWith(p))) return "floor_item";
        if (id.startsWith("poke:")) {
          const n = id.slice(5);
          if (n.startsWith("floor_")) return "floor";
          if (/^(wall|door|elevator)/.test(n)) return "wall";
          if (/^(monitor|pc|laptop|clock|whiteboard|computer_monitor|computer_mouse|pda|printer)/.test(n)) return "stackable";
          return "furniture";
        }
        if (deskTopPrefixes.some(p => id.startsWith(p))) return "stackable";
        const def = getFurnitureDef(id);
        if (!def) {
          if (id.startsWith("wall_") || id.startsWith("divider_")) return "wall";
          return "furniture";
        }
        const lbl = (def.label || "").toLowerCase();
        if (/monitor|printer|laptop|phone|dispenser|keyboard|mouse|speaker|tv|screen/.test(lbl)) return "stackable";
        if (/\bchair\b/.test(lbl)) return "chair";
        if (def.category === "floor_tile" || def.category === "floor_decor") return "floor";
        if (def.category === "wall_tile" || def.category === "wall_decor" || def.category === "divider" || def.category === "partition") return "wall";
        if (def.category === "chair" || def.category === "seating") return "chair";
        if (def.category === "appliance" || def.category === "accessory" || def.category === "board") return "stackable";
        return "furniture";
      };
      const newLayer = getLayer(selId);
      // 동급끼리 겹침 금지 — 같은 레이어만 제거, 다른 레이어는 유지 (스택 OK)
      // 의자끼리도 겹침 금지 (footprint가 닿으면 이전 의자 제거)
      layout.items = layout.items.filter(it => {
        const itLayer = getLayer(it.type);
        if (itLayer !== newLayer) return true;  // 다른 레이어 → 유지
        // 같은 레이어 → footprint 겹치면 제거
        const idef = it.type.startsWith("poke:") ? null : getFurnitureDef(it.type);
        const iw = idef?.widthCells ?? 1;
        const ih = idef?.heightCells ?? 1;
        const irot = it.rotation ?? 0;
        const irw = irot % 2 === 1 ? ih : iw;
        const irh = irot % 2 === 1 ? iw : ih;
        for (let dx = 0; dx < irw; dx++)
          for (let dy = 0; dy < irh; dy++)
            if (occupyCells.includes(`${it.col + dx},${it.row + dy}`)) return false;
        return true;
      });
      // 가구/스택 배치 시 바닥 자동 채움 (배경 검은색 방지)
      if (newLayer === "furniture" || newLayer === "stackable") {
        for (const k of occupyCells) {
          const [cx, cy] = k.split(",").map(Number);
          const hasFloor = layout.items.some(it => (it.col === cx && it.row === cy) && getLayer(it.type) === "floor");
          if (!hasFloor) {
            layout.items.push({ type: "hq_white_marble", col: cx, row: cy, rotation: 0 });
          }
        }
      }
      layout.items.push({ type: selId, col, row, rotation: this.editorState.rotation, flipX: !!this.editorState.flipX });
      // 바닥 아닌 것 배치 시 TM 기본 숨김 (이전 turn 동작 유지)
      if (newLayer !== "floor") {
        for (const k of occupyCells) {
          if (!layout.removed.includes(k)) layout.removed.push(k);
        }
      }
    }
    this.saveUserLayout(layout);
    try {
      window.dispatchEvent(new CustomEvent("hq:toast", { detail: {
        text: `✅ ${isDelete ? "삭제" : "배치"} · ${layout.items.length}개 배치 / ${layout.removed.length}개 숨김`,
        variant: "success", ms: 800,
      }}));
    } catch {}
    this.buildFloor(this.currentFloor);
  }

  private showEditorGrid() {
    if (this.editorGridOverlay) this.editorGridOverlay.destroy();
    const g = this.add.graphics().setDepth(19000);
    // 그리드 전체 월드 커버 (검은 영역 포함 → 어디든 배치 가능 표시)
    g.lineStyle(1, 0xfbbf24, 0.2);
    for (let x = 0; x <= COLS; x++) g.lineBetween(x * TILE, 0, x * TILE, ROWS * TILE);
    for (let y = 0; y <= ROWS; y++) g.lineBetween(0, y * TILE, WORLD_W, y * TILE);
    // 검은 영역(TM 바닥 없는 곳)도 편집 가능 — 어두운 반투명 오버레이로 표시
    g.fillStyle(0xfbbf24, 0.02);
    g.fillRect(0, 0, WORLD_W, ROWS * TILE);
    this.editorGridOverlay = g;
  }
  private hideEditorGrid() {
    if (this.editorGridOverlay) { this.editorGridOverlay.destroy(); this.editorGridOverlay = undefined; }
  }

  private setupEditorListeners() {
    // E2: 모든 window listener를 명시적 핸들러로 추출 → shutdown 시 일괄 해제
    const handleEditMode = (e: Event) => {
      const d = (e as CustomEvent).detail as { on: boolean; selectedId: string | null; rotation: 0|1|2|3; flipX?: boolean };
      this.editorState = { on: d.on, selectedId: d.selectedId, rotation: d.rotation, flipX: d.flipX ?? false };
      if (!d.on && this.editorCursor) { this.editorCursor.destroy(); this.editorCursor = undefined; }
      if (d.on) this.showEditorGrid(); else this.hideEditorGrid();
      this.teamGroups.forEach(tg => { tg.container.setVisible(!d.on); });
    };
    const handleLayoutReload = () => {
      if (!this.sys?.isActive?.()) return;
      this.renderUserLayout();
    };
    const handleOverridesApplied = () => {
      if (!this.sys || !this.sys.isActive || !this.sys.isActive()) return;
      if (!this.envGroup || !this.teamGroups) return;
      this.buildFloor(this.currentFloor);
    };
    // 핸드오프 걷기 애니메이션 — Office.tsx가 dispatch 이어받기 감지 시 발생
    // 중복 트리거 방지: 이미 걷고 있으면 스킵 (덜덜떨림 방지)
    const handleHandoffWalk = (e: Event) => {
      const d = (e as CustomEvent).detail as { from?: string; to?: string };
      if (!d?.from || !d?.to) return;
      const fromTg = this.teamGroups.get(d.from);
      const toTg = this.teamGroups.get(d.to);
      if (!fromTg || !toTg) return;
      // from 팀 캐릭이 이미 걷기 중 OR 외출 중이면 스킵
      const fromChar = fromTg.members[0]?.char;
      if (fromChar?.getData("walking") || fromChar?.getData("walkout")) return;
      // 목적지 = 대상 팀 책상 바로 옆 셀 (1칸 좌측, 없으면 우측)
      const tgx = toTg.gridX - 1 >= 0 ? toTg.gridX - 1 : toTg.gridX + toTg.config.gridW;
      const tgy = toTg.gridY + Math.floor(toTg.config.gridH / 2);
      this.walkCharToSpot(d.from, tgx, tgy);
      // 2.5초 후 복귀
      this.time.delayedCall(2500, () => this.walkCharHome(d.from!));
    };
    window.addEventListener("hq:edit-mode", handleEditMode);
    window.addEventListener("hq:layout-reload", handleLayoutReload);
    window.addEventListener("hq:furniture-overrides-applied", handleOverridesApplied);
    window.addEventListener("hq:walk", handleHandoffWalk);
    // 모든 리스너 + timer를 shutdown 시 해제 (메모리 누수 방지)
    this.events.once("shutdown", () => {
      window.removeEventListener("hq:edit-mode", handleEditMode);
      window.removeEventListener("hq:layout-reload", handleLayoutReload);
      window.removeEventListener("hq:furniture-overrides-applied", handleOverridesApplied);
      window.removeEventListener("hq:walk", handleHandoffWalk);
      // Phaser time events 정리
      this.time.removeAllEvents();
      // tweens는 destroy 시 scene이 정리, 남은 tween kill
      this.tweens.killAll();
    });
    console.info("[hq-furn] scene setup → re-fetch overrides");
    fetchAndApplyFurnitureOverrides();
    // 마우스 이동 → 커서 하이라이트 셀 표시
    this.input.on("pointermove", (ptr: Phaser.Input.Pointer) => {
      if (!this.editorState.on) return;
      const col = Math.floor(ptr.worldX / TILE);
      const row = Math.floor(ptr.worldY / TILE);
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
      if (!this.editorCursor) {
        this.editorCursor = this.add.graphics().setDepth(20000);
      }
      this.editorCursor.clear();
      const def = this.editorState.selectedId ? getFurnitureDef(this.editorState.selectedId) : null;
      const w = (def?.widthCells ?? 1) * TILE;
      const h = (def?.heightCells ?? 1) * TILE;
      const rot = this.editorState.rotation;
      const rw = rot % 2 === 1 ? h : w;
      const rh = rot % 2 === 1 ? w : h;
      this.editorCursor.lineStyle(2, 0xfbbf24, 0.9);
      this.editorCursor.strokeRect(col * TILE, row * TILE, rw, rh);
      this.editorCursor.fillStyle(0xfbbf24, 0.15);
      this.editorCursor.fillRect(col * TILE, row * TILE, rw, rh);
      // 드래그 연속 브러시 — 좌클릭 = 배치, 우클릭 = 연속 삭제
      if (ptr.isDown) {
        const lastCell = this.editorDragCell;
        if (lastCell !== `${col},${row}`) {
          this.editorDragCell = `${col},${row}`;
          if (ptr.rightButtonDown()) {
            this.editorPlaceAt(col, row, true);
          } else if (this.editorState.selectedId) {
            this.editorPlaceAt(col, row, false);
          }
        }
      }
    });
    // 클릭 → 배치 / 우클릭 → 삭제 (모든 셀, 검은 영역 포함)
    this.input.on("pointerdown", () => { this.editorDragCell = null; });
    this.input.on("pointerup", (ptr: Phaser.Input.Pointer) => {
      this.editorDragCell = null;
      if (!this.editorState.on) return;
      if (this.dragTarget || this.objectDrag) return;
      const col = Math.floor(ptr.worldX / TILE);
      const row = Math.floor(ptr.worldY / TILE);
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
      const isDel = ptr.rightButtonReleased() || ptr.button === 2;

      // ── 이동 모드: pickup → drop ──
      if (isDel) {
        // 우클릭 시 pickup 취소 + 일반 삭제 흐름
        if (this.editorPickup) {
          this.editorPickup = null;
          window.dispatchEvent(new CustomEvent("hq:toast", { detail: { text: "이동 취소됨", variant: "info", center: true, ms: 1500 } }));
          return;
        }
        this.editorPlaceAt(col, row, true);
        return;
      }

      // selectedId 있으면 기존 배치 흐름
      if (this.editorState.selectedId) {
        this.editorPlaceAt(col, row, false);
        return;
      }

      // pickup 상태면 drop
      if (this.editorPickup) {
        const pk = this.editorPickup;
        const layout = this.getUserLayout();
        // 원래 위치에서 제거
        layout.items = layout.items.filter(it => !(it.col === pk.origCol && it.row === pk.origRow && it.type === pk.type));
        // selectedId 임시 설정 후 editorPlaceAt으로 배치 (겹침/바닥 처리 재사용)
        this.saveUserLayout(layout);
        const prevSel = this.editorState.selectedId;
        const prevRot = this.editorState.rotation;
        const prevFlip = this.editorState.flipX;
        this.editorState.selectedId = pk.type;
        this.editorState.rotation = pk.rotation as 0|1|2|3;
        this.editorState.flipX = pk.flipX;
        this.editorPlaceAt(col, row, false);
        this.editorState.selectedId = prevSel;
        this.editorState.rotation = prevRot;
        this.editorState.flipX = prevFlip;
        this.editorPickup = null;
        return;
      }

      // 빈 손 + 해당 셀에 가구 있으면 pickup (타일/벽지 제외)
      const layout = this.getUserLayout();
      const targetItem = layout.items.find(it => {
        if (it.type.startsWith("floor_") || it.type === "hq_white_marble") return false;
        if (it.type.startsWith("poke:") && it.type.slice(5).startsWith("floor_")) return false;
        const idef = it.type.startsWith("poke:") ? null : getFurnitureDef(it.type);
        if (idef && (idef.category === "floor_tile" || idef.category === "wall_tile" || idef.category === "floor_decor" || idef.category === "wall_decor")) return false;
        const iw = idef?.widthCells ?? 1;
        const ih = idef?.heightCells ?? 1;
        const irot = it.rotation ?? 0;
        const irw = irot % 2 === 1 ? ih : iw;
        const irh = irot % 2 === 1 ? iw : ih;
        return col >= it.col && col < it.col + irw && row >= it.row && row < it.row + irh;
      });
      if (targetItem) {
        this.editorPickup = {
          type: targetItem.type,
          origCol: targetItem.col,
          origRow: targetItem.row,
          rotation: targetItem.rotation ?? 0,
          flipX: !!targetItem.flipX,
        };
        window.dispatchEvent(new CustomEvent("hq:toast", { detail: { text: "✋ 가구 들었음 — 다음 클릭에 놓기 (우클릭 취소)", variant: "info", center: true, ms: 2500 } }));
      }
    });
    // 아래 구 버전은 필요 없음
    this.input.on("pointerup_legacy_disabled", (ptr: Phaser.Input.Pointer) => {
      if (!this.editorState.on) return;
      if (this.dragTarget || this.objectDrag) return;
      const col = Math.floor(ptr.worldX / TILE);
      const row = Math.floor(ptr.worldY / TILE);
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
      // 편집 모드에선 통창 영역도 배치 허용
      const layout = this.getUserLayout();
      const cellKey = `${col},${row}`;
      if (ptr.rightButtonReleased() || ptr.button === 2) {
        // 우클릭 — 유저 배치 먼저 제거. 없으면 TM 기본 가구를 removed에 기록
        const before = layout.items.length;
        layout.items = layout.items.filter(it => !(it.col === col && it.row === row));
        if (before === layout.items.length) {
          // 유저 배치 없음 → TM 기본 제거 목록에 추가
          if (!layout.removed.includes(cellKey)) layout.removed.push(cellKey);
          window.dispatchEvent(new CustomEvent("hq:toast", { detail: { text: `🗑 TM 기본 가구 삭제 (${cellKey})`, variant: "info" } }));
        }
      } else if (this.editorState.selectedId) {
        // 좌클릭 — 다중-셀 겹침 방지 (단, stackable 가구는 책상 위에 올림)
        const selId = this.editorState.selectedId;
        let w = 1, h = 1;
        let isStackable = false;  // 모니터/보드/액자/컴퓨터 등 책상 위에 올리는 아이템
        if (selId.startsWith("poke:")) {
          const pokeName = selId.slice(5);
          // 포켓몬 stackable 판정 — 이름 기반
          isStackable = /^(monitor|pc|laptop|clock|whiteboard|computer_monitor_only|computer_mouse_only|pda)/.test(pokeName);
          w = 1; h = 1;
        } else {
          const def = getFurnitureDef(selId);
          if (def) {
            w = def.widthCells; h = def.heightCells;
            isStackable = def.category === "appliance" || def.category === "accessory" || def.category === "wall_decor" || def.category === "board";
          }
        }
        // 바닥/타일도 stackable (다른 것 위에 덮지 않음, 아래 깔림)
        const isFloor = selId.startsWith("floor_") || (selId.startsWith("poke:") && selId.slice(5).startsWith("floor_"));
        if (isFloor) isStackable = true;
        // 회전 시 w/h 스왑
        const rot = this.editorState.rotation;
        const rw = rot % 2 === 1 ? h : w;
        const rh = rot % 2 === 1 ? w : h;
        // 점유할 모든 셀 계산
        const occupyCells: string[] = [];
        for (let dx = 0; dx < rw; dx++) {
          for (let dy = 0; dy < rh; dy++) {
            occupyCells.push(`${col + dx},${row + dy}`);
          }
        }
        // Stackable(모니터/바닥/장식)은 겹침 허용 — 아래 깔리거나 위에 올라감
        // 일반 가구만 겹치는 것 제거
        if (!isStackable) {
          layout.items = layout.items.filter(it => {
            // 바닥/벽 타일은 항상 유지 (밑에 깔림)
            if (it.type.startsWith("floor_") || it.type.startsWith("wall_")) return true;
            const idef = it.type.startsWith("poke:") ? null : getFurnitureDef(it.type);
            const iw = idef?.widthCells ?? 1;
            const ih = idef?.heightCells ?? 1;
            const irot = it.rotation ?? 0;
            const irw = irot % 2 === 1 ? ih : iw;
            const irh = irot % 2 === 1 ? iw : ih;
            // 기존 아이템이 stackable(가전/장식)이면 유지
            const itIsStackable = idef && (idef.category === "appliance" || idef.category === "accessory" || idef.category === "wall_decor" || idef.category === "board");
            if (itIsStackable) return true;
            // 일반 가구끼리만 제거
            for (let dx = 0; dx < irw; dx++) {
              for (let dy = 0; dy < irh; dy++) {
                if (occupyCells.includes(`${it.col + dx},${it.row + dy}`)) return false;
              }
            }
            return true;
          });
        }
        // 바닥/벽이 아닌 가구 배치 시 → 점유 셀에 자동으로 바닥 타일 깔기 (검은 배경 방지)
        const isTileFill = selId.startsWith("floor_") || selId.startsWith("wall_") || selId.startsWith("divider_");
        if (!isTileFill) {
          for (const k of occupyCells) {
            const [cx, cy] = k.split(",").map(Number);
            // 이미 해당 셀에 바닥 아이템이 있으면 스킵
            const hasFloor = layout.items.some(it => it.col === cx && it.row === cy && it.type.startsWith("floor_"));
            if (!hasFloor) {
              layout.items.push({ type: "floor_lavender_1", col: cx, row: cy, rotation: 0 });
            }
          }
        }
        layout.items.push({ type: selId, col, row, rotation: this.editorState.rotation, flipX: !!this.editorState.flipX });
        // 모든 점유 셀의 TM 기본 숨김
        for (const k of occupyCells) {
          if (!layout.removed.includes(k)) layout.removed.push(k);
        }
      } else {
        return;
      }
      this.saveUserLayout(layout);
      // 배치/삭제 확인 토스트
      const action = (ptr.rightButtonReleased() || ptr.button === 2) ? "삭제" : "배치";
      try {
        window.dispatchEvent(new CustomEvent("hq:toast", { detail: {
          text: `✅ ${action} 완료 · 저장 (${layout.items.length}개 배치, ${layout.removed.length}개 숨김)`,
          variant: "success", ms: 1200,
        }}));
      } catch {}
      // 전체 재빌드 — TM 기본 가구도 removed 반영
      this.buildFloor(this.currentFloor);
    });
    // 우클릭 컨텍스트 메뉴 차단 (캔버스에서)
    this.game.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** BFS 그리드 경로탐색 (TM pathfinding 패턴) — 4방향 */
  private bfsPath(sx: number, sy: number, ex: number, ey: number): Array<{x: number; y: number}> | null {
    if (sx === ex && sy === ey) return [{x: sx, y: sy}];
    const visited = new Set<string>();
    const prev = new Map<string, string>();
    const key = (x: number, y: number) => `${x},${y}`;
    const queue: Array<{x: number; y: number}> = [{x: sx, y: sy}];
    visited.add(key(sx, sy));
    const dirs = [{dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1}];
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur.x === ex && cur.y === ey) {
        // reconstruct path
        const path: Array<{x: number; y: number}> = [];
        let k = key(ex, ey);
        while (k) {
          const [kx, ky] = k.split(",").map(Number);
          path.unshift({x: kx, y: ky});
          const p = prev.get(k);
          if (!p) break;
          k = p;
        }
        return path;
      }
      for (const d of dirs) {
        const nx = cur.x + d.dx, ny = cur.y + d.dy;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        const nk = key(nx, ny);
        if (visited.has(nk)) continue;
        // grid 차단 셀은 통과 금지 (복도든 아니든 floor 없으면 차단).
        // 목적지 셀(ex,ey)은 grid 체크는 외부에서 이미 통과한 것이므로 예외 허용.
        if (this.grid[ny]?.[nx] && !(nx === ex && ny === ey)) continue;
        visited.add(nk);
        prev.set(nk, key(cur.x, cur.y));
        queue.push({x: nx, y: ny});
      }
    }
    return null;
  }

  /** TM walkToManager 패턴 — 채팅창이 열릴 때 캐릭터가 지정 셀로 이동 (자동 복귀 없음) */
  walkCharToSpot(teamId: string, gx: number, gy: number) {
    const tg = this.teamGroups.get(teamId);
    if (!tg || !tg.members[0]) return;
    const m = tg.members[0];
    const char = m.char;
    if (char.getData("walking")) return;
    char.setData("walking", true);
    // 이미 떨어져 있으면(walkout 중복 호출) 그대로 두기
    const sx = (char.parentContainer ? tg.container.x : 0) + (char.x as number);
    const sy = (char.parentContainer ? tg.container.y : 0) + (char.y as number);
    const tx = gx * TILE + TILE / 2, ty = gy * TILE + TILE / 2;
    const startGX = Math.floor(sx / TILE), startGY = Math.floor(sy / TILE);
    const path = this.bfsPath(startGX, startGY, gx, gy);
    if (char.parentContainer) {
      tg.container.remove(char);
      this.add.existing(char);
      char.setPosition(sx, sy).setDepth(300);
      char.setData("walkout", true);  // 외출 플래그 — buildFloor 재빌드 시 destroy 판단용
    }
    if (path && path.length > 1) {
      let i = 1;
      const stepOne = () => {
        if (i >= path.length) { char.stop(); char.setFrame(0); char.setData("walking", false); return; }
        const p = path[i]; if (!p) { char.setData("walking", false); return; }
        const cx = p.x * TILE + TILE / 2, cy = p.y * TILE + TILE / 2;
        const dx = cx - (char.x as number);
        const dy = cy - (char.y as number);
        // 방향 우선순위: 수평 이동 > 수직 이동 (수직에선 up/down 구분 필수 — 이전엔 down만 써서 뒤로 걷는 듯 보였음)
        let anim: string;
        if (Math.abs(dx) > Math.abs(dy)) {
          anim = dx > 0 ? `char_${m.charIdx}_walk_right` : `char_${m.charIdx}_walk_left`;
        } else {
          anim = dy > 0 ? `char_${m.charIdx}_walk_down` : `char_${m.charIdx}_walk_up`;
        }
        char.play(anim);
        this.tweens.add({ targets: char, x: cx, y: cy, duration: 180, ease: "Linear", onComplete: () => { i++; stepOne(); } });
      };
      stepOne();
    } else {
      // 폴백: L자 (가로 먼저 → 세로)
      const dx = tx - sx;
      const dy = ty - sy;
      const speed = 80;
      char.play(dx > 0 ? `char_${m.charIdx}_walk_right` : dx < 0 ? `char_${m.charIdx}_walk_left` : `char_${m.charIdx}_walk_down`);
      this.tweens.add({ targets: char, x: tx, duration: Math.max(200, Math.abs(dx) * (1000/speed)), ease: "Linear",
        onComplete: () => {
          // 세로 이동 방향 애니메이션
          char.play(dy > 0 ? `char_${m.charIdx}_walk_down` : `char_${m.charIdx}_walk_up`);
          this.tweens.add({ targets: char, y: ty, duration: Math.max(200, Math.abs(dy) * (1000/speed)), ease: "Linear",
            onComplete: () => { char.stop(); char.setFrame(0); char.setData("walking", false); } });
        } });
    }
  }

  /** TM walkFromManager — 채팅창 닫히면 책상으로 복귀 */
  walkCharHome(teamId: string) {
    const tg = this.teamGroups.get(teamId);
    if (!tg || !tg.members[0]) return;
    const m = tg.members[0];
    const char = m.char;
    if (!char.parentContainer) {
      // 씬 직속(외출 중) → 책상 복귀
      const tx = tg.container.x + m.baseX, ty = tg.container.y + m.baseY;
      const startGX = Math.floor((char.x as number) / TILE), startGY = Math.floor((char.y as number) / TILE);
      const endGX = Math.floor(tx / TILE), endGY = Math.floor(ty / TILE);
      const path = this.bfsPath(startGX, startGY, endGX, endGY);
      const finish = () => {
        this.add.existing(char);
        tg.container.add(char);
        char.setPosition(m.baseX, m.baseY).setDepth(10);
        char.stop(); char.setFrame(0);
        char.setData("walking", false);
        char.setData("walkout", false);  // 복귀 완료 — 플래그 해제
      };
      if (path && path.length > 1) {
        char.setData("walking", true);
        let i = 1;
        const stepOne = () => {
          if (i >= path.length) { finish(); return; }
          const p = path[i]; if (!p) { finish(); return; }
          const cx = p.x * TILE + TILE / 2, cy = p.y * TILE + TILE / 2;
          const dx = cx - (char.x as number);
          const dy = cy - (char.y as number);
          let anim: string;
          if (Math.abs(dx) > Math.abs(dy)) {
            anim = dx > 0 ? `char_${m.charIdx}_walk_right` : `char_${m.charIdx}_walk_left`;
          } else {
            anim = dy > 0 ? `char_${m.charIdx}_walk_down` : `char_${m.charIdx}_walk_up`;
          }
          char.play(anim);
          this.tweens.add({ targets: char, x: cx, y: cy, duration: 180, ease: "Linear", onComplete: () => { i++; stepOne(); } });
        };
        stepOne();
      } else {
        finish();
      }
    }
  }

  walkCharToTeam(fromId: string, toId: string) {
    const fromTg = this.teamGroups.get(fromId);
    const toTg = this.teamGroups.get(toId);
    if (!fromTg || !toTg || !fromTg.members[0]) return;
    const m = fromTg.members[0];
    const char = m.char;
    if (char.getData("walking")) return;
    char.setData("walking", true);

    // 시작/끝 월드 좌표
    const sx = fromTg.container.x + m.baseX;
    const sy = fromTg.container.y + m.baseY;
    const tx = toTg.container.x;
    const ty = toTg.container.y + (toTg.config.gridH * TILE) / 2 + 8;

    // 그리드 BFS 경로 시도 (실패 시 L자 폴백)
    const startGX = Math.floor(sx / TILE), startGY = Math.floor(sy / TILE);
    const endGX = Math.floor(tx / TILE), endGY = Math.floor(ty / TILE);
    const path = this.bfsPath(startGX, startGY, endGX, endGY);
    if (path && path.length > 1) {
      fromTg.container.remove(char);
      this.add.existing(char);
      char.setPosition(sx, sy).setDepth(300);
      // tile-by-tile 타일 단위 이동 (TM 방식)
      let i = 1;
      const stepOne = () => {
        if (i >= path.length) {
          // 도착 + ! 알림 + 복귀
          char.stop(); char.setFrame(0);
          const alertTxt = this.add.text(toTg.container.x, toTg.container.y - 30, "!", {
            fontSize: "14px", color: "#fbbf24", fontStyle: "bold", resolution: 8,
          }).setOrigin(0.5, 1).setDepth(301);
          this.tweens.add({targets: alertTxt, y: alertTxt.y - 10, alpha: 0, duration: 800, delay: 200, onComplete: () => alertTxt.destroy()});
          this.time.delayedCall(900, () => {
            // 복귀 (역순)
            let j = path.length - 2;
            const backOne = () => {
              if (j < 0) {
                fromTg.container.add(char);
                char.setPosition(m.baseX, m.baseY).setDepth(10);
                char.stop(); char.setFrame(0);
                char.setData("walking", false);
                return;
              }
              const p = path[j];
              if (!p) { char.setData("walking", false); return; }
              const cx = p.x * TILE + TILE / 2, cy = p.y * TILE + TILE / 2;
              const dx = cx - (char.x as number);
              const anim = dx > 0 ? `char_${m.charIdx}_walk_right` : dx < 0 ? `char_${m.charIdx}_walk_left` : `char_${m.charIdx}_walk_down`;
              char.play(anim);
              this.tweens.add({targets: char, x: cx, y: cy, duration: 180, ease: "Linear", onComplete: () => { j--; backOne(); }});
            };
            backOne();
          });
          return;
        }
        const p = path[i];
        if (!p) { char.setData("walking", false); return; }
        const cx = p.x * TILE + TILE / 2, cy = p.y * TILE + TILE / 2;
        const dx = cx - (char.x as number);
        const anim = dx > 0 ? `char_${m.charIdx}_walk_right` : dx < 0 ? `char_${m.charIdx}_walk_left` : `char_${m.charIdx}_walk_down`;
        char.play(anim);
        this.tweens.add({targets: char, x: cx, y: cy, duration: 180, ease: "Linear", onComplete: () => { i++; stepOne(); }});
      };
      stepOne();
      return;
    }
    // 폴백: 기존 L자 (경로 없음 시)

    // 부모 변경: 컨테이너에서 빼서 씬에 직접
    fromTg.container.remove(char);
    this.add.existing(char);
    char.setPosition(sx, sy).setDepth(300);

    const dx1 = tx - sx, dy1 = ty - sy;
    const step = 100; // ms per tile
    const speed = 80; // px per sec reference
    const dur1 = Math.max(200, Math.abs(dx1) * (1000 / speed));
    const dur2 = Math.max(200, Math.abs(dy1) * (1000 / speed));

    const walkAnim = dx1 > 0 ? `char_${m.charIdx}_walk_right` : `char_${m.charIdx}_walk_left`;
    char.play(walkAnim);

    const comeBack = () => {
      const dxB = sx - tx, dyB = sy - ty;
      const animB = dxB > 0 ? `char_${m.charIdx}_walk_right` : `char_${m.charIdx}_walk_left`;
      char.play(animB);
      this.tweens.add({
        targets: char, y: sy, duration: Math.max(200, Math.abs(dyB) * (1000/speed)), ease: "Linear",
        onComplete: () => {
          this.tweens.add({
            targets: char, x: sx, duration: Math.max(200, Math.abs(dxB) * (1000/speed)), ease: "Linear",
            onComplete: () => {
              this.add.existing(char); // 유지
              fromTg.container.add(char);
              char.setPosition(m.baseX, m.baseY).setDepth(10);
              char.stop();
              char.setFrame(0);
              char.setData("walking", false);
            },
          });
        },
      });
    };

    this.tweens.add({
      targets: char, x: tx, duration: dur1, ease: "Linear",
      onComplete: () => {
        char.play(dy1 > 0 ? `char_${m.charIdx}_walk_right` : `char_${m.charIdx}_walk_left`);
        this.tweens.add({
          targets: char, y: ty, duration: dur2, ease: "Linear",
          onComplete: () => {
            // 도착 시 잠깐 멈춤 (!와 함께)
            char.stop(); char.setFrame(0);
            // B 팀 머리 위에 ! 알림
            const alertTxt = this.add.text(toTg.container.x, toTg.container.y - 30, "!", {
              fontSize: "14px", color: "#fbbf24", fontStyle: "bold", resolution: 8,
            }).setOrigin(0.5, 1).setDepth(301);
            this.tweens.add({
              targets: alertTxt, y: alertTxt.y - 10, alpha: 0, duration: 800, delay: 200,
              onComplete: () => alertTxt.destroy(),
            });
            this.time.delayedCall(900, comeBack);
          },
        });
      },
    });
    // silence unused step warning
    void step;
  }

  showBubble(teamId: string, text: string, variant: "loading" | "result" | "info" = "result") {
    if (!this.bubbleManager) return;
    const short = text.length > 80 ? text.slice(0, 77) + "…" : text;
    this.bubbleManager.add({ teamId, text: short, variant });
  }

  /** 해당 팀의 모든 말풍선 제거 */
  clearBubble(teamId: string) {
    this.bubbleManager?.removeForTeam(teamId);
  }

  /** TM 스타일 상태 뱃지 — working=초록 / complete=파랑 / error=빨강 */
  private setStatusBadge(tg: TeamGroup, status: "working" | "dispatching" | "complete" | "error" | null) {
    if (tg.statusBadge) { tg.statusBadge.destroy(); tg.statusBadge = undefined; }
    // 상태 해제 또는 non-active 상태 → 캐릭 바운스/걷기 애니 정지 + baseY 복귀
    if (status === null || (status !== "working" && status !== "dispatching")) {
      for (const m of tg.members) {
        if (!m?.char || m.char.getData("walkout") || m.char.getData("walking")) continue;
        this.tweens.killTweensOf(m.char);
        try { m.char.stop(); m.char.setFrame(0); m.char.setY(m.baseY); } catch {}
      }
    }
    if (!status) return;
    // 팀메이커 스타일: 밝은 배경 + 둥근 pill + 흰 글씨 + 얕은 그림자
    const colors = { working: 0x22c55e, dispatching: 0xf59e0b, complete: 0x3b82f6, error: 0xef4444 };
    const labels = { working: "작업 중", dispatching: "배분 중", complete: "완료", error: "에러" };
    const textW = labels[status].length * 8 + 16;  // 대략 글자당 8px
    const W = Math.max(42, textW), H = 16;
    const c = this.add.container(0, tg.config.gridH * TILE / 2 + 18).setDepth(250);
    // 그림자
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.28);
    shadow.fillRoundedRect(-W / 2, -H / 2 + 1, W, H, 8);
    c.add(shadow);
    // 본체
    const bg = this.add.graphics();
    bg.fillStyle(colors[status], 1);
    bg.fillRoundedRect(-W / 2, -H / 2, W, H, 8);
    // 상단 하이라이트 (광택)
    bg.fillStyle(0xffffff, 0.2);
    bg.fillRoundedRect(-W / 2 + 1, -H / 2 + 1, W - 2, 3, 4);
    c.add(bg);
    const t = this.add.text(0, 0, labels[status], {
      fontSize: "10px", color: "#ffffff", fontStyle: "700",
      fontFamily: "Pretendard Variable, system-ui, sans-serif", resolution: 16,
    }).setOrigin(0.5);
    c.add(t);
    tg.container.add(c);
    tg.statusBadge = c;
    // 펄스 애니메이션 (진행 상태)
    if (status === "working" || status === "dispatching") {
      this.tweens.add({
        targets: c, scale: 1.06, duration: 650, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
      });
      // 캐릭 액션 — working/dispatching 시 제자리 걷기 애니 + 상하 작은 바운스 (타이핑 느낌)
      for (const m of tg.members) {
        if (!m?.char || m.char.getData("walkout")) continue;
        const anim = `char_${m.charIdx}_walk_down`;
        try { m.char.play(anim); } catch {}
        // 기존 바운스 트윈 있으면 정지 후 재시작
        this.tweens.killTweensOf(m.char);
        this.tweens.add({
          targets: m.char,
          y: m.baseY - 2,  // 2px 위로 살짝 부양
          duration: 260, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
        });
      }
    }
    if (status !== "working" && status !== "dispatching") {
      // 캐릭 액션 정지 — 바운스 트윈 kill + 정지 프레임
      for (const m of tg.members) {
        if (!m?.char || m.char.getData("walkout")) continue;
        this.tweens.killTweensOf(m.char);
        try { m.char.stop(); m.char.setFrame(0); m.char.setY(m.baseY); } catch {}
      }
      // 3초 후 자동 페이드아웃 (완료/에러만)
      this.tweens.add({
        targets: c, alpha: 0, duration: 500, delay: 3000,
        onComplete: () => { c.destroy(); if (tg.statusBadge === c) tg.statusBadge = undefined; },
      });
    }
  }

  /** 작업 완료 뱃지 / 디스패치 상태 (외부 이벤트용) */
  showStatusBadge(teamId: string, status: "complete" | "error" | "dispatching") {
    const tg = this.teamGroups.get(teamId);
    if (tg) this.setStatusBadge(tg, status);
  }

  setWorking(teamId: string, working: boolean) {
    const tg = this.teamGroups.get(teamId);
    if (!tg) return;
    if (working) this.workingSet.add(teamId); else this.workingSet.delete(teamId);
    this.setStatusBadge(tg, working ? "working" : null);

    // 작업 시작 시 캐릭이 매니저 앞으로 나가있으면 책상 복귀
    // (외출 중인 상태에서 workGlow는 책상 container에 부착되므로 위치 mismatch 방지)
    if (working) {
      const m0 = tg.members[0];
      if (m0 && !m0.char.parentContainer) {
        this.walkCharHome(teamId);
      }
    }

    // TM 스타일 녹색 작업 표시 — 팀 영역 감싸는 녹색 펄스 테두리
    if (working && !tg.workGlow) {
      const pw = tg.config.gridW * TILE;
      const ph = tg.config.gridH * TILE;
      const glow = this.add.graphics().setDepth(9);
      glow.lineStyle(2, 0x22c55e, 0.9);  // TM green
      glow.strokeRoundedRect(-pw / 2 - 2, -ph / 2 - 2, pw + 4, ph + 4, 4);
      glow.fillStyle(0x22c55e, 0.08);
      glow.fillRoundedRect(-pw / 2 - 2, -ph / 2 - 2, pw + 4, ph + 4, 4);
      tg.container.addAt(glow, 0);
      tg.workGlow = glow;
      this.tweens.add({ targets: glow, alpha: 0.3, duration: 800, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    } else if (!working && tg.workGlow) {
      this.tweens.killTweensOf(tg.workGlow);
      tg.workGlow.destroy();
      tg.workGlow = undefined;
    }

    tg.members.forEach(m => {
      if (working) {
        const typeAnim = m.baseX > 0 ? `char_${m.charIdx}_type_left` : `char_${m.charIdx}_type`;
        m.char.play(typeAnim);
      } else {
        const SPRITE_C = 4;
        if (m.baseX < 0) m.char.setFrame(SPRITE_C * 2);
        else if (m.baseX > 0) m.char.setFrame(SPRITE_C);
        else m.char.stop();  // 솔로 — 정지 프레임 (idle anim 루프 안 돎)
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
    for (let gy = WALL_H; gy <= ROWS - teamConfig.gridH; gy++) {
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
