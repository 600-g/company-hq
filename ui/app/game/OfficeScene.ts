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
const WALL_H = 2; // 벽(통창) 높이 (칸)

interface TeamConfig {
  id: string; name: string; emoji: string;
  chars: number[]; gridX: number; gridY: number; gridW: number; gridH: number;
}

const ALL_FLOORS: Record<number, TeamConfig[]> = {
  1: [
    { id: "trading-bot", name: "매매봇", emoji: "🤖", chars: [0, 3, 4, 5], gridX: 1, gridY: 3, gridW: 4, gridH: 4 },
    { id: "date-map", name: "데이트지도", emoji: "🗺️", chars: [1, 5, 3, 0], gridX: 6, gridY: 3, gridW: 4, gridH: 4 },
    { id: "claude-biseo", name: "클로드비서", emoji: "🤵", chars: [2, 4, 5, 1], gridX: 11, gridY: 3, gridW: 4, gridH: 4 },
    { id: "ai900", name: "AI900", emoji: "📚", chars: [3, 0, 1, 2], gridX: 16, gridY: 3, gridW: 4, gridH: 4 },
    { id: "cl600g", name: "CL600G", emoji: "⚡", chars: [4, 2, 0, 3], gridX: 3, gridY: 9, gridW: 4, gridH: 4 },
  ],
  2: [],
  3: [],
};

interface MemberSprite { char: Phaser.GameObjects.Sprite; charIdx: number; baseX: number; baseY: number; }
interface TeamGroup {
  container: Phaser.GameObjects.Container; members: MemberSprite[];
  label: Phaser.GameObjects.Text; highlight: Phaser.GameObjects.Rectangle;
  config: TeamConfig; gridX: number; gridY: number; prevGridX: number; prevGridY: number;
}

export default class OfficeScene extends Phaser.Scene {
  private teamGroups: Map<string, TeamGroup> = new Map();
  private workingSet: Set<string> = new Set();
  private onTeamClick?: (id: string) => void;
  private dragTarget: TeamGroup | null = null;
  private dragOffX = 0; private dragOffY = 0;
  private dragStartX = 0; private dragStartY = 0;
  private overlapRect: Phaser.GameObjects.Rectangle | null = null;
  private grid: boolean[][] = [];
  private currentFloor = 1;
  private floorLabel!: Phaser.GameObjects.Text;
  private envGroup!: Phaser.GameObjects.Group;

  constructor() { super({ key: "OfficeScene" }); }

  init(data: { onTeamClick?: (id: string) => void }) {
    this.onTeamClick = data.onTeamClick;
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
    const wh = WALL_H * TILE;

    // 벽 배경
    g.fillStyle(0x1e2d4a, 1);
    g.fillRect(0, 0, WORLD_W, wh);

    // 유리 (하늘)
    const isNight = new Date().getHours() >= 18 || new Date().getHours() < 6;
    const skyTop = isNight ? 0x0a1628 : 0x4a8ac0;
    const skyBot = isNight ? 0x1a2a4a : 0x88c8f0;

    g.fillGradientStyle(skyTop, skyTop, skyBot, skyBot);
    g.fillRect(4, 4, WORLD_W - 8, wh - 8);

    // 창틀 세로선
    for (let x = 0; x < WORLD_W; x += 120) {
      g.fillStyle(0x4a5a70, 1);
      g.fillRect(x, 0, 3, wh);
    }
    // 창틀 가로선
    g.fillStyle(0x4a5a70, 1);
    g.fillRect(0, wh - 2, WORLD_W, 2);
    g.fillRect(0, 0, WORLD_W, 2);

    if (isNight) {
      // 별
      for (let i = 0; i < 30; i++) {
        g.fillStyle(0xffffcc, 0.3 + Math.random() * 0.5);
        g.fillRect(Math.random() * WORLD_W, 6 + Math.random() * (wh / 2), 2, 2);
      }
      // 달
      g.fillStyle(0xffffdd, 0.8);
      g.fillCircle(WORLD_W - 80, 20, 10);
    } else {
      // 구름
      [100, 350, 600].forEach(cx => {
        g.fillStyle(0xffffff, 0.3);
        g.fillRoundedRect(cx, 10, 40, 12, 6);
        g.fillRoundedRect(cx + 10, 6, 30, 10, 5);
      });
    }

    // 빌딩 실루엣
    const bColor = isNight ? 0x0f1a2a : 0x6a8aaa;
    for (let bx = 0; bx < WORLD_W; bx += Phaser.Math.Between(15, 25)) {
      const bh = Phaser.Math.Between(10, wh - 10);
      g.fillStyle(bColor, isNight ? 1 : 0.3);
      g.fillRect(bx, wh - bh, Phaser.Math.Between(10, 20), bh);
      // 창불
      if (isNight && Math.random() > 0.5) {
        g.fillStyle(0xf5c842, 0.5);
        g.fillRect(bx + 3, wh - bh + 5, 2, 2);
      }
    }

    this.envGroup.add(g);
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
      fontSize: "10px", fontFamily: "'Pretendard Variable',Pretendard,sans-serif",
      color: "#60d090", resolution: window.devicePixelRatio * 2 || 4,
    }).setOrigin(0.5);
    this.envGroup.add(srLabel);

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
      fontSize: "6px", fontFamily: "'Pretendard Variable',sans-serif",
      color: "#ffffff", resolution: window.devicePixelRatio * 2 || 4,
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
    // 상단 표시등
    g.fillStyle(0x40d080, 0.8);
    g.fillCircle(ex, ey - eh / 2 - 3, 3);
    // 프레임
    g.lineStyle(2, 0x444454, 1);
    g.strokeRect(ex - ew / 2, ey - eh / 2, ew, eh);

    // 층 표시
    this.floorLabel = this.add.text(ex, ey - eh / 2 - 10, `${this.currentFloor}F`, {
      fontSize: "12px", fontFamily: "'Pretendard Variable',Pretendard,-apple-system,sans-serif",
      color: "#40d080", resolution: window.devicePixelRatio * 2 || 4,
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

    t.chars.forEach((charIdx, i) => {
      if (i >= 4) return;
      const isTop = i < 2;
      const col = i % 2;
      const dx = (col === 0 ? -gapX / 2 : gapX / 2);

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
      fontSize: "12px", fontFamily: "Pretendard Variable, Pretendard, -apple-system, sans-serif",
      color: "#222222", resolution: 6,
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
      this.onTeamClick?.(t.config.id);
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
    tg.members.forEach(m => m.char.play(working ? `char_${m.charIdx}_type` : `char_${m.charIdx}_idle`));
  }

  update() { }
}
