"use client";

import { useEffect, useRef, useState } from "react";
import { useWeatherStore } from "@/components/Weather";
import { useAgentStore, type Agent } from "@/stores/agentStore";
import { useHandoffStore, type WalkEvent } from "@/stores/handoffStore";
import { useLayoutStore, type PlacedFurniture } from "@/stores/layoutStore";
import { getFurnitureDef, TM_FURNITURE_SHEET } from "@/game/tm-furniture-catalog";
import { useChatStore } from "@/stores/chatStore";
import {
  buildBlockedCells, buildSeatCells, nearestFree,
  isManagerAgent, findManagerAgent, pickSpriteKey, pickFloorTile,
  MANAGER_FALLBACK, WALK_SPEED, CHAR_COUNT, NPC_COUNT, FLOOR_TILE_COUNT,
  WINDOW_ZONE_HEIGHT, DEFAULT_FLOOR_TILE_KEY,
} from "@/lib/office-helpers";

interface Props {
  floor: number;
  agentCount: number;
}



/**
 * Phaser 오피스 씬 — 픽셀 스프라이트 기반.
 *  - 바닥: floor_0~8.png 16x16 타일 반복
 *  - 캐릭터: char_*.png (128x192, 32x48 프레임, RPG Maker 스타일)
 *    · 4행: [down, left, right, up], 각 행 4 프레임
 *    · 이동 시 walk 애니 재생, 정지 시 idle 프레임
 *  - 관리자 데스크: CPO 에이전트 위치 자동 추적
 *  - 날씨/시간 → 상단 하늘 그라디언트
 */
export default function HubOffice({ floor, agentCount }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<unknown>(null);
  const sceneRef = useRef<unknown>(null);
  const skyTop = useWeatherStore((s) => s.skyTop);
  const skyBottom = useWeatherStore((s) => s.skyBottom);
  const tod = useWeatherStore((s) => s.tod);
  const label = useWeatherStore((s) => s.label);
  const agents = useAgentStore((s) => s.agents);
  const updateAgent = useAgentStore((s) => s.updateAgent);
  const activeWalk = useHandoffStore((s) => s.activeWalk);
  const clearWalk = useHandoffStore((s) => s.clearWalk);
  // ⚠️ 빈 배열 fallback은 매 렌더 새 참조 → 무한 루프. floors 전체 구독 후 파생.
  const floors = useLayoutStore((s) => s.floors);
  const editMode = useLayoutStore((s) => s.editMode);
  const layoutPlace = useLayoutStore((s) => s.place);
  const layoutSelect = useLayoutStore((s) => s.selectInstance);
  const selectedInstanceId = useLayoutStore((s) => s.selectedInstanceId);
  const placedFurniture = floors[floor];
  const streamingByTeam = useChatStore((s) => s.streamingByTeam);
  const layoutMove = useLayoutStore((s) => s.move);
  const layoutRemove = useLayoutStore((s) => s.remove);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    let destroyed = false;
    (async () => {
      const Phaser = (await import("phaser")).default;

      class OfficeScene extends Phaser.Scene {
        skyGraphics!: Phaser.GameObjects.Graphics;
        skylineG!: Phaser.GameObjects.Graphics;
        weatherLayer!: Phaser.GameObjects.Container;
        precipEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
        floorLayer!: Phaser.GameObjects.TileSprite;
        furnitureItems: Phaser.GameObjects.GameObject[] = [];
        previewG?: Phaser.GameObjects.Graphics;
        zoneLineG?: Phaser.GameObjects.Graphics;
        agentGroup!: Phaser.GameObjects.Container[];
        headerText!: Phaser.GameObjects.Text;
        managerDeskG!: Phaser.GameObjects.Graphics;
        managerDeskLabel!: Phaser.GameObjects.Text;
        floorRef = floor;
        agents: Agent[] = [];
        placedFurn: PlacedFurniture[] = [];
        editModeRef = false;
        selectedFurnId: string | null = null;
        streamingMap: Record<string, boolean> = {};
        lastBubbleByTeam: Record<string, string> = {};
        bubbleClearTimers: Record<string, ReturnType<typeof setTimeout>> = {};
        bubbleHardLimitTimers: Record<string, ReturnType<typeof setTimeout>> = {};
        wanderTimer?: Phaser.Time.TimerEvent;
        activeTweens = new Map<string, Phaser.Tweens.Tween>();
        walkingAgents = new Set<string>();
        loadedSprites = new Set<string>();

        constructor() { super("office"); }

        preload() {
          // 로딩 안정화 — 동시 다운로드 8개로 제한 (기본 32 → 모바일/느린 네트워크 connection pool 경합 방지)
          this.load.maxParallelDownloads = 8;
          // 바닥 타일
          for (let i = 0; i < FLOOR_TILE_COUNT; i++) {
            this.load.image(`floor_${i}`, `/assets/floors/floor_${i}.png`);
          }
          // 빌딩 배경 (창가 풍경)
          this.load.image("bldg_hq", "/assets/buildings/hq.png");
          this.load.image("bldg_blue", "/assets/buildings/house_blue.png");
          this.load.image("bldg_red", "/assets/buildings/house_red.png");
          this.load.image("bldg_yellow", "/assets/buildings/house_yellow.png");
          this.load.image("bldg_purple", "/assets/buildings/house_purple.png");
          this.load.image("bldg_mart", "/assets/buildings/house_mart.png");
          this.load.image("park_tree", "/assets/buildings/park_tree.png");
          // 캐릭터 스프라이트 (모두 로드 — 일부만 로드 시 missing texture 로 에이전트 안 보임)
          this.load.spritesheet("char_cpo", "/assets/chars/char_cpo.png", {
            frameWidth: 32, frameHeight: 48,
          });
          for (let i = 0; i < CHAR_COUNT; i++) {
            this.load.spritesheet(`char_${i}`, `/assets/chars/char_${i}.png`, {
              frameWidth: 32, frameHeight: 48,
            });
          }
          // NPC 스프라이트 (28개 — 작아서 모두 로드)
          for (let i = 1; i <= NPC_COUNT; i++) {
            const num = String(i).padStart(2, "0");
            this.load.spritesheet(`npc_${num}`, `/assets/npcs/npc_${num}.png`, {
              frameWidth: 32, frameHeight: 48,
            });
          }
          // (포켓몬 마스코트 제거됨 — 크기 불일치 렌더 이슈)
          // TM 가구 스프라이트시트 (512x1696)
          this.load.image("tm_furniture_sheet", TM_FURNITURE_SHEET);
          this.load.image("tm_room_builder_sheet", "/assets/teammaker/tiles/office/Room_Builder_Office_32x32.png");
          // 단일 PNG 바닥 타일 — 각 파일을 별도 텍스처로 로드 (화이트/베이지 등)
          for (let i = 0; i < FLOOR_TILE_COUNT; i++) {
            this.load.image(`simple_floor_${i}`, `/assets/floors/floor_${i}.png`);
          }
          // 구 두근컴퍼니 1번째 바닥 (Room_Builder 시트 320,192 영역) 런타임 추출
          this.load.once("filecomplete-image-tm_room_builder_sheet", () => {
            if (this.textures.exists(DEFAULT_FLOOR_TILE_KEY)) return;
            try {
              const srcImg = this.textures.get("tm_room_builder_sheet").getSourceImage() as HTMLImageElement;
              const canvas = document.createElement("canvas");
              canvas.width = 32; canvas.height = 32;
              const ctx = canvas.getContext("2d");
              if (!ctx) return;
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(srcImg, 320, 192, 32, 32, 0, 0, 32, 32);
              this.textures.addImage(DEFAULT_FLOOR_TILE_KEY, canvas as unknown as HTMLImageElement);
              if (this.floorLayer) this.floorLayer.setTexture(DEFAULT_FLOOR_TILE_KEY);
            } catch (e) {
              console.warn("[HubOffice] default floor extract failed", e);
            }
          });
          this.load.on("loaderror", (file: Phaser.Loader.File) => {
            console.warn("[HubOffice] load failed:", file.key, file.src);
          });
          // 로딩 진행률 → window 이벤트로 React 측에 전달 (UX: 로딩 바 표시)
          this.load.on("progress", (value: number) => {
            try {
              window.dispatchEvent(new CustomEvent("hq:phaser-progress", { detail: { value } }));
            } catch { /* ignore */ }
          });
          this.load.on("complete", () => {
            try {
              window.dispatchEvent(new CustomEvent("hq:phaser-progress", { detail: { value: 1, done: true } }));
            } catch { /* ignore */ }
          });
        }

        create() {
          // 바닥 타일 (반복) — 창가 영역 아래부터만 렌더. 추출 완료 전이면 임시로 simple_floor_7 사용
          const initialKey = this.textures.exists(DEFAULT_FLOOR_TILE_KEY) ? DEFAULT_FLOOR_TILE_KEY : "simple_floor_7";
          this.floorLayer = this.add.tileSprite(
            0, WINDOW_ZONE_HEIGHT,
            this.scale.width, this.scale.height - WINDOW_ZONE_HEIGHT,
            initialKey
          )
            .setOrigin(0, 0)
            .setDepth(-20000);

          // 창가 경계선 — 편집 모드 오버레이가 시각화하므로 여기선 최소한만

          // 가구 — scene root 에 직접 추가 (개별 depth 가 캐릭과 비교되어야 함)
          this.furnitureItems = [];
          this.renderFurniture();

          // 하늘 (상단 통창) — 바닥 위, 가구 아래
          this.skyGraphics = this.add.graphics().setDepth(-15000);
          this.weatherLayer = this.add.container(0, 0).setDepth(-14700);
          this.redrawSky();
          this.redrawWeather();

          // 스카이라인 — 벡터 건물 실루엣 (창가 하단부). 밤/낮 톤 자동
          this.skylineG = this.add.graphics().setDepth(-14500);
          this.redrawSkyline();

          // 관리자 데스크 마커 — 캐릭터 아래 (depth 2500 — furniture 와 agent 사이)
          this.managerDeskG = this.add.graphics().setDepth(2500);
          this.managerDeskLabel = this.add.text(0, 0, "", {
            fontSize: "12px", color: "#93c5fd",
            fontFamily: "Pretendard Variable, system-ui, sans-serif", resolution: 8,
            fontStyle: "bold",
          }).setOrigin(0.5).setDepth(2501);

          // 헤더 텍스트 완전 제거 (날씨/인원은 사이드바/상단에 이미 있음)
          this.headerText = this.add.text(0, 0, "", {
            fontSize: "1px", color: "#00000000",
          }).setOrigin(0.5).setVisible(false);

          // 애니메이션 정의 — 스프라이트시트가 로드된 것만 (에셋 없으면 스킵)
          this.ensureAnims("char_cpo");
          for (let i = 0; i < CHAR_COUNT; i++) this.ensureAnims(`char_${i}`);
          // NPC 애니메이션 (npc_01 ~ npc_NN)
          for (let i = 1; i <= NPC_COUNT; i++) {
            this.ensureAnims(`npc_${String(i).padStart(2, "0")}`);
          }

          this.agentGroup = [];
          this.renderAgents();
          this.redrawManagerDesk();

          // 창가 경계선 (편집 모드 ON 일 때만 표시) — Phaser 게임 좌표로 정확히 그림
          this.zoneLineG = this.add.graphics().setDepth(49000);
          this.redrawZoneLine();

          // 배치 미리보기 (placingDefId 있을 때 드로우) — Phaser 게임 좌표
          this.previewG = this.add.graphics().setDepth(49500);

          // 랜덤 자유 이동 — 25~35초 간격, 한 명씩 (외출→대기→복귀)
          this.wanderTimer = this.time.addEvent({
            delay: 25000 + Math.random() * 10000,
            loop: true,
            callback: () => this.wanderOne(),
          });
          // 기존 에이전트들 중 창가에 저장된 위치가 있으면 내려줌
          this.normalizeAgentPositions();

          // 드래그드롭 — 그리드 스냅 32px
          this.input.on("dragstart", (_: unknown, obj: Phaser.GameObjects.GameObject) => {
            const c = obj as Phaser.GameObjects.Container & { setAlpha?: (v: number) => void };
            c.setAlpha?.(0.7);
          });
          this.input.on("drag", (_: unknown, obj: Phaser.GameObjects.GameObject, dx: number, dy: number) => {
            const c = obj as Phaser.GameObjects.Container & { x: number; y: number; setPosition: (x: number, y: number) => void };
            c.setPosition(dx, dy);
          });
          this.input.on("dragend", (_: unknown, obj: Phaser.GameObjects.GameObject) => {
            const c = obj as Phaser.GameObjects.Container & { x: number; y: number; setAlpha?: (v: number) => void; setPosition: (x: number, y: number) => void; getData: (k: string) => unknown };
            c.setAlpha?.(1);
            const agentId = c.getData("agentId") as string | undefined;
            const instanceId = c.getData("instanceId") as string | undefined;
            if (agentId) {
              // 에이전트 이동 — 가구 차단 셀 회피 (nearest walkable). 의자/쇼파 위는 앉기 허용
              const blocked = buildBlockedCells(this.placedFurn);
              const seatCells = buildSeatCells(this.placedFurn);
              const rawCol = Math.round(c.x / 32);
              const rawRow = Math.max(Math.ceil(WINDOW_ZONE_HEIGHT / 32), Math.round(c.y / 32));
              const free = nearestFree(rawCol, rawRow, blocked, Math.floor(800 / 32), seatCells);
              const sx = free.col * 32;
              const sy = free.row * 32;

              // 충돌 검사 — 다른 에이전트 자리에 떨어졌으면 자기 home 으로 walk back
              // (먼저 자리 잡고 있던 에이전트는 그대로, 드래그한 자만 원위치)
              const MIN_AGENT_DIST = 56;
              const collision = this.agentGroup.some((other) => {
                if (other === c) return false;
                const otherId = other.getData("agentId") as string | undefined;
                if (!otherId || otherId === agentId) return false;
                return Math.abs(other.x - sx) < MIN_AGENT_DIST && Math.abs(other.y - sy) < MIN_AGENT_DIST;
              });

              if (collision) {
                const home = c.getData("homePos") as { x: number; y: number } | undefined;
                if (home) {
                  // 자기 home 으로 부드럽게 walk back
                  const sprite = c.getData("sprite") as Phaser.GameObjects.Sprite | undefined;
                  const spriteKey = c.getData("spriteKey") as string | undefined;
                  if (sprite && spriteKey) {
                    const dxw = home.x - c.x;
                    const dyw = home.y - c.y;
                    const animKey = Math.abs(dxw) > Math.abs(dyw)
                      ? (dxw > 0 ? `${spriteKey}_walk_right` : `${spriteKey}_walk_left`)
                      : (dyw > 0 ? `${spriteKey}_walk_down` : `${spriteKey}_walk_up`);
                    if (this.anims.exists(animKey)) sprite.play(animKey, true);
                  }
                  const dist = Math.hypot(home.x - c.x, home.y - c.y);
                  const duration = Math.max(300, Math.min(1500, (dist / WALK_SPEED) * 1000));
                  this.tweens.add({
                    targets: c,
                    x: home.x,
                    y: home.y,
                    duration,
                    ease: "Sine.easeOut",
                    onUpdate: () => {
                      const gy = Math.floor(c.y / 32);
                      c.setDepth(3000 + (gy + 1) * 100 - 1);
                    },
                    onComplete: () => {
                      if (sprite) sprite.stop();
                    },
                  });
                } else {
                  c.setPosition(c.x, c.y);
                }
                // store update 안 함 — 자기 원위치 유지
                return;
              }

              c.setPosition(sx, sy);
              if (!this.walkingAgents.has(agentId)) {
                updateAgent(agentId, { position: { x: sx, y: sy }, floor: this.floorRef });
              }
            } else if (instanceId) {
              // 가구 이동 — hit 렉은 그리드 좌표로 col, row 업데이트
              const col = Math.max(0, Math.round(c.x / 32));
              const row = Math.max(0, Math.round(c.y / 32));
              layoutMove(this.floorRef, instanceId, col, row);
            }
          });
        }

        ensureAnims(key: string) {
          if (!this.textures.exists(key)) return;
          if (this.loadedSprites.has(key)) return;
          this.loadedSprites.add(key);
          // 128x192 RPG Maker — 4 dirs × 4 frames
          const defs: Array<[string, number[]]> = [
            [`${key}_walk_down`, [0, 1, 2, 3]],
            [`${key}_walk_left`, [4, 5, 6, 7]],
            [`${key}_walk_right`, [8, 9, 10, 11]],
            [`${key}_walk_up`, [12, 13, 14, 15]],
          ];
          defs.forEach(([name, frames]) => {
            if (this.anims.exists(name)) return;
            this.anims.create({
              key: name,
              frames: this.anims.generateFrameNumbers(key, { frames }),
              frameRate: 6,
              repeat: -1,
            });
          });
        }

        getManagerPos(): { x: number; y: number; isCpo: boolean } {
          // CPO 자리 — 현재 층에 CPO 있으면 그 위치, 없으면 fallback
          const mgr = this.agents.find((a) => (a.floor ?? 1) === this.floorRef && isManagerAgent(a));
          if (mgr?.position) return { x: mgr.position.x, y: mgr.position.y + 40, isCpo: true };
          if (mgr) return { x: 640, y: 420, isCpo: true };
          return { ...MANAGER_FALLBACK, isCpo: false };
        }

        /** 가구/창가 회피하며 외출 후 홈 복귀 */
        wanderOne() {
          if (this.editModeRef) return;
          if (!this.agentGroup || this.agentGroup.length === 0) return;
          const candidates = this.agentGroup.filter((c) => {
            const aid = c.getData("agentId") as string;
            if (!aid) return false;
            if (this.walkingAgents.has(aid)) return false;
            if (this.streamingMap[aid]) return false;
            return true;
          });
          if (candidates.length === 0) return;
          const pick = candidates[Math.floor(Math.random() * candidates.length)];
          const home = pick.getData("homePos") as { x: number; y: number } | undefined;
          const base = home ?? { x: pick.x, y: pick.y };

          const blocked = buildBlockedCells(this.placedFurn);
          const maxRow = Math.floor(800 / 32); // 25

          // 외출 타겟 — 홈 ±3칸 내 랜덤
          const dc = (Math.floor(Math.random() * 7) - 3);
          const dr = (Math.floor(Math.random() * 5) - 2);
          const rawCol = Math.floor(base.x / 32) + dc;
          const rawRow = Math.floor(base.y / 32) + dr;
          const outPos = nearestFree(rawCol, rawRow, blocked, maxRow);
          const homePos = nearestFree(Math.floor(base.x / 32), Math.floor(base.y / 32), blocked, maxRow);

          const tx = outPos.col * 32;
          const ty = outPos.row * 32;
          const hx = homePos.col * 32;
          const hy = homePos.row * 32;
          if (Math.hypot(tx - pick.x, ty - pick.y) < 16) return;

          const agentId = pick.getData("agentId") as string;
          this.walkingAgents.add(agentId);
          const sprite = pick.getData("sprite") as Phaser.GameObjects.Sprite | undefined;
          const spriteKey = pick.getData("spriteKey") as string | undefined;

          const playWalk = (toX: number, toY: number) => {
            if (!sprite || !spriteKey) return;
            const animKey = Math.abs(toX - pick.x) > Math.abs(toY - pick.y)
              ? (toX > pick.x ? `${spriteKey}_walk_right` : `${spriteKey}_walk_left`)
              : (toY > pick.y ? `${spriteKey}_walk_down` : `${spriteKey}_walk_up`);
            if (this.anims.exists(animKey)) sprite.play(animKey, true);
          };

          // Phase 1: 외출
          playWalk(tx, ty);
          const d1 = Math.hypot(tx - pick.x, ty - pick.y);
          this.tweens.add({
            targets: pick, x: tx, y: ty,
            duration: Math.max(400, Math.min(2500, (d1 / WALK_SPEED) * 1000)),
            ease: "Linear",
            onUpdate: () => {
              const gy = Math.floor(pick.y / 32);
              pick.setDepth(3000 + (gy + 1) * 100 - 1);
            },
            onComplete: () => {
              if (sprite) sprite.stop();
              // Phase 2: 2~3초 대기 후 홈 복귀
              this.time.delayedCall(2000 + Math.random() * 2000, () => {
                playWalk(hx, hy);
                const d2 = Math.hypot(hx - pick.x, hy - pick.y);
                this.tweens.add({
                  targets: pick, x: hx, y: hy,
                  duration: Math.max(400, Math.min(2500, (d2 / WALK_SPEED) * 1000)),
                  ease: "Linear",
                  onUpdate: () => {
                    const gy = Math.floor(pick.y / 32);
                    pick.setDepth(3000 + (gy + 1) * 100 - 1);
                  },
                  onComplete: () => {
                    this.walkingAgents.delete(agentId);
                    if (sprite) sprite.stop();
                  },
                });
              });
            },
          });
        }

        /** 잘못 저장된 포지션 보정 — 창가(y<WINDOW_ZONE_HEIGHT) 에 있으면 바로 아래로 */
        normalizeAgentPositions() {
          for (const a of this.agents) {
            if (a.position && a.position.y < WINDOW_ZONE_HEIGHT) {
              updateAgent(a.id, { position: { x: a.position.x, y: WINDOW_ZONE_HEIGHT } });
            }
          }
        }

        redrawManagerDesk() {
          // 시각적으로 보이지 않게 — 위치만 walk 애니의 목적지로 사용.
          if (!this.managerDeskG || !this.managerDeskLabel) return;
          this.managerDeskG.clear();
          this.managerDeskLabel.setText("");
        }

        setAgents(list: Agent[], f: number, streaming: Record<string, boolean>) {
          const floorChanged = this.floorRef !== f;
          this.agents = list;
          this.floorRef = f;
          this.streamingMap = streaming;
          if (floorChanged && this.floorLayer) {
            this.floorLayer.setTexture(pickFloorTile(f));
          }
          this.renderAgents();
          this.updateHeader();
          this.redrawManagerDesk();
          if (floorChanged) this.renderFurniture();
        }

        setFurniture(items: PlacedFurniture[], editing: boolean, selectedId: string | null) {
          this.placedFurn = items;
          this.editModeRef = editing;
          this.selectedFurnId = selectedId;
          this.renderFurniture();
        }

        /** 에이전트 머리 위 말풍선 텍스트 설정 (실제 채팅 내용 표시) */
        setBubbleText(teamId: string, text: string | null, autoHideMs: number = 0) {
          // 기존 소프트 자동 숨김 타이머 취소
          const prev = this.bubbleClearTimers[teamId];
          if (prev) { clearTimeout(prev); delete this.bubbleClearTimers[teamId]; }

          if (!text) {
            delete this.lastBubbleByTeam[teamId];
            // 하드 리밋 타이머도 정리
            const hp = this.bubbleHardLimitTimers[teamId];
            if (hp) { clearTimeout(hp); delete this.bubbleHardLimitTimers[teamId]; }
            this.renderAgents();
            return;
          }
          const trimmed = text.trim();
          if (!trimmed) return;

          // 소프트 자동 숨김 (응답 완료 후 6초)
          if (autoHideMs > 0) {
            this.bubbleClearTimers[teamId] = setTimeout(() => {
              delete this.lastBubbleByTeam[teamId];
              delete this.bubbleClearTimers[teamId];
              // 하드 리밋도 같이 정리 (이미 사라졌으니)
              const hp2 = this.bubbleHardLimitTimers[teamId];
              if (hp2) { clearTimeout(hp2); delete this.bubbleHardLimitTimers[teamId]; }
              this.renderAgents();
            }, autoHideMs);
          }

          // 🔒 하드 리밋 — 어떤 상태(스트리밍 멈춤/이벤트 누락 등)든 무조건 20초 후 사라짐
          //   매 setBubbleText 호출마다 리셋 (스트리밍 중엔 갱신되며 연장, 멈추면 마지막 호출 +20초)
          const hardPrev = this.bubbleHardLimitTimers[teamId];
          if (hardPrev) clearTimeout(hardPrev);
          this.bubbleHardLimitTimers[teamId] = setTimeout(() => {
            delete this.lastBubbleByTeam[teamId];
            delete this.bubbleHardLimitTimers[teamId];
            const sp = this.bubbleClearTimers[teamId];
            if (sp) { clearTimeout(sp); delete this.bubbleClearTimers[teamId]; }
            this.renderAgents();
          }, 20_000);

          const prevText = this.lastBubbleByTeam[teamId];
          if (prevText === trimmed) return; // 텍스트만 동일하면 re-render 스킵 (타이머는 위에서 이미 갱신됨)
          this.lastBubbleByTeam[teamId] = trimmed;
          this.renderAgents();
        }

        renderFurniture() {
          this.furnitureItems.forEach((i) => i.destroy());
          this.furnitureItems = [];

          for (const item of this.placedFurn) {
            const def = getFurnitureDef(item.defId);
            if (!def) continue;
            // sheet key 매핑
            let sheetKey: string;
            if (def.sheetPath === "/assets/teammaker/tiles/office/Room_Builder_Office_32x32.png") {
              sheetKey = "tm_room_builder_sheet";
            } else if (def.sheetPath && def.sheetPath.startsWith("/assets/floors/floor_")) {
              // 단일 PNG 바닥 타일 — 파일명에서 인덱스 추출
              const m = def.sheetPath.match(/floor_(\d+)\.png/);
              sheetKey = m ? `simple_floor_${m[1]}` : "tm_furniture_sheet";
            } else {
              sheetKey = "tm_furniture_sheet";
            }
            if (!this.textures.exists(sheetKey)) continue;

            const cellPx = 32;
            const x = item.col * cellPx;
            const y = item.row * cellPx;

            // 두근컴퍼니 ui/ 와 동일한 Y-sort 트릭 — 단일 sprite 유지하되 앵커를 "top 셀과 bottom 셀 사이"에 두어
            // 상단 1줄만 캐릭을 가리고 나머지는 캐릭이 앞. cell-split 불필요.
            //  · baseZ = 3000 (캐릭 layer)  + rowAnchor = row + min(hc,2) - 0.5
            //  · 의자 "뒤" label 은 예외로 baseZ=3500 (항상 캐릭 가림)
            const lbl2 = (def.label || "").toLowerCase();
            const isChairBack = def.category === "chair" && /뒤|back/.test(lbl2) && !lbl2.includes("구멍");
            const isChairOrSofa = def.category === "chair" || def.category === "seating" || def.isSeat || /쇼파|sofa|bench|소파|좌석/.test(lbl2);
            const isDesk = def.category === "desk";
            const useYSort = !isChairBack && (isChairOrSofa || isDesk);
            const baseZ = useYSort ? 3000 : this.baseZForCategory(def.category, def.label);
            const effectiveH = useYSort ? Math.min(def.heightCells, 2) : def.heightCells;
            const rowAnchor = useYSort ? (item.row + effectiveH - 0.5) : (item.row + def.heightCells);
            const wholeDepth = baseZ + rowAnchor * 100 + item.col * 0.1;

            // 스프라이트시트에서 해당 영역만 뽑아서 보여주기 (mask 방식) — 단일 sprite
            const img = this.add.image(x - def.sprite.x, y - def.sprite.y, sheetKey).setOrigin(0, 0);
            const mask = this.make.graphics({}, false);
            mask.fillStyle(0xffffff);
            mask.fillRect(x, y, def.sprite.w, def.sprite.h);
            img.setMask(mask.createGeometryMask());
            img.setDepth(wholeDepth);
            // 회전/대칭 — 단일 PNG 에셋만 동작
            if (item.rotation || item.flipX) {
              const isSingleSheet = def.sheetPath && def.sheetPath.endsWith(".png") && def.sprite.x === 0 && def.sprite.y === 0;
              if (isSingleSheet) {
                img.clearMask();
                img.setOrigin(0.5, 0.5);
                img.setPosition(x + def.sprite.w / 2, y + def.sprite.h / 2);
                img.setDisplaySize(def.sprite.w, def.sprite.h);
                if (item.rotation) img.setAngle(item.rotation);
                if (item.flipX) img.setFlipX(true);
              }
            }
            this.furnitureItems.push(img);

            // 선택 하이라이트 + 편집 히트 박스 — 전체 footprint 기준 (depth 는 항상 위에)
            const hlDepth = Math.max(wholeDepth, 3500 + (item.row + def.heightCells) * 100 + item.col * 0.1) + 0.5;
            if (this.editModeRef && this.selectedFurnId === item.id) {
              const hl = this.add.graphics();
              hl.lineStyle(2, 0xfbbf24, 1);
              hl.strokeRect(x - 1, y - 1, def.sprite.w + 2, def.sprite.h + 2);
              hl.setDepth(hlDepth);
              this.furnitureItems.push(hl);
            }

            if (this.editModeRef) {
              const hit = this.add.rectangle(x, y, def.sprite.w, def.sprite.h, 0x000000, 0)
                .setOrigin(0, 0)
                .setInteractive({ useHandCursor: true, draggable: true });
              hit.setDepth(hlDepth + 0.2);
              hit.setData("instanceId", item.id);
              hit.setData("defId", item.defId);
              hit.setData("spriteW", def.sprite.w);
              hit.setData("spriteH", def.sprite.h);
              hit.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
                if (ptr.rightButtonDown()) {
                  // 우클릭 = 즉시 삭제
                  layoutRemove(this.floorRef, item.id);
                  return;
                }
                this.selectedFurnId = item.id;
                layoutSelect(item.id);
                this.renderFurniture();
              });
              this.furnitureItems.push(hit);
            }
          }
        }

        /** TM FurnitureLayer 공식 + 어제 수정한 의자 우선순위 적용
         *  · 의자(뒤): 3500 (사람 앞 렌더, 등받이가 캐릭터 가림 — 앉은 느낌)
         *  · 의자(앞/옆): 1000 (책상/가구 위에 렌더, 사람 뒤). "책상 옆 의자"가 desk 에 가려지지 않음
         *  · 쇼파: 800 (책상보다 위, 사람 뒤)
         *  · 일반 책상/가구: 0
         */
        baseZForCategory(cat: string, label: string): number {
          const lbl = label.toLowerCase();
          if (lbl.includes("쇼파") || lbl.includes("sofa")) return 800;
          if (cat === "chair") {
            const isBackView = (lbl.includes("뒤") || lbl.includes("back")) && !lbl.includes("구멍");
            return isBackView ? 3500 : 1000;
          }
          // 키 큰 소품 (스탠드/램프/코트랙) — 최상단
          const isTallStack = /스탠드|stand|lamp|램프|coat rack|coat_rack|rack/.test(lbl);
          if (isTallStack) return 5500;
          // 책상위 소품/가전 — 모니터/프린터/키보드/마우스/노트북/폰/디스펜서/스피커/TV 등
          const isStackableByLabel = /monitor|printer|laptop|phone|dispenser|keyboard|mouse|speaker|tv|screen|모니터|노트북|프린터|키보드|마우스|전화|폰/.test(lbl);
          if (isStackableByLabel) return 5000;
          // appliance/accessory/board 카테고리 전체 — 책상 위에 올라감
          if (cat === "appliance" || cat === "accessory" || cat === "board") return 5000;
          switch (cat) {
            case "floor_tile": return -10000;
            case "floor_decor": return -9000;
            case "wall_tile": return -5000;
            case "wall_decor": return -3000;
            case "divider":
            case "partition": return 10000;
            case "seating": return 800;  // 소파/벤치도 책상 위
            case "plant":
            case "storage":
            case "desk":
            default: return 0;
          }
        }

        updateHeader() {
          if (!this.headerText) return;
          const n = this.agents.filter((a) => (a.floor ?? 1) === this.floorRef).length;
          this.headerText.setText(`🏢 ${this.floorRef}F · ${n}명 · ${tod.toUpperCase()} · ${label}`);
        }

        renderAgents() {
          if (!this.agentGroup) return;
          this.agentGroup.forEach((c) => c.destroy());
          this.agentGroup = [];
          this.activeTweens.forEach((t) => t.stop());
          this.activeTweens.clear();

          // 에이전트는 자기 층에만 노출. CPO 는 floor 값 무시하고 현재층 1F 일 때 무조건 표시
          const floorAgents = this.agents.filter((a) => {
            if (isManagerAgent(a)) return this.floorRef === 1; // CPO 는 무조건 1F
            return (a.floor ?? 1) === this.floorRef;
          });
          const defaultPos = (i: number, a: Agent) => {
            if (isManagerAgent(a)) {
              // CPO 기본 자리 — 오피스 중앙 (창가 아래)
              return { x: 640, y: 400 };
            }
            return {
              x: 160 + (i % 8) * 96,
              y: Math.max(WINDOW_ZONE_HEIGHT + 64, 240 + Math.floor(i / 8) * 128),
            };
          };

          // 앉을 수 있는 셀 — isSeat 또는 label 에 쇼파/sofa/bench 포함
          const seatCells = new Set<string>();
          for (const item of this.placedFurn) {
            const def = getFurnitureDef(item.defId);
            if (!def) continue;
            const lbl = (def.label || "").toLowerCase();
            const isSeatLike = def.isSeat || /쇼파|sofa|bench|소파|좌석/.test(lbl);
            if (!isSeatLike) continue;
            for (let dr = 0; dr < def.heightCells; dr++) {
              for (let dc = 0; dc < def.widthCells; dc++) {
                seatCells.add(`${item.col + dc},${item.row + dr}`);
              }
            }
          }

          // 겹침 방지 — 이미 점유된 위치를 추적해서 새 에이전트는 빈 셀로 spread
          const occupied: Array<{ x: number; y: number }> = [];
          const MIN_DIST = 56; // 캐릭 셀(40px) + 여유(16px)
          const isTooClose = (x: number, y: number) =>
            occupied.some((o) => Math.abs(o.x - x) < MIN_DIST && Math.abs(o.y - y) < MIN_DIST);
          const findFreeSlot = (startX: number, startY: number) => {
            if (!isTooClose(startX, startY)) return { x: startX, y: startY };
            // 그리드 스캔 — 우→하 방향으로 빈 칸 탐색
            const W = this.scale.width;
            const STEP = 64;
            for (let dy = 0; dy < 8; dy++) {
              for (let dx = 0; dx < 18; dx++) {
                const tx = 80 + dx * STEP;
                const ty = WINDOW_ZONE_HEIGHT + 80 + dy * STEP;
                if (tx > W - 80) continue;
                if (!isTooClose(tx, ty)) return { x: tx, y: ty };
              }
            }
            return { x: startX, y: startY };
          };

          // 처리 순서 — 영속된 position 있는 에이전트 먼저, position 없는 신규 에이전트 마지막
          // 이러면 원래 자리 있던 애는 항상 그대로 유지되고, 새로 들어온 애만 spread 됨
          const sortedAgents = [...floorAgents].sort((a, b) => {
            const aHas = !!a.position; const bHas = !!b.position;
            if (aHas && !bHas) return -1;
            if (!aHas && bHas) return 1;
            return 0;
          });
          sortedAgents.forEach((a) => {
            const i = floorAgents.indexOf(a);
            const original = a.position || defaultPos(i, a);
            // CPO = 고정 / 영속된 position 있으면 그대로 유지 (충돌해도 자기 자리)
            // position 없는 신규만 findFreeSlot 으로 spread
            const p = (isManagerAgent(a) || a.position)
              ? original
              : findFreeSlot(original.x, original.y);
            occupied.push(p);
            // 신규 에이전트가 spread 된 경우만 영속화 (기존 영속 position 은 그대로)
            if (!isManagerAgent(a) && !a.position && (p.x !== original.x || p.y !== original.y)) {
              updateAgent(a.id, { position: { x: p.x, y: p.y }, floor: a.floor ?? 1 });
            } else if (!isManagerAgent(a) && !a.position) {
              // 신규 에이전트인데 충돌 없이 defaultPos 로 자리 잡힌 경우도 영속
              updateAgent(a.id, { position: { x: p.x, y: p.y }, floor: a.floor ?? 1 });
            }
            const container = this.add.container(p.x, p.y);
            container.setSize(40, 60);

            // 의자 위 — 크기 그대로 유지 (유저 선호). depth 는 아래 setDepth 에서 처리

            const spriteKey = pickSpriteKey(a);
            // 셀 중앙 정렬 — sprite 를 셀 중앙(16, 32)에 배치
            if (this.textures.exists(spriteKey)) {
              const sprite = this.add.sprite(16, 32, spriteKey, 0);
              sprite.setOrigin(0.5, 1);
              sprite.setScale(1.3);
              container.add(sprite);
              container.setData("sprite", sprite);
              container.setData("spriteKey", spriteKey);
            } else {
              const emoji = this.add.text(16, 24, a.emoji, {
                fontSize: "40px", resolution: 4,
              }).setOrigin(0.5, 1);
              container.add(emoji);
            }

            // 이름 라벨 — 셀 가로 중앙(x=16), 셀 하단(y=32) 아래에 붙음
            const name = this.add.text(24, 40, a.name, {
              fontSize: "13px", color: "#f1f5f9",
              fontFamily: "'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif",
              resolution: 32,
              fontStyle: "bold",
            }).setOrigin(0.5);
            name.setShadow(0, 1, "#000", 3, true, true);
            const nameW = Math.min(name.width + 22, 132);
            const nameBg = this.add.graphics();
            nameBg.fillStyle(0x0b0b14, 0.82);
            nameBg.fillRoundedRect(16 - nameW / 2, 32, nameW, 17, 4);
            container.add(nameBg);
            container.add(name);

            // 상태 점 — 이름 앞에 prefix (셀 중앙 정렬에 맞춤)
            const streaming = !!(this.streamingMap ?? {})[a.id];
            const statusColor = streaming || a.status === "working" ? 0xfbbf24
              : a.status === "error" ? 0xef4444
              : 0x22c55e;
            const dot = this.add.graphics();
            const nameTextWidth = Math.min(name.width + 12, 120);
            const dotX = 16 - nameTextWidth / 2 + 6;
            dot.fillStyle(statusColor, 1);
            dot.fillCircle(dotX, 40, 3.2);
            container.add(dot);

            // 작업 인디케이터 + 실제 채팅 말풍선 (스트리밍 중 OR 마지막 메시지 5초 이내)
            const lastBubbleText = this.lastBubbleByTeam?.[a.id];
            const showBubble = streaming || a.status === "working" || !!lastBubbleText;
            if (showBubble) {
              // 1. 캐릭터 walk_down 애니 + Y 2px 바운스 (작업 중 일 때만)
              if (streaming || a.status === "working") {
                const charSprite = container.getData("sprite") as Phaser.GameObjects.Sprite | undefined;
                if (charSprite && spriteKey) {
                  const animKey = `${spriteKey}_walk_down`;
                  if (this.anims.exists(animKey)) charSprite.play(animKey, true);
                  this.tweens.add({
                    targets: container,
                    y: container.y - 2,
                    duration: 220,
                    yoyo: true,
                    repeat: -1,
                    ease: "Sine.easeInOut",
                  });
                }
              }
              // 2. 머리 위 말풍선 — 실제 채팅 내용 표시 (없으면 "...생각 중")
              const bubbleText = lastBubbleText || (streaming ? "💭 생각 중..." : "⚙️ 작업 중...");
              // 80자 이내로 자르고 줄바꿈 처리
              const trimmed = bubbleText.length > 100 ? bubbleText.slice(0, 100) + "…" : bubbleText;
              const txt = this.add.text(16, -64, trimmed, {
                fontSize: "15px",
                color: lastBubbleText ? "#f1f5f9" : "#fde68a",
                fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                fontStyle: lastBubbleText ? "normal" : "italic",
                resolution: Math.max(2, Math.min(4, (typeof window !== "undefined" ? window.devicePixelRatio : 2) || 2)),
                wordWrap: { width: 280, useAdvancedWrap: true },
                align: "center",
              }).setOrigin(0.5, 1);
              const padW = Math.min(txt.width + 18, 300);
              const padH = txt.height + 12;
              const bx = 16 - padW / 2;
              const by = -64 - padH;
              const bubble = this.add.graphics();
              const fillColor = lastBubbleText ? 0x111827 : 0x1a1a2e;
              const borderColor = lastBubbleText ? 0x60a5fa : 0xfbbf24;
              bubble.fillStyle(fillColor, 0.96);
              bubble.lineStyle(2, borderColor, 1);
              bubble.fillRoundedRect(bx, by, padW, padH, 8);
              bubble.strokeRoundedRect(bx, by, padW, padH, 8);
              // 꼬리 (말풍선 아래 가운데)
              bubble.fillStyle(fillColor, 0.96);
              bubble.fillTriangle(10, -64, 22, -64, 16, -56);
              bubble.lineStyle(2, borderColor, 1);
              bubble.beginPath();
              bubble.moveTo(10, -64);
              bubble.lineTo(16, -56);
              bubble.lineTo(22, -64);
              bubble.strokePath();
              // 말풍선 클릭으로 바로 사라지기
              bubble.setInteractive(new Phaser.Geom.Rectangle(bx, by, padW, padH + 8), Phaser.Geom.Rectangle.Contains);
              bubble.on("pointerdown", () => this.setBubbleText(a.id, null));
              container.add(bubble);
              container.add(txt);
              // 텍스트도 클릭 가능
              txt.setInteractive(new Phaser.Geom.Rectangle(-padW / 2, -padH - 64, padW, padH + 8), Phaser.Geom.Rectangle.Contains);
              txt.on("pointerdown", () => this.setBubbleText(a.id, null));
              // 응답 끝나면 펄스 X (정적 표시), 작업 중이면 펄스
              if (streaming || a.status === "working") {
                this.tweens.add({
                  targets: [txt, bubble],
                  alpha: { from: 0.75, to: 1 },
                  duration: 600,
                  yoyo: true,
                  repeat: -1,
                  ease: "Sine.easeInOut",
                });
              }
            }

            // 히트 영역 — 셀 중앙 기준 (container.x=cell.left, center at +16)
            // CPO 는 char_cpo.png 캔버스 안 sprite 픽셀이 다른 캐릭보다 작아 시각상 작음 →
            // 실제 sprite/drag 크기는 유지하되 hit 영역만 확장 (선택/우클릭 hit 보장)
            const hitRect = isManagerAgent(a)
              ? new Phaser.Geom.Rectangle(-24, -56, 80, 110)
              : new Phaser.Geom.Rectangle(-12, -32, 56, 80);
            container.setInteractive(hitRect, Phaser.Geom.Rectangle.Contains);
            this.input.setDraggable(container);
            container.setData("agentId", a.id);
            container.setData("homePos", { x: p.x, y: p.y });

            // 우클릭 컨텍스트 메뉴 → window 이벤트로 Hub 페이지에 전파
            container.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
              if (!ptr.rightButtonDown()) return;
              const ne = ptr.event as MouseEvent;
              const clientX = typeof ne?.clientX === "number" ? ne.clientX : ptr.x;
              const clientY = typeof ne?.clientY === "number" ? ne.clientY : ptr.y;
              const ev = new CustomEvent("hq:agent-ctx", {
                detail: { agentId: a.id, clientX, clientY },
              });
              window.dispatchEvent(ev);
            });

            // 캐릭 depth — baseZ 3000 고정. 의자/쇼파(1000) 위, 책상 상단(3500)·의자 뒤(3500) 아래.
            const gridY = Math.floor(p.y / 32);
            container.setDepth(3000 + (gridY + 1) * 100 - 1);

            this.agentGroup.push(container);
          });
        }

        walk(event: WalkEvent, onDone: () => void) {
          const target = this.agentGroup.find((c) => (c.getData("agentId") as string) === event.agentId);
          if (!target) { onDone(); return; }
          const home = (target.getData("homePos") as { x: number; y: number }) || { x: target.x, y: target.y };

          let dx: number, dy: number;
          if (event.dest === "manager") {
            const mpos = this.getManagerPos();
            dx = mpos.x; dy = mpos.y;
          } else if (event.dest === "home") {
            dx = home.x; dy = home.y;
          } else {
            dx = event.dest.x; dy = event.dest.y;
          }

          const deltaX = dx - target.x;
          const deltaY = dy - target.y;
          const dist = Math.hypot(deltaX, deltaY);
          const duration = Math.max(300, Math.min(2000, (dist / WALK_SPEED) * 1000));

          // walk 애니 방향 결정
          const sprite = target.getData("sprite") as Phaser.GameObjects.Sprite | undefined;
          const spriteKey = target.getData("spriteKey") as string | undefined;
          let animKey: string | null = null;
          if (sprite && spriteKey) {
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
              animKey = deltaX > 0 ? `${spriteKey}_walk_right` : `${spriteKey}_walk_left`;
            } else {
              animKey = deltaY > 0 ? `${spriteKey}_walk_down` : `${spriteKey}_walk_up`;
            }
            if (this.anims.exists(animKey)) sprite.play(animKey, true);
          }

          this.walkingAgents.add(event.agentId);

          // 이모지 폴백 바운스 (스프라이트 없을 때만)
          const fallbackBody = (!sprite && target.list[0]) as Phaser.GameObjects.Text | undefined;
          const baseBodyY = fallbackBody?.y ?? 0;
          const bounce = fallbackBody ? this.tweens.add({
            targets: fallbackBody,
            y: { from: baseBodyY, to: baseBodyY - 3 },
            duration: 200, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
          }) : null;

          const tween = this.tweens.add({
            targets: target,
            x: dx, y: dy,
            duration,
            ease: "Linear",
            onUpdate: () => {
              // 이동 중 실시간 Y-sort 업데이트
              const gridY = Math.floor(target.y / 32);
              target.setDepth(3000 + (gridY + 1) * 100 - 1);
            },
            onComplete: () => {
              this.walkingAgents.delete(event.agentId);
              bounce?.stop();
              if (fallbackBody) fallbackBody.y = baseBodyY;
              if (sprite) sprite.stop(); // 첫 프레임(idle)으로 돌아감
              this.activeTweens.delete(event.id);
              onDone();
            },
          });
          this.activeTweens.set(event.id, tween);
        }

        redrawZoneLine() {
          if (!this.zoneLineG) return;
          this.zoneLineG.clear();
          if (!this.editModeRef) return;
          // 창가 아래 경계선 — 점선 느낌으로 반복 (게임 좌표 완벽 일치)
          this.zoneLineG.lineStyle(2, 0x38bdf8, 0.7);
          const y = WINDOW_ZONE_HEIGHT;
          const dash = 12, gap = 6;
          for (let x = 0; x < 1280; x += dash + gap) {
            this.zoneLineG.lineBetween(x, y, Math.min(x + dash, 1280), y);
          }
        }

        /** 배치 미리보기 — 실제 배치될 셀에 정확히 스냅 (preview = 실제 배치 위치) */
        drawPreviewAt(px: number, py: number, defId: string | null) {
          if (!this.previewG) return;
          this.previewG.clear();
          if (!defId) return;
          const def = getFurnitureDef(defId);
          if (!def) return;
          // 실제 배치 위치 계산 — placementFromCursor 와 동일 공식
          const anchorCol = Math.max(0, Math.round((px - def.widthCells * 16) / 32));
          const anchorRow = Math.max(0, Math.round((py - def.heightCells * 16) / 32));
          const x = anchorCol * 32;
          const y = anchorRow * 32;
          const invalid = y < WINDOW_ZONE_HEIGHT;
          const color = invalid ? 0xef4444 : 0xfbbf24;
          this.previewG.fillStyle(color, invalid ? 0.22 : 0.32);
          this.previewG.fillRect(x, y, def.sprite.w, def.sprite.h);
          this.previewG.lineStyle(2, color, invalid ? 0.65 : 0.9);
          this.previewG.strokeRect(x, y, def.sprite.w, def.sprite.h);
          // 커서 실제 위치에 얇은 십자 (힌트)
          this.previewG.lineStyle(1, 0xffffff, 0.55);
          this.previewG.lineBetween(px - 5, py, px + 5, py);
          this.previewG.lineBetween(px, py - 5, px, py + 5);
        }

        drawPreview(col: number, row: number, defId: string | null) {
          this.drawPreviewAt(col * 32 + 16, row * 32 + 16, defId);
        }

        setEditMode(on: boolean) {
          this.editModeRef = on;
          this.redrawZoneLine();
          this.renderFurniture();
        }

        /** 스카이라인 — 벡터 건물 실루엣 (시간대 색상 맞춤) */
        redrawSkyline() {
          if (!this.skylineG) return;
          this.skylineG.clear();
          const isNight = tod === "night";
          const isDusk = tod === "dawn" || tod === "sunset";
          const bodyColor = isNight ? 0x0f172a : isDusk ? 0x1e293b : 0x334155;
          const windowColor = isNight ? 0xfde047 : 0x64748b;
          const windowAlpha = isNight ? 0.85 : 0.35;

          // 건물 스펙 — x 시작, 폭, 높이. 바닥 타일과 완벽히 맞닿게 WINDOW_ZONE_HEIGHT 기준
          const baseY = WINDOW_ZONE_HEIGHT;
          const bldgs: Array<[number, number, number]> = [
            [0, 60, 28], [70, 45, 22], [120, 55, 35], [180, 40, 18],
            [225, 65, 40], [295, 50, 26], [350, 70, 32], [425, 55, 24],
            [485, 45, 38], [535, 60, 28], [600, 75, 44], [680, 50, 20],
            [735, 55, 30], [795, 65, 36], [865, 48, 22], [920, 70, 38],
            [995, 55, 26], [1055, 60, 32], [1120, 50, 24], [1175, 80, 42],
          ];
          bldgs.forEach(([x, w, h]) => {
            this.skylineG.fillStyle(bodyColor, 0.92);
            this.skylineG.fillRect(x, baseY - h, w, h);
            // 창문 점들
            this.skylineG.fillStyle(windowColor, windowAlpha);
            for (let wx = x + 4; wx < x + w - 3; wx += 6) {
              for (let wy = baseY - h + 4; wy < baseY - 3; wy += 6) {
                if (Math.random() < 0.45) this.skylineG.fillRect(wx, wy, 2, 2);
              }
            }
          });
        }

        /** 태양/달/구름/비/눈 — 시간대·날씨 코드 따라 달라짐 */
        redrawWeather() {
          if (!this.weatherLayer) return;
          this.weatherLayer.removeAll(true);
          this.precipEmitter?.destroy();
          this.precipEmitter = undefined;
          const t = tod;
          const isNight = t === "night";
          const isDusk = t === "dawn" || t === "sunset";

          // 태양/달
          const lumG = this.add.graphics();
          const lumX = isNight ? 1080 : isDusk ? 900 : 160;
          const lumY = 30;
          const lumR = isNight ? 11 : 13;
          if (isNight) {
            lumG.fillStyle(0xf8fafc, 0.98);
            lumG.fillCircle(lumX, lumY, lumR);
            lumG.fillStyle(0x020617, 0.9);
            lumG.fillCircle(lumX + 4, lumY - 2, 2.5);
            lumG.fillCircle(lumX - 3, lumY + 3, 2);
          } else if (isDusk) {
            lumG.fillStyle(0xfbbf24, 0.35);
            lumG.fillCircle(lumX, lumY, lumR + 5);
            lumG.fillStyle(0xf97316, 0.9);
            lumG.fillCircle(lumX, lumY, lumR);
          } else {
            lumG.fillStyle(0xfef08a, 0.4);
            lumG.fillCircle(lumX, lumY, lumR + 6);
            lumG.fillStyle(0xfde047, 0.98);
            lumG.fillCircle(lumX, lumY, lumR);
          }
          this.weatherLayer.add(lumG);

          // 구름 — 5개, 좌→우 연속 흐름
          const cloudColor = isNight ? 0x64748b : 0xffffff;
          const cloudAlpha = isNight ? 0.55 : 0.85;
          const clouds: Array<{ cx: number; cy: number; w: number; h: number; speed: number }> = [
            { cx: 80, cy: 22, w: 40, h: 10, speed: 60000 },
            { cx: 280, cy: 18, w: 50, h: 12, speed: 75000 },
            { cx: 520, cy: 28, w: 35, h: 9, speed: 55000 },
            { cx: 760, cy: 16, w: 55, h: 13, speed: 80000 },
            { cx: 1000, cy: 30, w: 42, h: 11, speed: 70000 },
          ];
          clouds.forEach((c) => {
            const g = this.add.graphics();
            g.fillStyle(cloudColor, cloudAlpha);
            g.fillEllipse(c.cx, c.cy, c.w, c.h);
            g.fillEllipse(c.cx - c.w * 0.3, c.cy + 2, c.w * 0.7, c.h * 0.8);
            g.fillEllipse(c.cx + c.w * 0.3, c.cy + 2, c.w * 0.7, c.h * 0.8);
            this.weatherLayer.add(g);
            // 좌→우 끝까지 흐른 뒤 다시 왼쪽에서 등장 (loop)
            this.tweens.add({
              targets: g,
              x: { from: -200, to: 1400 },
              duration: c.speed,
              repeat: -1,
              ease: "Linear",
            });
          });

          // 비/눈 파티클 (weatherCode 기반 간소화 — skyGraphics 결과 읽어서가 아닌 label 참조)
          const lbl = (label || "").toLowerCase();
          const isRain = /비|소나기|rain|shower|drizzle/.test(lbl);
          const isSnow = /눈|snow/.test(lbl);
          if (isRain || isSnow) {
            const key = isRain ? "__rain_dot" : "__snow_dot";
            if (!this.textures.exists(key)) {
              const g = this.make.graphics({}, false);
              if (isRain) {
                g.fillStyle(0x60a5fa, 0.8);
                g.fillRect(0, 0, 1, 6);
              } else {
                g.fillStyle(0xffffff, 0.95);
                g.fillCircle(2, 2, 2);
              }
              g.generateTexture(key, isRain ? 1 : 4, isRain ? 6 : 4);
              g.destroy();
            }
            this.precipEmitter = this.add.particles(0, 0, key, {
              x: { min: 0, max: 1280 },
              y: -10,
              speedY: isRain ? { min: 500, max: 700 } : { min: 60, max: 120 },
              speedX: isRain ? 0 : { min: -30, max: 30 },
              lifespan: isRain ? 1200 : 4000,
              quantity: isRain ? 6 : 2,
              frequency: 60,
              alpha: { start: 0.85, end: 0 },
            }).setDepth(-14600);
          }
        }

        redrawSky() {
          const { width } = this.scale;
          const top = parseInt(skyTop.slice(1), 16);
          const bot = parseInt(skyBottom.slice(1), 16);
          this.skyGraphics.clear();
          const H = WINDOW_ZONE_HEIGHT;
          for (let i = 0; i < H; i++) {
            const t = i / H;
            const r = Math.round(((top >> 16) & 255) * (1 - t) + ((bot >> 16) & 255) * t);
            const gn = Math.round(((top >> 8) & 255) * (1 - t) + ((bot >> 8) & 255) * t);
            const b = Math.round((top & 255) * (1 - t) + (bot & 255) * t);
            this.skyGraphics.fillStyle((r << 16) | (gn << 8) | b, 1);
            this.skyGraphics.fillRect(0, i, width, 1);
          }
        }
      }

      if (destroyed || !containerRef.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const game = new Phaser.Game({
        type: Phaser.AUTO, parent: containerRef.current,
        width: 1280, height: 800,
        backgroundColor: "#06060e",
        pixelArt: true, antialias: false,
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          zoom: dpr,
        },
        scene: [OfficeScene],
      });
      gameRef.current = game;
      game.events.once("ready", () => {
        sceneRef.current = game.scene.getScene("office");
        // 최초 agents/floor/furniture 강제 주입 (props 는 바뀌지 않아 useEffect 가 안 돌 수 있음)
        const s = sceneRef.current as {
          setAgents?: (list: Agent[], f: number, streaming: Record<string, boolean>) => void;
          setFurniture?: (items: PlacedFurniture[], editing: boolean, selectedId: string | null) => void;
        } | null;
        s?.setAgents?.(
          useAgentStore.getState().agents,
          floor,
          useChatStore.getState().streamingByTeam,
        );
        const layoutFloors = useLayoutStore.getState().floors;
        s?.setFurniture?.(layoutFloors[floor] ?? [], useLayoutStore.getState().editMode, useLayoutStore.getState().selectedInstanceId);
      });
      // 우클릭 시 브라우저/맥 기본 메뉴 차단 — Phaser 캔버스에 직접 바인딩
      const canvas = game.canvas as HTMLCanvasElement | null;
      if (canvas) {
        canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      }
    })();
    return () => {
      destroyed = true;
      const g = gameRef.current as { destroy?: (b: boolean) => void } | null;
      g?.destroy?.(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  // 🛡 spriteKey 마이그레이션 — 마운트 1회만 (이후 useEffect 재실행 방지)
  const migrationDoneRef = useRef(false);
  useEffect(() => {
    if (migrationDoneRef.current) return;
    if (agents.length === 0) return; // 아직 로드 전
    migrationDoneRef.current = true;
    for (const a of agents) {
      let newKey: string | undefined = a.spriteKey;
      let needsUpdate = false;
      if (newKey && newKey.startsWith("char_") && newKey !== "char_cpo") {
        const idx = parseInt(newKey.slice(5), 10);
        if (Number.isNaN(idx) || idx >= CHAR_COUNT) {
          newKey = undefined;
          needsUpdate = true;
        }
      }
      if (!newKey) {
        newKey = pickSpriteKey({ ...a, spriteKey: undefined });
        needsUpdate = true;
      }
      if (needsUpdate) updateAgent(a.id, { spriteKey: newKey });
    }
  }, [agents, updateAgent]);

  // 일반 setAgents — 무한 루프 방지 위해 분리
  useEffect(() => {
    const s = sceneRef.current as {
      setAgents?: (list: Agent[], f: number, streaming: Record<string, boolean>) => void;
    } | null;
    s?.setAgents?.(agents, floor, streamingByTeam);
  }, [agents, floor, streamingByTeam]);

  // 채팅 메시지 → 씬 말풍선
  // 규칙:
  //   1) 마지막 이전 메시지는 항상 seen 동기화 → history_sync 복원분 자동 차단
  //   2) 마지막 메시지도 30초 이상 지났으면 seen → 직전 대화 재표시 차단
  //   3) 스트리밍 중이거나 30초 이내 완료된 메시지만 말풍선 표시
  const messagesByTeam = useChatStore((s) => s.messagesByTeam);
  const teamSeenIdsRef = useRef<Record<string, Set<string>>>({});
  useEffect(() => {
    const s = sceneRef.current as {
      setBubbleText?: (teamId: string, text: string | null, autoHideMs?: number) => void;
    } | null;
    if (!s?.setBubbleText) return;

    for (const [teamId, msgs] of Object.entries(messagesByTeam)) {
      if (!msgs || msgs.length === 0) continue;
      const last = msgs[msgs.length - 1];
      if (last.role !== "agent" || !last.content?.trim()) continue;

      let seenSet = teamSeenIdsRef.current[teamId];
      if (!seenSet) {
        seenSet = new Set<string>();
        teamSeenIdsRef.current[teamId] = seenSet;
      }

      // 마지막 제외한 모든 메시지 seen 동기화 (history_sync 재교체 대응)
      for (const m of msgs.slice(0, -1)) seenSet.add(m.id);

      const isStreaming = !!last.streaming;
      const alreadySeen = seenSet.has(last.id);

      if (alreadySeen && !isStreaming) continue;

      // 30초 이상 전에 완료된 메시지 → 이전 대화 → 말풍선 표시 안 함
      if (!isStreaming && (Date.now() - last.ts) > 30_000) {
        seenSet.add(last.id);
        continue;
      }

      if (!alreadySeen) {
        s.setBubbleText(teamId, last.content, isStreaming ? 0 : 6000);
        if (!isStreaming) seenSet.add(last.id);
      } else {
        // 같은 id, 스트리밍 중 — 내용 갱신
        s.setBubbleText(teamId, last.content, 0);
        if (!isStreaming) seenSet.add(last.id);
      }
    }
  }, [messagesByTeam]);

  useEffect(() => {
    const s = sceneRef.current as {
      redrawSky?: () => void;
      redrawWeather?: () => void;
      redrawSkyline?: () => void;
      updateHeader?: () => void;
    } | null;
    s?.redrawSky?.();
    s?.redrawWeather?.();
    s?.redrawSkyline?.();
    s?.updateHeader?.();
  }, [skyTop, skyBottom, tod, label]);

  useEffect(() => {
    if (!activeWalk) return;
    const s = sceneRef.current as { walk?: (e: WalkEvent, onDone: () => void) => void } | null;
    if (!s?.walk) { setTimeout(clearWalk, 100); return; }
    s.walk(activeWalk, clearWalk);
  }, [activeWalk, clearWalk]);

  // 가구/편집 상태 → 씬 반영
  useEffect(() => {
    const s = sceneRef.current as {
      setFurniture?: (items: PlacedFurniture[], editing: boolean, selectedId: string | null) => void;
      setEditMode?: (on: boolean) => void;
    } | null;
    s?.setFurniture?.(placedFurniture ?? [], editMode, selectedInstanceId);
    s?.setEditMode?.(editMode);
  }, [placedFurniture, editMode, selectedInstanceId]);

  const placingDefId = useLayoutStore((s) => s.placingDefId);
  const setPlacingDef = useLayoutStore((s) => s.setPlacingDef);
  const [hoverCell, setHoverCell] = useState<{ col: number; row: number } | null>(null);
  const [hoverPx, setHoverPx] = useState<{ x: number; y: number } | null>(null);

  // hoverPx 변화 시 Phaser 미리보기 (픽셀 단위 커서 중심 정렬)
  useEffect(() => {
    const s = sceneRef.current as {
      drawPreviewAt?: (px: number, py: number, defId: string | null) => void;
    } | null;
    if (!hoverPx || !placingDefId) {
      s?.drawPreviewAt?.(0, 0, null);
      return;
    }
    s?.drawPreviewAt?.(hoverPx.x, hoverPx.y, placingDefId);
  }, [hoverPx, placingDefId]);

  // 좌표 변환 — Phaser canvas 실제 DOM rect 사용 (containerRef 아님, letterbox 무시)
  const eventToGrid = (e: { clientX: number; clientY: number }): { col: number; row: number; px: number; py: number } | null => {
    const game = gameRef.current as { canvas?: HTMLCanvasElement } | null;
    const canvas = game?.canvas;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 800 / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    return {
      col: Math.max(0, Math.floor(px / 32)),
      row: Math.max(0, Math.floor(py / 32)),
      px, py,
    };
  };

  // 드롭 처리 (드래그 방식)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const defId = useLayoutStore.getState().draggingDefId;
    useLayoutStore.getState().setDraggingDef(null);
    if (!defId) return;
    const g = eventToGrid(e);
    if (!g) return;
    if (g.py < WINDOW_ZONE_HEIGHT) return; // 창가 배치 불가
    layoutPlace(floor, defId, g.col, g.row);
  };

  // 커서가 가구 footprint 정중앙에 오도록 anchor 계산
  //   anchor_center_px = col*32 + w*16 (footprint 중앙)
  //   cursor_center_px = col*32 + 16 (cursor 셀 중앙)
  //   같게 하려면 anchor = col - (w-1)/2 (실수), 정수 반올림으로 근사
  const centerAnchor = (col: number, row: number, defId: string): { col: number; row: number } => {
    const def = getFurnitureDef(defId);
    if (!def) return { col, row };
    const c = Math.max(0, col - Math.round((def.widthCells - 1) / 2));
    const r = Math.max(0, row - Math.round((def.heightCells - 1) / 2));
    const minRow = Math.ceil(WINDOW_ZONE_HEIGHT / 32);
    return { col: c, row: Math.max(minRow, r) };
  };

  // 클릭 처리 — 커서 중심 기준 snap (미리보기 박스 중심 = 커서 = 실제 배치 중심)
  const placementFromCursor = (px: number, py: number, defId: string) => {
    const def = getFurnitureDef(defId);
    if (!def) return null;
    // 커서 px 가 footprint 중심이 되도록 anchor 계산
    const anchorCol = Math.max(0, Math.round((px - def.widthCells * 16) / 32));
    const anchorRow = Math.max(0, Math.round((py - def.heightCells * 16) / 32));
    return { col: anchorCol, row: anchorRow };
  };
  const handleClickPlace = (e: React.MouseEvent) => {
    if (!placingDefId) return;
    const g = eventToGrid(e);
    if (!g) return;
    const p = placementFromCursor(g.px, g.py, placingDefId);
    if (!p) return;
    if (p.row * 32 < WINDOW_ZONE_HEIGHT) return;
    layoutPlace(floor, placingDefId, p.col, p.row);
  };
  // 마우스 눌러서 끌기 → 지나간 셀에 stamps (페인트)
  const paintingRef = useRef(false);
  const lastCellRef = useRef<string | null>(null);
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!placingDefId) return;
    paintingRef.current = true;
    lastCellRef.current = null;
    handleClickPlace(e);
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!placingDefId) return;
    const g = eventToGrid(e);
    if (!g) return;
    setHoverPx({ x: g.px, y: g.py });
    // hoverCell 은 호환용으로만 유지
    const p = placementFromCursor(g.px, g.py, placingDefId);
    if (p) setHoverCell({ col: p.col, row: p.row });
    if (!paintingRef.current) return;
    if (!p) return;
    if (p.row * 32 < WINDOW_ZONE_HEIGHT) return;
    const key = `${p.col},${p.row}`;
    if (lastCellRef.current === key) return;
    lastCellRef.current = key;
    layoutPlace(floor, placingDefId, p.col, p.row);
  };
  const handleMouseUp = () => { paintingRef.current = false; lastCellRef.current = null; };
  const handleMouseLeave = () => { paintingRef.current = false; setHoverCell(null); setHoverPx(null); };

  // 편집 키보드 단축키
  //   ESC → 배치 모드/선택 해제
  //   Delete / Backspace → 선택 가구 삭제
  //   R → 회전 (배치모드 or 선택 가구)
  //   F → 좌우 대칭 (배치모드 or 선택 가구)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!editMode) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const store = useLayoutStore.getState();
      if (e.key === "Escape") {
        if (placingDefId) setPlacingDef(null);
        else if (selectedInstanceId) layoutSelect(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedInstanceId) {
        e.preventDefault();
        layoutRemove(floor, selectedInstanceId);
      }
      if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (placingDefId) store.cyclePlacingRotation();
        else if (selectedInstanceId) store.rotateInstance(floor, selectedInstanceId);
      }
      if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (placingDefId) store.togglePlacingFlip();
        else if (selectedInstanceId) store.flipInstance(floor, selectedInstanceId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode, placingDefId, setPlacingDef, selectedInstanceId, layoutSelect, layoutRemove, floor]);

  void agentCount;
  void layoutSelect;
  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative ${editMode ? "ring-2 ring-amber-400/40" : ""}`}
      onDragOver={editMode ? ((e) => e.preventDefault()) : undefined}
      onDrop={editMode ? handleDrop : undefined}
      // 우클릭 기본 메뉴 차단 — 에이전트 컨텍스트 메뉴 간섭 방지
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 배치 모드 오버레이 — 클릭/드래그만 캡쳐. 미리보기/창가선은 Phaser 씬 내부에서 그림 (좌표 100% 일치) */}
      {editMode && placingDefId && (
        <div
          className="absolute inset-0 z-30 cursor-crosshair"
          onMouseDown={(e) => {
            if (e.button === 2) { setPlacingDef(null); return; }
            handleMouseDown(e);
          }}
          onContextMenu={(e) => e.preventDefault()}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        />
      )}

      {editMode && (
        <div className="absolute top-2 right-2 z-40 flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/25 border border-amber-400/60 text-[13px] text-amber-100 font-bold pointer-events-none">
          {placingDefId
            ? `🎯 배치 · 클릭/드래그 · R=회전 · F=대칭 · ESC=취소`
            : selectedInstanceId
            ? "선택됨 · R=회전 · F=대칭 · Del=삭제 · ESC=해제"
            : "✏️ 편집 · 가구 드래그 or 팔레트 선택"}
        </div>
      )}
    </div>
  );
}
