"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Application, Assets, Container, Graphics, Rectangle, Text, TextStyle } from "pixi.js";
import { useAgentStore } from "@/stores/agentStore";
import { useChatStore } from "@/stores/chatStore";
import { useUIStore } from "@/stores/uiStore";
import { useBubbleStore, type SpeechBubble } from "@/stores/bubbleStore";
import { useHandoffStore } from "@/stores/handoffStore";
import { useOfficeStore, isEditorEnabled } from "@/stores/officeStore";
import { GRID_CELL, DESK_WIDTH, DESK_HEIGHT, DESK_WIDTH_CELLS, DESK_HEIGHT_CELLS, snapToGrid, CHAR_SCALE, agentOccKey } from "@/lib/grid";
import { TileType } from "@/types/office-layout";
import { findPath, pathToPixelWaypoints, pathDistance, buildBlockedCells, buildSoftBlockedCells, findNearestFree, TILE_SIZE } from "@/lib/pathfinding";
import { getFurnitureDef } from "@/config/furniture-catalog";
import { canPlaceFurniture } from "@/lib/furniture-validation";
import { FloorLayer } from "@/components/canvas/FloorLayer";
import { WallLayer } from "@/components/canvas/WallLayer";
import { FurnitureLayer } from "@/components/canvas/FurnitureLayer";
import { PixelCharacter } from "@/components/canvas/PixelCharacter";
import { CHARACTERS, type ActionType, getCharIdForAgent } from "@/lib/character-registry";
import type { Direction } from "@/lib/sprite-parser";
import { registerWalk, clearWalk, isWalking } from "@/lib/walk-tracker";
import { ArrowController } from "@/components/canvas/ArrowController";

const DRAG_THRESHOLD = 8;
/** Initial zoom: fit canvas height and leave room for panning horizontally */
const DEFAULT_VIEW_ZOOM = 1.4;
/** Character rendered size (full frame) */
const CHAR_W = 32 * CHAR_SCALE;
const CHAR_H = 64 * CHAR_SCALE;
/** Visible character area (top 20px of 64px frame is transparent) */
const VISIBLE_PAD_TOP = 20 * CHAR_SCALE;
const VISIBLE_H = CHAR_H - VISIBLE_PAD_TOP;
const DEFAULT_MANAGER_POSITION = { x: 672, y: 256 } as const;

function getLayoutContentBounds(layout: {
  cols: number;
  rows: number;
  tiles: number[];
  furniture: { type: string; col: number; row: number }[];
}) {
  let minC = layout.cols;
  let maxC = 0;
  let minR = layout.rows;
  let maxR = 0;

  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      if (layout.tiles[r * layout.cols + c] !== TileType.VOID) {
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
      }
    }
  }

  for (const item of layout.furniture) {
    const def = getFurnitureDef(item.type);
    const fw = def?.widthCells ?? 1;
    const fh = def?.heightCells ?? 1;
    if (item.col < minC) minC = item.col;
    if (item.col + fw - 1 > maxC) maxC = item.col + fw - 1;
    if (item.row < minR) minR = item.row;
    if (item.row + fh - 1 > maxR) maxR = item.row + fh - 1;
  }

  if (maxC < minC || maxR < minR) {
    return {
      minC: 0,
      maxC: layout.cols - 1,
      minR: 0,
      maxR: layout.rows - 1,
    };
  }

  return { minC, maxC, minR, maxR };
}

function getManagerPosition(
  layout: {
    cols: number;
    rows: number;
    tiles: number[];
    furniture: { type: string; col: number; row: number }[];
  },
  savedManagerPos: { x: number; y: number } | null,
) {
  if (savedManagerPos) {
    return {
      x: savedManagerPos.x,
      y: savedManagerPos.y,
      centerX: savedManagerPos.x + CHAR_W / 2,
      centerY: savedManagerPos.y + CHAR_H,
    };
  }

  const { minC, maxC, minR, maxR } = getLayoutContentBounds(layout);
  const minX = minC * TILE_SIZE;
  const maxX = Math.max(minX, (maxC + 1) * TILE_SIZE - CHAR_W);
  const minY = minR * TILE_SIZE;
  const maxY = Math.max(minY, (maxR + 1) * TILE_SIZE - CHAR_H);
  const x = Math.max(minX, Math.min(maxX, DEFAULT_MANAGER_POSITION.x));
  const y = Math.max(minY, Math.min(maxY, DEFAULT_MANAGER_POSITION.y));

  return {
    x,
    y,
    centerX: x + CHAR_W / 2,
    centerY: y + CHAR_H,
  };
}



/** Map manager phase to character action */
function phaseToAction(phase: string): ActionType {
  switch (phase) {
    case "refining":
      return "phone";
    case "dispatching":
      return "run";
    default:
      return "idle_anim";
  }
}

const BUBBLE_MAX_WIDTH = 320;
const BUBBLE_PADDING = 12;
const BUBBLE_TAIL_SIZE = 8;

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")   // **bold**
    .replace(/\*(.+?)\*/g, "$1")        // *italic*
    .replace(/__(.+?)__/g, "$1")        // __bold__
    .replace(/_(.+?)_/g, "$1")          // _italic_
    .replace(/~~(.+?)~~/g, "$1")        // ~~strikethrough~~
    .replace(/`(.+?)`/g, "$1")          // `code`
    .replace(/^#{1,6}\s+/gm, "")        // # headings
    .replace(/^\s*[-*+]\s+/gm, "- ")    // bullet lists
    .replace(/^\s*\d+\.\s+/gm, "")      // numbered lists
    .replace(/\[(.+?)\]\(.+?\)/g, "$1") // [link](url)
    .replace(/!\[.*?\]\(.+?\)/g, "");   // ![image](url)
}

function truncateText(text: string, maxLen = 1000): string {
  const trimmed = stripMarkdown(text).trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen) + "…";
}

function createSpeechBubble(bubble: SpeechBubble): Container {
  const container = new Container();
  container.label = `bubble-${bubble.id}`;

  const isLoading = bubble.variant === "loading";
  const displayText = isLoading ? bubble.text : truncateText(bubble.text);
  const label = "";

  const labelStyle = new TextStyle({
    fontSize: 11,
    fontWeight: "bold",
    fill: isLoading ? 0x9333ea : 0x6d28d9,
    fontFamily: "sans-serif",
    wordWrap: true,
    wordWrapWidth: BUBBLE_MAX_WIDTH - BUBBLE_PADDING * 2,
  });

  const textStyle = new TextStyle({
    fontSize: 11,
    fill: isLoading ? 0x9ca3af : 0x374151,
    fontFamily: "sans-serif",
    wordWrap: true,
    wordWrapWidth: BUBBLE_MAX_WIDTH - BUBBLE_PADDING * 2,
    fontStyle: isLoading ? "italic" : "normal",
  });

  let labelText: Text | null = null;
  let labelHeight = 0;
  if (label) {
    labelText = new Text({ text: label, style: labelStyle });
    labelHeight = labelText.height + 4;
  }

  const bodyText = new Text({ text: displayText, style: textStyle });

  const contentWidth = Math.min(
    BUBBLE_MAX_WIDTH,
    Math.max(labelText?.width ?? 0, bodyText.width) + BUBBLE_PADDING * 2
  );
  const contentHeight = labelHeight + bodyText.height + BUBBLE_PADDING * 2;

  const bgColor = isLoading ? 0xf5f3ff : 0xffffff;
  const borderColor = isLoading ? 0xc4b5fd : 0xd1d5db;

  // Bubble background
  const bg = new Graphics();
  bg.roundRect(0, 0, contentWidth, contentHeight, 8);
  bg.fill({ color: bgColor, alpha: 0.95 });
  bg.stroke({ color: borderColor, width: 1 });
  container.addChild(bg);

  // Tail (triangle)
  const tail = new Graphics();
  const tailX = contentWidth / 2;
  tail.moveTo(tailX - BUBBLE_TAIL_SIZE, contentHeight);
  tail.lineTo(tailX, contentHeight + BUBBLE_TAIL_SIZE);
  tail.lineTo(tailX + BUBBLE_TAIL_SIZE, contentHeight);
  tail.closePath();
  tail.fill({ color: bgColor, alpha: 0.95 });
  tail.stroke({ color: borderColor, width: 1 });
  container.addChild(tail);

  // Cover the tail-border overlap
  const cover = new Graphics();
  cover.rect(tailX - BUBBLE_TAIL_SIZE - 1, contentHeight - 1, BUBBLE_TAIL_SIZE * 2 + 2, 2);
  cover.fill({ color: bgColor, alpha: 0.95 });
  container.addChild(cover);

  // Label text
  if (labelText) {
    labelText.position.set(BUBBLE_PADDING, BUBBLE_PADDING);
    container.addChild(labelText);
  }

  // Body text
  bodyText.position.set(BUBBLE_PADDING, BUBBLE_PADDING + labelHeight);
  container.addChild(bodyText);

  // Center the bubble horizontally (pivot at bottom-center)
  container.pivot.set(contentWidth / 2, contentHeight + BUBBLE_TAIL_SIZE);

  // Animations
  container.alpha = 0;
  let elapsed = 0;
  const anim = setInterval(() => {
    if (!container.parent) {
      clearInterval(anim);
      return;
    }
    elapsed += 16;

    // Fade-in (first 200ms)
    if (elapsed < 200) {
      container.alpha = elapsed / 200;
    } else {
      container.alpha = 1;
    }

    // Loading pulse
    if (isLoading && elapsed >= 200) {
      container.alpha = 0.6 + 0.4 * Math.sin(elapsed / 400);
    }

    // Stop animation for result bubbles after fade-in
    if (!isLoading && elapsed >= 200) {
      clearInterval(anim);
    }
  }, 16);

  return container;
}

function spawnCompleteParticles(world: Container, x: number, y: number) {
  const colors = [0x3b82f6, 0x22c55e, 0x8b5cf6, 0xf59e0b];
  const particles: { g: Graphics; vx: number; vy: number; life: number }[] = [];

  for (let i = 0; i < 12; i++) {
    const g = new Graphics();
    const color = colors[i % colors.length];
    g.circle(0, 0, 3 + Math.random() * 3);
    g.fill(color);
    g.position.set(x + CHAR_W / 2, y + CHAR_H / 2);
    g.alpha = 1;
    world.addChild(g);

    const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
    const speed = 2 + Math.random() * 3;
    particles.push({
      g,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
    });
  }

  const decay = 0.02;
  const interval = setInterval(() => {
    let allDone = true;
    for (const p of particles) {
      p.life -= decay;
      if (p.life <= 0) {
        p.g.alpha = 0;
        continue;
      }
      allDone = false;
      p.g.x += p.vx;
      p.g.y += p.vy;
      p.vy += 0.05;
      p.g.alpha = p.life;
    }
    if (allDone) {
      clearInterval(interval);
      for (const p of particles) {
        world.removeChild(p.g);
        p.g.destroy();
      }
    }
  }, 16);
}

/** Simple easing (ease-in-out quad) */
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Determine walking direction based on displacement */
function walkDirection(dx: number, dy: number): Direction {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/** Create a small envelope graphic */
function createEnvelope(): Graphics {
  const g = new Graphics();
  // Body
  g.roundRect(0, 0, 18, 13, 2);
  g.fill(0xfef3c7);
  g.stroke({ color: 0xd97706, width: 1 });
  // Flap
  g.moveTo(1, 1);
  g.lineTo(9, 7);
  g.lineTo(17, 1);
  g.stroke({ color: 0xd97706, width: 1 });
  g.pivot.set(9, 13);
  return g;
}

/**
 * Walk along a series of pixel waypoints, interpolating segment by segment.
 * Returns the current position and updates the segment index.
 */
function walkAlongPath(
  waypoints: { x: number; y: number }[],
  totalDist: number,
  walkMs: number,
  elapsed: number,
): { x: number; y: number; t: number; segDx: number; segDy: number } {
  if (waypoints.length < 2) {
    const p = waypoints[0];
    return { x: p.x, y: p.y, t: 1, segDx: 0, segDy: 0 };
  }

  // Global progress along the entire path
  const globalT = Math.min(elapsed / walkMs, 1);
  const targetDist = globalT * totalDist;

  let accumulated = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const sdx = curr.x - prev.x;
    const sdy = curr.y - prev.y;
    const segLen = Math.sqrt(sdx * sdx + sdy * sdy);

    if (accumulated + segLen >= targetDist || i === waypoints.length - 1) {
      const remain = targetDist - accumulated;
      const segT = segLen > 0 ? Math.min(remain / segLen, 1) : 1;
      return {
        x: prev.x + sdx * segT,
        y: prev.y + sdy * segT,
        t: globalT,
        segDx: sdx,
        segDy: sdy,
      };
    }
    accumulated += segLen;
  }

  const last = waypoints[waypoints.length - 1];
  return { x: last.x, y: last.y, t: 1, segDx: 0, segDy: 0 };
}

/**
 * Animate a courier character walking from Agent A to Agent B with an envelope,
 * following A* pathfinding waypoints, delivering it, then walking back.
 */
function spawnHandoffAnimation(
  world: Container,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  charId: string,
  onDone: () => void,
  goWaypoints: { x: number; y: number }[] | null,
) {
  const WALK_SPEED = 180; // px per second
  const DELIVER_MS = 600;

  // Build waypoint lists (forward and return)
  const goPath = goWaypoints && goWaypoints.length >= 2
    ? goWaypoints
    : [{ x: fromX, y: fromY }, { x: toX, y: toY }];
  const returnPath = [...goPath].reverse();

  const goDist = pathDistance(goPath);
  const goMs = Math.max((goDist / WALK_SPEED) * 1000, 400);
  const returnDist = goDist; // same distance
  const returnMs = goMs;

  // Initial direction from first segment
  const initDx = goPath.length >= 2 ? goPath[1].x - goPath[0].x : toX - fromX;
  const initDy = goPath.length >= 2 ? goPath[1].y - goPath[0].y : toY - fromY;
  const goDir = walkDirection(initDx, initDy);

  // Courier character
  const courier = new PixelCharacter(charId, CHAR_SCALE);
  courier.label = "handoff-courier";
  courier.zIndex = 50;
  courier.position.set(fromX, fromY);
  courier.init().then(() => courier.setAction("run", goDir));
  world.addChild(courier);

  // Envelope floats above the courier
  const envelope = createEnvelope();
  envelope.zIndex = 51;
  envelope.position.set(fromX, fromY - CHAR_H + VISIBLE_PAD_TOP - 8);
  world.addChild(envelope);

  let phaseStart = Date.now();
  let phase: "going" | "delivering" | "returning" = "going";
  let lastDir: Direction = goDir;

  const interval = setInterval(() => {
    if (!courier.parent) {
      clearInterval(interval);
      onDone();
      return;
    }
    const elapsed = Date.now() - phaseStart;

    if (phase === "going") {
      const pos = walkAlongPath(goPath, goDist, goMs, elapsed);
      courier.position.set(pos.x, pos.y);

      // Update direction when segment changes
      if (pos.segDx !== 0 || pos.segDy !== 0) {
        const dir = walkDirection(pos.segDx, pos.segDy);
        if (dir !== lastDir) {
          lastDir = dir;
          courier.setAction("run", dir);
        }
      }

      // Envelope bobs slightly
      const bob = Math.sin(elapsed / 120) * 3;
      envelope.position.set(
        courier.x + 10,
        courier.y - CHAR_H + VISIBLE_PAD_TOP - 8 + bob,
      );

      if (pos.t >= 1) {
        phase = "delivering";
        phaseStart = Date.now();
        courier.setAction("idle_anim", lastDir);
        envelope.alpha = 1;
      }
    } else if (phase === "delivering") {
      // Envelope shrinks and fades
      const t = Math.min(elapsed / DELIVER_MS, 1);
      envelope.scale.set(1 - t * 0.5);
      envelope.alpha = 1 - t;

      if (t >= 1) {
        world.removeChild(envelope);
        envelope.destroy();
        // Spawn delivery sparkle
        spawnCompleteParticles(world, toX - CHAR_W / 2, toY - CHAR_H / 2);
        phase = "returning";
        phaseStart = Date.now();
        // Set return direction from first return segment
        const retDx = returnPath.length >= 2 ? returnPath[1].x - returnPath[0].x : fromX - toX;
        const retDy = returnPath.length >= 2 ? returnPath[1].y - returnPath[0].y : fromY - toY;
        lastDir = walkDirection(retDx, retDy);
        courier.setAction("run", lastDir);
      }
    } else if (phase === "returning") {
      const pos = walkAlongPath(returnPath, returnDist, returnMs, elapsed);
      courier.position.set(pos.x, pos.y);

      // Update direction when segment changes
      if (pos.segDx !== 0 || pos.segDy !== 0) {
        const dir = walkDirection(pos.segDx, pos.segDy);
        if (dir !== lastDir) {
          lastDir = dir;
          courier.setAction("run", dir);
        }
      }

      if (pos.t >= 1) {
        clearInterval(interval);
        world.removeChild(courier);
        courier.destroy();
        onDone();
      }
    }
  }, 16);
}

/**
 * Animate a character walking from the manager's position to a desk (one-way).
 * The desk container fades in when the character arrives.
 */
function spawnAgentWalkAnimation(
  world: Container,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  charId: string,
  deskContainer: Container,
  goWaypoints: { x: number; y: number }[] | null,
  onComplete?: () => void,
) {
  const WALK_SPEED = 180;

  const goPath = goWaypoints && goWaypoints.length >= 2
    ? goWaypoints
    : [{ x: fromX, y: fromY }, { x: toX, y: toY }];

  const goDist = pathDistance(goPath);
  const goMs = Math.max((goDist / WALK_SPEED) * 1000, 400);

  const initDx = goPath.length >= 2 ? goPath[1].x - goPath[0].x : toX - fromX;
  const initDy = goPath.length >= 2 ? goPath[1].y - goPath[0].y : toY - fromY;
  const goDir = walkDirection(initDx, initDy);

  // Hide desk until arrival
  deskContainer.alpha = 0;

  const walker = new PixelCharacter(charId, CHAR_SCALE);
  walker.label = "spawn-walker";
  walker.zIndex = 50;
  walker.position.set(fromX, fromY);
  walker.init().then(() => walker.setAction("run", goDir));
  world.addChild(walker);

  const startTime = Date.now();
  let lastDir: Direction = goDir;

  const interval = setInterval(() => {
    if (!walker.parent) {
      clearInterval(interval);
      deskContainer.alpha = 1;
      onComplete?.();
      return;
    }
    const elapsed = Date.now() - startTime;

    const pos = walkAlongPath(goPath, goDist, goMs, elapsed);
    walker.position.set(pos.x, pos.y);

    if (pos.segDx !== 0 || pos.segDy !== 0) {
      const dir = walkDirection(pos.segDx, pos.segDy);
      if (dir !== lastDir) {
        lastDir = dir;
        walker.setAction("run", dir);
      }
    }

    if (pos.t >= 1) {
      clearInterval(interval);
      world.removeChild(walker);
      walker.destroy();
      deskContainer.alpha = 1;
      onComplete?.();
    }
  }, 16);
}

export default function OfficeCanvas() {
  const t = useTranslations("canvas");
  const ts = useTranslations("status");
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const fitWorldRef = useRef<(() => void) | null>(null);
  const [isReady, setIsReady] = useState(false);
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const prevAgentIdsRef = useRef<Set<string> | null>(null);
  const managerCharRef = useRef<PixelCharacter | null>(null);
  const agentCharsRef = useRef<Map<string, PixelCharacter>>(new Map());
  const floorLayerRef = useRef<FloorLayer | null>(null);
  const wallLayerRef = useRef<WallLayer | null>(null);
  const furnitureLayerRef = useRef<FurnitureLayer | null>(null);
  /** Walker character standing at manager during handoff review */
  const walkerAtManagerRef = useRef<PixelCharacter | null>(null);
  const walkToManagerIdRef = useRef<string | null>(null);
  const walkFromManagerIdRef = useRef<string | null>(null);
  /** Agent IDs currently away from desk (walking to/from manager) */
  const agentsAwayRef = useRef<Set<string>>(new Set());

  const agents = useAgentStore((s) => s.agents);
  const selectAgent = useAgentStore((s) => s.selectAgent);
  const updateAgentPosition = useAgentStore((s) => s.updateAgentPosition);
  const phase = useChatStore((s) => s.phase);
  const openAgentCreate = useUIStore((s) => s.openAgentCreate);
  const openDetailPanel = useUIStore((s) => s.openDetailPanel);
  const bubbles = useBubbleStore((s) => s.bubbles);
  const activeHandoff = useHandoffStore((s) => s.activeHandoff);
  const clearHandoff = useHandoffStore((s) => s.clearHandoff);
  const walkToManagerAgent = useHandoffStore((s) => s.walkToManagerAgent);
  const clearWalkToManager = useHandoffStore((s) => s.clearWalkToManager);
  const walkFromManagerAgent = useHandoffStore((s) => s.walkFromManagerAgent);
  const clearWalkFromManager = useHandoffStore((s) => s.clearWalkFromManager);
  const layout = useOfficeStore((s) => s.layout);
  const tileSelection = useOfficeStore((s) => s.tileSelection);
  const editorMode = useOfficeStore((s) => s.editorMode);
  const viewZoom = useOfficeStore((s) => s.viewZoom);
  const managerPosition = useOfficeStore((s) => s.managerPosition);

  // Restore occupiedCells from persisted agents on mount
  useEffect(() => {
    const agentList = Array.from(agents.values())
      .filter((a) => a.position)
      .map((a) => ({ id: a.id, position: a.position }));
    if (agentList.length > 0) {
      useOfficeStore.getState().restoreOccupiedCells(agentList);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize PixiJS Application
  useEffect(() => {
    if (!canvasRef.current || appRef.current) return;

    let destroyed = false;
    const app = new Application();

    app
      .init({
        background: 0x3a3a50,
        antialias: true,
        roundPixels: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        preserveDrawingBuffer: true,
      })
      .then(() => {
        if (destroyed || !canvasRef.current) {
          app.destroy(true, { children: true });
          return;
        }

        const el = canvasRef.current;
        app.renderer.resize(el.clientWidth, el.clientHeight);
        el.appendChild(app.canvas as HTMLCanvasElement);
        appRef.current = app;

        app.stage.eventMode = "static";

        const world = new Container();
        world.label = "world";
        world.eventMode = "static";
        world.sortableChildren = true;
        app.stage.addChild(world);
        worldRef.current = world;

        // Initialize floor layer from layout
        const floorLayer = new FloorLayer();
        floorLayerRef.current = floorLayer;
        world.addChildAt(floorLayer, 0);

        // Initialize wall layer
        const wallLayer = new WallLayer();
        wallLayerRef.current = wallLayer;
        world.addChild(wallLayer);

        // Initialize furniture layer
        const furnitureLayer = new FurnitureLayer();
        furnitureLayerRef.current = furnitureLayer;
        world.addChild(furnitureLayer);

        // Auto-resize layout to fill canvas (editor mode only)
        const TILE_SZ = 32;
        if (isEditorEnabled()) {
          const neededCols = Math.ceil(el.clientWidth / TILE_SZ);
          const neededRows = Math.ceil(el.clientHeight / TILE_SZ);
          useOfficeStore.getState().resizeLayout(neededCols, neededRows);
        }

        /** Fit world to canvas: scale to fit visible content and center (view mode) */
        const fitWorldToCanvas = () => {
          if (!worldRef.current || !canvasRef.current || isEditorEnabled()) return;
          const w = worldRef.current;
          const store = useOfficeStore.getState();
          const { cols } = store.layout;
          const { minC, maxC, minR, maxR } = getLayoutContentBounds(store.layout);

          const contentW = (maxC - minC + 1) * TILE_SZ;
          const contentH = (maxR - minR + 1) * TILE_SZ;
          const canvasW = canvasRef.current.clientWidth;
          const canvasH = canvasRef.current.clientHeight;

          // Scale to fit content in canvas, respecting user zoom as upper bound
          const userZoom = store.viewZoom ?? DEFAULT_VIEW_ZOOM;
          const fitZoom = Math.min(canvasW / contentW, canvasH / contentH, userZoom);
          const zoom = fitZoom;
          w.scale.set(zoom);

          // Center the content area in the canvas
          const offsetX = minC * TILE_SZ * zoom;
          const offsetY = minR * TILE_SZ * zoom;
          const scaledW = contentW * zoom;
          const scaledH = contentH * zoom;
          w.position.set(
            (canvasW - scaledW) / 2 - offsetX,
            (canvasH - scaledH) / 2 - offsetY,
          );

        };
        fitWorldRef.current = fitWorldToCanvas;

        const { layout: initLayout, tileSelection: initSel } = useOfficeStore.getState();
        Promise.all([
          floorLayer.rebuild(initLayout, initSel),
          wallLayer.rebuild(initLayout),
          furnitureLayer.rebuild(initLayout),
        ]).then(() => {
          if (!destroyed) {
            setIsReady(true);
            fitWorldToCanvas();
          }
        }).catch(() => {
          if (!destroyed) setIsReady(true);
        });

        // Handle resize — debounce to avoid black frame from WebGL framebuffer reallocation
        let prevW = el.clientWidth;
        let prevH = el.clientHeight;
        let resizeTimer = 0;
        const onResize = () => {
          clearTimeout(resizeTimer);
          resizeTimer = window.setTimeout(() => {
            if (!appRef.current || !canvasRef.current) return;
            const w = canvasRef.current.clientWidth;
            const h = canvasRef.current.clientHeight;
            if (w === prevW && h === prevH) return;
            prevW = w;
            prevH = h;
            appRef.current.renderer.resize(w, h);

            // Expand layout if canvas grew (editor mode only)
            if (isEditorEnabled()) {
              const cols = Math.ceil(w / TILE_SZ);
              const rows = Math.ceil(h / TILE_SZ);
              const store = useOfficeStore.getState();
              if (cols > store.layout.cols || rows > store.layout.rows) {
                store.resizeLayout(cols, rows);
              }
            } else {
              // Re-fit world to canvas on resize (view mode)
              fitWorldRef.current?.();
            }
          }, 150);
        };
        const resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(el);

        // Store cleanup ref
        (app as unknown as Record<string, () => void>).__cleanupResize = () =>
          resizeObserver.disconnect();
      });

    return () => {
      destroyed = true;
      if (appRef.current) {
        const cleanup = (appRef.current as unknown as Record<string, () => void>).__cleanupResize;
        if (cleanup) cleanup();
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
        worldRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fit world when viewZoom or editor mode changes
  const isEditor = isEditorEnabled();
  useEffect(() => {
    if (!isReady || !worldRef.current) return;
    if (isEditor) {
      const zoom = viewZoom ?? DEFAULT_VIEW_ZOOM;
      worldRef.current.scale.set(zoom);
    } else {
      fitWorldRef.current?.();
    }
  }, [viewZoom, isReady, isEditor]);

  // Rebuild floor/wall/furniture layers when layout or tile selection changes
  useEffect(() => {
    if (!isReady) return;
    // Auto-expand layout to fill canvas when it's too small (editor mode only)
    if (isEditorEnabled()) {
      const el = canvasRef.current;
      if (el) {
        const neededCols = Math.ceil(el.clientWidth / 32);
        const neededRows = Math.ceil(el.clientHeight / 32);
        if (neededCols > layout.cols || neededRows > layout.rows) {
          useOfficeStore.getState().resizeLayout(neededCols, neededRows);
          return; // resizeLayout triggers another layout change, which re-runs this effect
        }
      }
    }
    if (floorLayerRef.current) floorLayerRef.current.rebuild(layout, tileSelection);
    if (wallLayerRef.current) wallLayerRef.current.rebuild(layout);
    if (furnitureLayerRef.current) furnitureLayerRef.current.rebuild(layout);

    // Re-fit after layout rebuild (view mode)
    if (!isEditorEnabled()) fitWorldRef.current?.();

  }, [layout, tileSelection, isReady]);

  // Update desks when agents change
  useEffect(() => {
    if (!worldRef.current || !isReady) return;
    const world = worldRef.current;

    // Detect status transitions for animations
    const prevStatuses = prevStatusRef.current;
    agents.forEach((agent) => {
      const prev = prevStatuses.get(agent.id);
      if (prev === "working" && agent.status === "complete") {
        spawnCompleteParticles(
          world,
          agent.position.x * GRID_CELL,
          agent.position.y * GRID_CELL
        );
      }
    });

    // Detect newly added agents (skip on first render to avoid animating persisted agents)
    const prevAgentIds = prevAgentIdsRef.current;
    const newAgentIds = new Set<string>();
    if (prevAgentIds !== null) {
      agents.forEach((agent) => {
        if (!prevAgentIds.has(agent.id)) {
          newAgentIds.add(agent.id);
        }
      });
    }
    // Update prev agent IDs for next render
    const nextAgentIds = new Set<string>();
    agents.forEach((agent) => nextAgentIds.add(agent.id));
    prevAgentIdsRef.current = nextAgentIds;

    // Update prev statuses
    const nextStatuses = new Map<string, string>();
    agents.forEach((agent) => nextStatuses.set(agent.id, agent.status));
    prevStatusRef.current = nextStatuses;

    // Remove old desk sprites from furniture layer (detach agent chars, don't destroy them)
    const furnitureParent = furnitureLayerRef.current ?? world;
    const oldDesks = furnitureParent.children.filter(
      (c) => c.label?.startsWith("desk-")
    );
    for (const d of oldDesks) {
      for (const child of [...d.children]) {
        if (child instanceof PixelCharacter) {
          d.removeChild(child);
        }
      }
      furnitureParent.removeChild(d);
    }

    // Clear old name labels
    const oldLabels = world.children.filter((c) => c.label?.startsWith("name-"));
    for (const l of oldLabels) { world.removeChild(l); l.destroy(); }

    let agentIndex = 0;
    agents.forEach((agent) => {
      const deskContainer = new Container();
      deskContainer.label = `desk-${agent.id}`;
      deskContainer.position.set(
        agent.position.x * GRID_CELL,
        agent.position.y * GRID_CELL
      );
      const currentEditorMode = useOfficeStore.getState().editorMode;
      deskContainer.eventMode = currentEditorMode === "view" ? "static" : "none";
      deskContainer.cursor = currentEditorMode === "view" ? "pointer" : "default";
      deskContainer.hitArea = new Rectangle(0, VISIBLE_PAD_TOP, CHAR_W, VISIBLE_H);
      // Y-sort: use character bottom edge + offset to render above furniture at same Y
      // Offset must exceed max furniture tiebreaker (furnitureCount * 0.001) but < TILE_SIZE(32)
      deskContainer.zIndex = agent.position.y * GRID_CELL + CHAR_H + 5;

      // Glow effect for working status (matches visible character area)
      if (agent.status === "working") {
        const glow = new Graphics();
        glow.roundRect(-6, VISIBLE_PAD_TOP - 6, CHAR_W + 12, VISIBLE_H + 12, 8);
        glow.fill({ color: 0x4ade80, alpha: 0.2 });
        deskContainer.addChild(glow);
      }

      // Agent name label (added to world directly with high zIndex so it's never occluded)
      {
        const nameStyle = new TextStyle({
          fontSize: 11,
          fontWeight: "bold",
          fill: 0xffffff,
          fontFamily: "sans-serif",
          wordWrap: true,
          wordWrapWidth: CHAR_W + 40,
          align: "center",
          dropShadow: {
            color: 0x000000,
            blur: 4,
            distance: 1,
            alpha: 0.7,
          },
        });
        const nameText = new Text({ text: agent.name, style: nameStyle });
        nameText.label = `name-${agent.id}`;
        nameText.anchor.set(0.5, 1);
        nameText.position.set(
          agent.position.x * GRID_CELL + CHAR_W / 2,
          agent.position.y * GRID_CELL + VISIBLE_PAD_TOP - 2,
        );
        nameText.zIndex = 10000;
        world.addChild(nameText);
      }

      // Status badge (below character)
      if (agent.status !== "idle") {
        const statusLabel =
          agent.status === "working"
            ? ts("working")
            : agent.status === "complete"
            ? ts("complete")
            : ts("error");
        const badgeBg = new Graphics();
        const badgeColor =
          agent.status === "working"
            ? 0x22c55e
            : agent.status === "complete"
            ? 0x3b82f6
            : 0xef4444;
        badgeBg.roundRect(0, 0, 46, 16, 8);
        badgeBg.fill(badgeColor);
        badgeBg.position.set(CHAR_W / 2 - 23, CHAR_H + 4);
        deskContainer.addChild(badgeBg);

        const badgeStyle = new TextStyle({
          fontSize: 9,
          fill: 0xffffff,
          fontFamily: "sans-serif",
        });
        const badge = new Text({ text: statusLabel, style: badgeStyle });
        badge.anchor.set(0.5, 0.5);
        badge.position.set(CHAR_W / 2, CHAR_H + 12);
        deskContainer.addChild(badge);
      }

      // One pixel character per agent
      {
        const charId = getCharIdForAgent(agentIndex);
        const cacheKey = `${agent.id}-agent`;

        let pc = agentCharsRef.current.get(cacheKey);
        if (!pc || pc.destroyed) {
          pc = new PixelCharacter(charId, CHAR_SCALE);
          pc.init();
          agentCharsRef.current.set(cacheKey, pc);
        }

        // anchor is (0.5, 1) so position at center-bottom of hitArea
        pc.position.set(CHAR_W / 2, CHAR_H);

        const action = agent.status === "working" ? "reading"
          : agent.status === "error" ? "phone"
          : "idle_anim";
        pc.setAction(action as ActionType, "down");
        pc.visible = !(activeHandoff && activeHandoff.fromAgentId === agent.id)
          && !agentsAwayRef.current.has(agent.id);
        deskContainer.addChild(pc);
      }

      // Drag-to-move & click-to-select
      let dragStartX = 0;
      let dragStartY = 0;
      let isDragging = false;
      let origX = 0;
      let origY = 0;

      deskContainer.on("pointerdown", (e) => {
        const pos = e.global;
        dragStartX = pos.x;
        dragStartY = pos.y;
        origX = deskContainer.x;
        origY = deskContainer.y;
        isDragging = false;

        // Capture initial bubble positions for this team at drag start
        const bubbleInitPos = new Map<string, { x: number; y: number }>();

        const onMove = (ev: { global: { x: number; y: number } }) => {
          const scale = deskContainer.parent?.scale.x ?? 1;
          const dx = (ev.global.x - dragStartX) / scale;
          const dy = (ev.global.y - dragStartY) / scale;
          if (!isDragging && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
            isDragging = true;
            deskContainer.alpha = 0.7;
            // Snapshot bubble positions on drag start
            const parent = deskContainer.parent;
            if (parent) {
              for (const c of parent.children) {
                if (!c.label?.startsWith("bubble-")) continue;
                const bId = c.label.replace("bubble-", "");
                const b = useBubbleStore.getState().bubbles.find((bb) => bb.id === bId);
                if (b?.targetId === agent.id) {
                  bubbleInitPos.set(c.label, { x: c.position.x, y: c.position.y });
                }
              }
            }
          }
          if (isDragging) {
            // Snap to tile grid (32px)
            const snapX = Math.round((origX + dx) / TILE_SIZE) * TILE_SIZE;
            const snapY = Math.round((origY + dy) / TILE_SIZE) * TILE_SIZE;
            deskContainer.position.set(snapX, snapY);
            // Move bubbles by the same snapped delta
            const snapDx = snapX - origX;
            const snapDy = snapY - origY;
            const parent = deskContainer.parent;
            if (parent) {
              for (const [label, initPos] of bubbleInitPos) {
                const bc = parent.children.find((c) => c.label === label);
                if (bc) bc.position.set(initPos.x + snapDx, initPos.y + snapDy);
              }
            }
          }
        };

        const onUp = () => {
          deskContainer.parent?.off("pointermove", onMove);
          deskContainer.off("pointerupoutside", onUp);

          if (isDragging) {
            deskContainer.alpha = 1;
            // Snap final position to tile grid
            const snapX = Math.round(deskContainer.x / TILE_SIZE) * TILE_SIZE;
            const snapY = Math.round(deskContainer.y / TILE_SIZE) * TILE_SIZE;
            deskContainer.position.set(snapX, snapY);
            // Update occupiedCells: free old cell, occupy new cell
            const oldOcc = agentOccKey(agent.position.x, agent.position.y);
            const newPosX = snapX / GRID_CELL;
            const newPosY = snapY / GRID_CELL;
            const newOcc = agentOccKey(newPosX, newPosY);
            if (oldOcc.gx !== newOcc.gx || oldOcc.gy !== newOcc.gy) {
              useOfficeStore.getState().freeCell(oldOcc.gx, oldOcc.gy);
              useOfficeStore.getState().occupyCell(newOcc.gx, newOcc.gy, agent.id);
            }
            updateAgentPosition(agent.id, {
              x: newPosX,
              y: newPosY,
            });
          } else {
            selectAgent(agent.id);
            openDetailPanel();
          }
        };

        deskContainer.parent?.on("pointermove", onMove);
        deskContainer.once("pointerup", onUp);
        deskContainer.once("pointerupoutside", onUp);
      });

      // Hide desk if agent is still walking to it
      if (isWalking(agent.id)) {
        deskContainer.alpha = 0;
      }

      furnitureParent.addChild(deskContainer);

      // Spawn walk animation for newly created agents (manager → desk)
      if (newAgentIds.has(agent.id)) {
        const currentLayout = useOfficeStore.getState().layout;
        const managerPos = getManagerPosition(
          currentLayout,
          useOfficeStore.getState().managerPosition,
        );
        const mgrX = managerPos.centerX;
        const mgrY = managerPos.centerY;

        const deskX = agent.position.x * GRID_CELL + CHAR_W / 2;
        const deskY = agent.position.y * GRID_CELL + CHAR_H;

        // Compute path using A*
        const occupied = useOfficeStore.getState().occupiedCells;
        const startTx = Math.floor(mgrX / TILE_SIZE);
        const startTy = Math.floor(mgrY / TILE_SIZE);
        const endTx = Math.floor(deskX / TILE_SIZE);
        const endTy = Math.floor(deskY / TILE_SIZE);

        // Only skip exact start/end cells from blocking
        const skipCells = new Set<string>();
        skipCells.add(`${startTx},${startTy}`);
        skipCells.add(`${endTx},${endTy}`);

        const blocked = buildBlockedCells(currentLayout.furniture);
        const soft = buildSoftBlockedCells(currentLayout.furniture);
        const tilePath = findPath(currentLayout, occupied, startTx, startTy, endTx, endTy, skipCells, blocked, soft);
        let waypoints: { x: number; y: number }[] | null = null;
        if (tilePath && tilePath.length >= 2) {
          waypoints = pathToPixelWaypoints(tilePath, CHAR_W / 2, TILE_SIZE);
          waypoints.unshift({ x: mgrX, y: mgrY });
          waypoints.push({ x: deskX, y: deskY });
        }

        const charId = getCharIdForAgent(agentIndex);
        const agentId = agent.id;
        const resolveWalk = registerWalk(agentId);
        spawnAgentWalkAnimation(world, mgrX, mgrY, deskX, deskY, charId, deskContainer, waypoints, () => {
          // Find the CURRENT desk container (render may have recreated it)
          const currentDesk = furnitureParent.children.find(c => c.label === `desk-${agentId}`);
          if (currentDesk) currentDesk.alpha = 1;
          resolveWalk();
          clearWalk(agentId);
        });
      }

      agentIndex++;
    });

    // Render manager character (pixel)
    const oldManager = furnitureParent.children.find((c) => c.label === "manager");
    if (oldManager) furnitureParent.removeChild(oldManager);

    const managerContainer = new Container();
    managerContainer.label = "manager";
    managerContainer.eventMode = "static";
    managerContainer.cursor = "pointer";

    const MANAGER_SCALE = CHAR_SCALE;
    const MANAGER_CHAR_W = 32 * MANAGER_SCALE;
    const MANAGER_CHAR_H = 64 * MANAGER_SCALE;

    // Position: use saved position or default
    const currentLayout = useOfficeStore.getState().layout;
    const managerPos = getManagerPosition(
      currentLayout,
      useOfficeStore.getState().managerPosition,
    );
    managerContainer.position.set(managerPos.x, managerPos.y);

    managerContainer.hitArea = new Rectangle(0, 0, MANAGER_CHAR_W, MANAGER_CHAR_H);

    // Glow effect when active
    if (phase === "refining") {
      const glow = new Graphics();
      glow.circle(MANAGER_CHAR_W / 2, MANAGER_CHAR_H / 2, MANAGER_CHAR_W / 2 + 8);
      glow.fill({ color: 0x8b5cf6, alpha: 0.25 });
      managerContainer.addChild(glow);
    }

    // Manager pixel character
    if (!managerCharRef.current || managerCharRef.current.destroyed) {
      const mc = new PixelCharacter("Samuel", CHAR_SCALE);
      mc.position.set(MANAGER_CHAR_W / 2, MANAGER_CHAR_H);
      managerCharRef.current = mc;
      mc.init();
    }
    const mc = managerCharRef.current;
    mc.setAction(phaseToAction(phase), "down");
    managerContainer.addChild(mc);

    // Manager name label
    const mgrNameStyle = new TextStyle({
      fontSize: 12,
      fontWeight: "bold",
      fill: 0xffffff,
      fontFamily: "sans-serif",
      align: "center",
      dropShadow: {
        color: 0x000000,
        blur: 4,
        distance: 1,
        alpha: 0.7,
      },
    });
    const mgrName = new Text({ text: t("manager"), style: mgrNameStyle });
    mgrName.anchor.set(0.5, 0);
    mgrName.position.set(MANAGER_CHAR_W / 2, MANAGER_CHAR_H + 4);
    managerContainer.addChild(mgrName);

    // Status badge
    if (phase !== "idle") {
      const label = phase === "refining" ? t("chatting") : t("distributing");
      const color = phase === "refining" ? 0x8b5cf6 : 0xf59e0b;

      const badgeBg = new Graphics();
      badgeBg.roundRect(0, 0, 50, 18, 9);
      badgeBg.fill(color);
      badgeBg.position.set(MANAGER_CHAR_W / 2 - 25, MANAGER_CHAR_H + 22);
      managerContainer.addChild(badgeBg);

      const badgeStyle = new TextStyle({
        fontSize: 10,
        fill: 0xffffff,
        fontFamily: "sans-serif",
      });
      const badgeText = new Text({ text: label, style: badgeStyle });
      badgeText.anchor.set(0.5, 0.5);
      badgeText.position.set(MANAGER_CHAR_W / 2, MANAGER_CHAR_H + 31);
      managerContainer.addChild(badgeText);
    }

    // Drag-to-move manager
    {
      let mgrDragStartX = 0;
      let mgrDragStartY = 0;
      let mgrIsDragging = false;
      let mgrOrigX = 0;
      let mgrOrigY = 0;

      managerContainer.on("pointerdown", (e) => {
        const pos = e.global;
        mgrDragStartX = pos.x;
        mgrDragStartY = pos.y;
        mgrOrigX = managerContainer.x;
        mgrOrigY = managerContainer.y;
        mgrIsDragging = false;

        const onMove = (ev: { global: { x: number; y: number } }) => {
          const scale = managerContainer.parent?.scale.x ?? 1;
          const dx = (ev.global.x - mgrDragStartX) / scale;
          const dy = (ev.global.y - mgrDragStartY) / scale;
          if (!mgrIsDragging && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
            mgrIsDragging = true;
            managerContainer.alpha = 0.7;
          }
          if (mgrIsDragging) {
            const snapX = Math.round((mgrOrigX + dx) / TILE_SIZE) * TILE_SIZE;
            const snapY = Math.round((mgrOrigY + dy) / TILE_SIZE) * TILE_SIZE;
            // 타일 타입 체크 — FLOOR (>=2) 위에서만 이동 허용
            const curLayout = useOfficeStore.getState().layout;
            const col = snapX / TILE_SIZE;
            const row = snapY / TILE_SIZE;
            if (
              curLayout &&
              col >= 0 && col < curLayout.cols &&
              row >= 0 && row < curLayout.rows &&
              (curLayout.tiles[row * curLayout.cols + col] ?? 0) >= 2
            ) {
              managerContainer.position.set(snapX, snapY);
            }
          }
        };

        const onUp = () => {
          managerContainer.parent?.off("pointermove", onMove);
          managerContainer.off("pointerupoutside", onUp);

          if (mgrIsDragging) {
            managerContainer.alpha = 1;
            const snapX = Math.round(managerContainer.x / TILE_SIZE) * TILE_SIZE;
            const snapY = Math.round(managerContainer.y / TILE_SIZE) * TILE_SIZE;
            // 최종 위치도 FLOOR 여야 함 (드래그 중 valid 였지만 혹시 모를 경우 대비)
            const curLayout = useOfficeStore.getState().layout;
            const col = snapX / TILE_SIZE;
            const row = snapY / TILE_SIZE;
            const isFloor =
              curLayout &&
              col >= 0 && col < curLayout.cols &&
              row >= 0 && row < curLayout.rows &&
              (curLayout.tiles[row * curLayout.cols + col] ?? 0) >= 2;
            if (!isFloor) {
              // FLOOR 아니면 원위치로 복구
              managerContainer.position.set(mgrOrigX, mgrOrigY);
              return;
            }
            managerContainer.position.set(snapX, snapY);
            managerContainer.zIndex = snapY + MANAGER_CHAR_H + 5;
            useOfficeStore.getState().setManagerPosition({
              x: snapX,
              y: snapY,
            });
          }
        };

        managerContainer.parent?.on("pointermove", onMove);
        managerContainer.once("pointerup", onUp);
        managerContainer.once("pointerupoutside", onUp);
      });
    }

    // Y-sort: use manager bottom edge + offset to render above furniture at same Y
    managerContainer.zIndex = managerContainer.y + MANAGER_CHAR_H + 5;
    furnitureParent.addChild(managerContainer);
  }, [agents, isReady, phase, activeHandoff, editorMode, managerPosition, selectAgent, updateAgentPosition, openDetailPanel]);

  // Handoff animation: courier walks from Agent A to Agent B
  const handoffIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!worldRef.current || !isReady || !activeHandoff) return;
    // Prevent re-triggering the same handoff
    if (handoffIdRef.current === activeHandoff.id) return;
    handoffIdRef.current = activeHandoff.id;

    const world = worldRef.current;
    const fromAgent = agents.get(activeHandoff.fromAgentId);
    const toAgent = agents.get(activeHandoff.toAgentId);
    if (!fromAgent || !toAgent) {
      clearHandoff();
      return;
    }

    // Character center-bottom in world space
    const fromX = fromAgent.position.x * GRID_CELL + CHAR_W / 2;
    const fromY = fromAgent.position.y * GRID_CELL + CHAR_H;
    const toAgentX = toAgent.position.x * GRID_CELL + CHAR_W / 2;
    const toAgentY = toAgent.position.y * GRID_CELL + CHAR_H;

    // Use same charId as the source agent
    const fromIndex = [...agents.keys()].indexOf(activeHandoff.fromAgentId);
    const charId = getCharIdForAgent(fromIndex >= 0 ? fromIndex : 0);

    // 3-segment path: B(straight)→ nearestFreeB (A*)→ nearestFreeA (straight)→ A
    const layout = useOfficeStore.getState().layout;
    const occupied = useOfficeStore.getState().occupiedCells;
    const blockedCells = buildBlockedCells(layout.furniture);
    const softCells = buildSoftBlockedCells(layout.furniture);

    // Build blocked set for BFS (blocked furniture + occupied agents + both agents' tiles)
    const allBlocked = new Set(blockedCells);
    for (const k of occupied.keys()) allBlocked.add(k);
    const blockAgentTiles = (posX: number, posY: number) => {
      const occ = agentOccKey(posX, posY);
      allBlocked.add(`${occ.gx},${occ.gy}`);
      allBlocked.add(`${occ.gx},${occ.gy + 1}`);
    };
    blockAgentTiles(fromAgent.position.x, fromAgent.position.y);
    blockAgentTiles(toAgent.position.x, toAgent.position.y);

    // Find nearest walkable tile from each agent (BFS from body tile)
    // preferToward: pick the free tile closest to the OTHER agent
    const fromOcc = agentOccKey(fromAgent.position.x, fromAgent.position.y);
    const toOcc = agentOccKey(toAgent.position.x, toAgent.position.y);
    const startFree = findNearestFree(layout, fromOcc.gx, fromOcc.gy, allBlocked, { x: toOcc.gx, y: toOcc.gy });
    const endFree = findNearestFree(layout, toOcc.gx, toOcc.gy, allBlocked, { x: fromOcc.gx, y: fromOcc.gy });

    // Pixel positions for free tiles
    const startFreePx = { x: startFree.x * TILE_SIZE + TILE_SIZE / 2, y: startFree.y * TILE_SIZE + TILE_SIZE };
    const endFreePx = { x: endFree.x * TILE_SIZE + TILE_SIZE / 2, y: endFree.y * TILE_SIZE + TILE_SIZE };

    // A* path between the two free tiles (no skipOccupied needed)
    const tilePath = findPath(layout, occupied, startFree.x, startFree.y, endFree.x, endFree.y, new Set(), blockedCells, softCells);

    // Build full waypoint list: B → startFree → A* path → endFree
    // Courier stops at the nearest free tile and delivers from there
    const goWaypoints: { x: number; y: number }[] = [{ x: fromX, y: fromY }];

    if (tilePath && tilePath.length >= 2) {
      const pathPx = pathToPixelWaypoints(tilePath, TILE_SIZE / 2, TILE_SIZE);
      for (const p of pathPx) goWaypoints.push(p);
    } else {
      // No A* path — straight line between free tiles
      goWaypoints.push(startFreePx);
      goWaypoints.push(endFreePx);
    }

    const toX = endFreePx.x;
    const toY = endFreePx.y;
    spawnHandoffAnimation(world, fromX, fromY, toX, toY, charId, clearHandoff, goWaypoints);
  }, [activeHandoff, isReady, agents, clearHandoff]);

  // Walk-to-manager animation: agent walks from desk to manager
  useEffect(() => {
    if (!worldRef.current || !isReady || !walkToManagerAgent) return;
    if (walkToManagerIdRef.current === walkToManagerAgent.id) return;
    walkToManagerIdRef.current = walkToManagerAgent.id;

    const world = worldRef.current;
    const agent = agents.get(walkToManagerAgent.agentId);
    if (!agent) {
      clearWalkToManager();
      return;
    }

    // Mark agent as away from desk (persists until walkFromManager completes)
    agentsAwayRef.current.add(walkToManagerAgent.agentId);

    const agentIndex = [...agents.keys()].indexOf(walkToManagerAgent.agentId);
    const charId = getCharIdForAgent(agentIndex >= 0 ? agentIndex : 0);

    // Agent desk position (center-bottom)
    const deskX = agent.position.x * GRID_CELL + CHAR_W / 2;
    const deskY = agent.position.y * GRID_CELL + CHAR_H;

    // Manager position — stand next to manager (try right, left, down, up)
    const currentLayout = useOfficeStore.getState().layout;
    const managerPos = getManagerPosition(
      currentLayout,
      useOfficeStore.getState().managerPosition,
    );
    const mgrCenterX = managerPos.centerX;
    const mgrCenterY = managerPos.centerY;
    const mgrTx = Math.floor(mgrCenterX / TILE_SIZE);
    const mgrTy = Math.floor(mgrCenterY / TILE_SIZE);
    const blockedForMgr = buildBlockedCells(currentLayout.furniture);
    let mgrX = mgrCenterX + TILE_SIZE;
    let mgrY = mgrCenterY;
    const deskTx = Math.floor(deskX / TILE_SIZE);
    const deskTy = Math.floor(deskY / TILE_SIZE);
    let mgrBestDist = Infinity;
    for (let radius = 1; radius <= 3 && mgrBestDist === Infinity; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          const tx = mgrTx + dx;
          const ty = mgrTy + dy;
          if (tx < 0 || ty < 0 || tx >= currentLayout.cols || ty >= currentLayout.rows) continue;
          const key = `${tx},${ty}`;
          if (blockedForMgr.has(key)) continue;
          if (useOfficeStore.getState().occupiedCells.has(`${tx},${ty}`)) continue;
          const idx = ty * currentLayout.cols + tx;
          if (currentLayout.tiles[idx] < TileType.FLOOR_1) continue;
          const dist = Math.abs(tx - deskTx) + Math.abs(ty - deskTy);
          if (dist < mgrBestDist) {
            mgrBestDist = dist;
            mgrX = mgrCenterX + dx * TILE_SIZE;
            mgrY = mgrCenterY + dy * TILE_SIZE;
          }
        }
      }
    }

    // Hide desk character
    const deskContainer = (furnitureLayerRef.current ?? world).children.find(c => c.label === `desk-${walkToManagerAgent.agentId}`);
    if (deskContainer) {
      for (const child of (deskContainer as Container).children) {
        if (child instanceof PixelCharacter) child.visible = false;
      }
    }

    // A* pathfinding from desk to manager
    const occupied = useOfficeStore.getState().occupiedCells;
    const startTx = Math.floor(deskX / TILE_SIZE);
    const startTy = Math.floor(deskY / TILE_SIZE);
    const endTx = Math.floor(mgrX / TILE_SIZE);
    const endTy = Math.floor(mgrY / TILE_SIZE);
    const skipCells = new Set<string>();
    skipCells.add(`${startTx},${startTy}`);
    skipCells.add(`${endTx},${endTy}`);
    const blocked = buildBlockedCells(currentLayout.furniture);
    const soft = buildSoftBlockedCells(currentLayout.furniture);
    const tilePath = findPath(currentLayout, occupied, startTx, startTy, endTx, endTy, skipCells, blocked, soft);

    let waypoints: { x: number; y: number }[] | null = null;
    if (tilePath && tilePath.length >= 2) {
      waypoints = pathToPixelWaypoints(tilePath, CHAR_W / 2, TILE_SIZE);
      waypoints.unshift({ x: deskX, y: deskY });
      waypoints.push({ x: mgrX, y: mgrY });
    }


    const WALK_SPEED = 180;
    const goPath = waypoints && waypoints.length >= 2
      ? waypoints
      : [{ x: deskX, y: deskY }, { x: mgrX, y: mgrY }];
    const goDist = pathDistance(goPath);
    const goMs = Math.max((goDist / WALK_SPEED) * 1000, 400);

    const initDx = goPath.length >= 2 ? goPath[1].x - goPath[0].x : mgrX - deskX;
    const initDy = goPath.length >= 2 ? goPath[1].y - goPath[0].y : mgrY - deskY;
    const goDir = walkDirection(initDx, initDy);

    const walker = new PixelCharacter(charId, CHAR_SCALE);
    walker.label = "walk-to-manager";
    walker.zIndex = 50;
    walker.position.set(deskX, deskY);
    walker.init().then(() => walker.setAction("run", goDir));
    world.addChild(walker);

    const startTime = Date.now();
    let lastDir: Direction = goDir;

    const interval = setInterval(() => {
      if (!walker.parent) {
        clearInterval(interval);
        clearWalkToManager();
        return;
      }
      const elapsed = Date.now() - startTime;

      const pos = walkAlongPath(goPath, goDist, goMs, elapsed);
      walker.position.set(pos.x, pos.y);

      if (pos.segDx !== 0 || pos.segDy !== 0) {
        const dir = walkDirection(pos.segDx, pos.segDy);
        if (dir !== lastDir) {
          lastDir = dir;
          walker.setAction("run", dir);
        }
      }

      if (pos.t >= 1) {
        clearInterval(interval);
        // Stand idle at manager position
        walker.setAction("idle_anim", "down");
        walkerAtManagerRef.current = walker;
        clearWalkToManager();
      }
    }, 16);
  }, [walkToManagerAgent, isReady, agents, clearWalkToManager]);

  // Walk-from-manager animation: agent walks from manager back to desk
  useEffect(() => {
    if (!worldRef.current || !isReady || !walkFromManagerAgent) return;
    if (walkFromManagerIdRef.current === walkFromManagerAgent.id) return;
    walkFromManagerIdRef.current = walkFromManagerAgent.id;

    const world = worldRef.current;
    const agent = agents.get(walkFromManagerAgent.agentId);
    if (!agent) {
      // Clean up walker if exists
      if (walkerAtManagerRef.current?.parent) {
        world.removeChild(walkerAtManagerRef.current);
        walkerAtManagerRef.current.destroy();
        walkerAtManagerRef.current = null;
      }
      agentsAwayRef.current.delete(walkFromManagerAgent.agentId);
      clearWalkFromManager();
      return;
    }

    // Get or create walker
    let walker = walkerAtManagerRef.current;
    if (!walker || !walker.parent) {
      // Fallback: create new walker at manager position
      const agentIndex = [...agents.keys()].indexOf(walkFromManagerAgent.agentId);
      const charId = getCharIdForAgent(agentIndex >= 0 ? agentIndex : 0);
      const currentLayout = useOfficeStore.getState().layout;
      const managerPos = getManagerPosition(
        currentLayout,
        useOfficeStore.getState().managerPosition,
      );
      const mgrCenterX = managerPos.centerX;
      const mgrCenterY = managerPos.centerY;
      const mgrTx = Math.floor(mgrCenterX / TILE_SIZE);
      const mgrTy = Math.floor(mgrCenterY / TILE_SIZE);
      const blockedForMgr = buildBlockedCells(currentLayout.furniture);
      const fmDeskX = agent.position.x * GRID_CELL + CHAR_W / 2;
      const fmDeskY = agent.position.y * GRID_CELL + CHAR_H;
      const fmDeskTx = Math.floor(fmDeskX / TILE_SIZE);
      const fmDeskTy = Math.floor(fmDeskY / TILE_SIZE);
      let mgrX = mgrCenterX + TILE_SIZE;
      let mgrY = mgrCenterY;
      let fmBestDist = Infinity;
      for (let radius = 1; radius <= 3 && fmBestDist === Infinity; radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
            const tx = mgrTx + dx;
            const ty = mgrTy + dy;
            if (tx < 0 || ty < 0 || tx >= currentLayout.cols || ty >= currentLayout.rows) continue;
            const key = `${tx},${ty}`;
            if (blockedForMgr.has(key)) continue;
            if (useOfficeStore.getState().occupiedCells.has(`${tx},${ty}`)) continue;
            const idx = ty * currentLayout.cols + tx;
            if (currentLayout.tiles[idx] < TileType.FLOOR_1) continue;
            const dist = Math.abs(tx - fmDeskTx) + Math.abs(ty - fmDeskTy);
            if (dist < fmBestDist) {
              fmBestDist = dist;
              mgrX = mgrCenterX + dx * TILE_SIZE;
              mgrY = mgrCenterY + dy * TILE_SIZE;
            }
          }
        }
      }

      walker = new PixelCharacter(charId, CHAR_SCALE);
      walker.label = "walk-from-manager";
      walker.zIndex = 50;
      walker.position.set(mgrX, mgrY);
      walker.init();
      world.addChild(walker);
    }

    const fromX = walker.position.x;
    const fromY = walker.position.y;
    const deskX = agent.position.x * GRID_CELL + CHAR_W / 2;
    const deskY = agent.position.y * GRID_CELL + CHAR_H;

    // A* pathfinding from manager to desk
    const currentLayout = useOfficeStore.getState().layout;
    const occupied = useOfficeStore.getState().occupiedCells;
    const startTx = Math.floor(fromX / TILE_SIZE);
    const startTy = Math.floor(fromY / TILE_SIZE);
    const endTx = Math.floor(deskX / TILE_SIZE);
    const endTy = Math.floor(deskY / TILE_SIZE);
    const skipCells = new Set<string>();
    skipCells.add(`${startTx},${startTy}`);
    skipCells.add(`${endTx},${endTy}`);
    const blocked = buildBlockedCells(currentLayout.furniture);
    const soft = buildSoftBlockedCells(currentLayout.furniture);
    const tilePath = findPath(currentLayout, occupied, startTx, startTy, endTx, endTy, skipCells, blocked, soft);

    let waypoints: { x: number; y: number }[] | null = null;
    if (tilePath && tilePath.length >= 2) {
      waypoints = pathToPixelWaypoints(tilePath, CHAR_W / 2, TILE_SIZE);
      waypoints.unshift({ x: fromX, y: fromY });
      waypoints.push({ x: deskX, y: deskY });
    }


    const WALK_SPEED = 180;
    const goPath = waypoints && waypoints.length >= 2
      ? waypoints
      : [{ x: fromX, y: fromY }, { x: deskX, y: deskY }];
    const goDist = pathDistance(goPath);
    const goMs = Math.max((goDist / WALK_SPEED) * 1000, 400);

    const initDx = goPath.length >= 2 ? goPath[1].x - goPath[0].x : deskX - fromX;
    const initDy = goPath.length >= 2 ? goPath[1].y - goPath[0].y : deskY - fromY;
    const goDir = walkDirection(initDx, initDy);

    walker.setAction("run", goDir);

    const startTime = Date.now();
    let lastDir: Direction = goDir;
    const walkFromManagerAgentId = walkFromManagerAgent.agentId;

    const interval = setInterval(() => {
      if (!walker || !walker.parent) {
        clearInterval(interval);
        walkerAtManagerRef.current = null;
        agentsAwayRef.current.delete(walkFromManagerAgentId);
        clearWalkFromManager();
        return;
      }
      const elapsed = Date.now() - startTime;

      const pos = walkAlongPath(goPath, goDist, goMs, elapsed);
      walker.position.set(pos.x, pos.y);

      if (pos.segDx !== 0 || pos.segDy !== 0) {
        const dir = walkDirection(pos.segDx, pos.segDy);
        if (dir !== lastDir) {
          lastDir = dir;
          walker.setAction("run", dir);
        }
      }

      if (pos.t >= 1) {
        clearInterval(interval);
        world.removeChild(walker);
        walker.destroy();
        walkerAtManagerRef.current = null;

        // Mark agent as back at desk
        agentsAwayRef.current.delete(walkFromManagerAgentId);

        // Show desk character again
        const deskContainer = (furnitureLayerRef.current ?? world).children.find(c => c.label === `desk-${walkFromManagerAgentId}`);
        if (deskContainer) {
          for (const child of (deskContainer as Container).children) {
            if (child instanceof PixelCharacter) child.visible = true;
          }
        }

        clearWalkFromManager();
      }
    }, 16);
  }, [walkFromManagerAgent, isReady, agents, clearWalkFromManager]);

  // Render speech bubbles (stacked per target)
  useEffect(() => {
    if (!worldRef.current || !isReady) return;
    const world = worldRef.current;

    // Remove old bubbles
    const oldBubbles = world.children.filter((c) => c.label?.startsWith("bubble-"));
    oldBubbles.forEach((b) => {
      world.removeChild(b);
      b.destroy({ children: true });
    });

    const BUBBLE_GAP = 6;

    // Separate manager and agent bubbles
    const managerBubbles = bubbles.filter((b) => b.targetType === "manager");
    const agentBubbles = bubbles.filter((b) => b.targetType === "agent");

    // Render manager bubbles (above manager character)
    if (managerBubbles.length > 0) {
      const manager = (furnitureLayerRef.current ?? world).children.find((c) => c.label === "manager");
      if (manager) {
        const MANAGER_CHAR_W = 32 * CHAR_SCALE;
        let yOffset = 0;
        for (let i = managerBubbles.length - 1; i >= 0; i--) {
          const bc = createSpeechBubble(managerBubbles[i]);
          bc.zIndex = 100;
          bc.position.set(manager.x + MANAGER_CHAR_W / 2, manager.y - 4 - yOffset);
          world.addChild(bc);
          yOffset += bc.getLocalBounds().height + BUBBLE_GAP;
        }
      }
    }

    // Render agent bubbles (single anchor per agent, above character)
    const agentGroups = new Map<string, SpeechBubble[]>();
    for (const bubble of agentBubbles) {
      if (!bubble.targetId) continue;
      const group = agentGroups.get(bubble.targetId) ?? [];
      group.push(bubble);
      agentGroups.set(bubble.targetId, group);
    }

    for (const [targetId, group] of agentGroups) {
      // Don't show bubbles while the agent is walking (to desk or to/from manager)
      if (isWalking(targetId) || agentsAwayRef.current.has(targetId)) continue;

      const desk = world.children.find(
        (c) => c.label === `desk-${targetId}`
      );
      if (!desk) continue;

      const anchorX = desk.x + CHAR_W / 2;
      const anchorY = desk.y - 4;

      let yOffset = 0;
      for (let i = group.length - 1; i >= 0; i--) {
        const bc = createSpeechBubble(group[i]);
        bc.zIndex = 100;
        bc.position.set(anchorX, anchorY - yOffset);
        world.addChild(bc);
        yOffset += bc.getLocalBounds().height + BUBBLE_GAP;
      }
    }
  }, [bubbles, isReady, agents]);

  // --- Editor pointer events ---
  const setTile = useOfficeStore((s) => s.setTile);
  const placeFurniture = useOfficeStore((s) => s.placeFurniture);
  const removeFurniture = useOfficeStore((s) => s.removeFurniture);
  const moveFurniture = useOfficeStore((s) => s.moveFurniture);
  const moveFurnitureBatch = useOfficeStore((s) => s.moveFurnitureBatch);
  const selectedFurnitureType = useOfficeStore((s) => s.selectedFurnitureType);
  const eraseTileNoHistory = useOfficeStore((s) => s.eraseTileNoHistory);
  const pushUndoSnapshot = useOfficeStore((s) => s.pushUndoSnapshot);
  const isPaintingRef = useRef(false);
  const lastPaintedTileRef = useRef<string | null>(null);
  /** Alt key held during drag — enables selecting all items including floor/wall tiles */
  const selectAllModeRef = useRef(false);
  const draggingFurnitureRef = useRef<{ uid: string; origCol: number; origRow: number; startPx: { x: number; y: number } } | null>(null);

  // Group selection state
  const selectedUidsRef = useRef<Set<string>>(new Set());
  const selectionOverlayRef = useRef<Graphics | null>(null);
  const selectionRectRef = useRef<{ startX: number; startY: number; curX: number; curY: number } | null>(null);
  const clipboardRef = useRef<{ type: string; col: number; row: number; rotation?: number }[]>([]);
  const groupDragRef = useRef<{
    startPx: { x: number; y: number };
    items: { uid: string; origCol: number; origRow: number }[];
  } | null>(null);

  const TILE_SIZE = 32;

  const screenToTile = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const world = worldRef.current;
      if (!rect || !world) return null;
      const scale = world.scale.x;
      const x = (clientX - rect.left - world.position.x) / scale;
      const y = (clientY - rect.top - world.position.y) / scale;
      return {
        col: Math.floor(x / TILE_SIZE),
        row: Math.floor(y / TILE_SIZE),
      };
    },
    []
  );

  const screenToPixel = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const world = worldRef.current;
      if (!rect || !world) return null;
      const scale = world.scale.x;
      return {
        x: (clientX - rect.left - world.position.x) / scale,
        y: (clientY - rect.top - world.position.y) / scale,
      };
    },
    []
  );

  const findFurnitureAt = useCallback(
    (col: number, row: number, selectAll = false) => {
      const { layout: l } = useOfficeStore.getState();
      for (let i = l.furniture.length - 1; i >= 0; i--) {
        const f = l.furniture[i];
        const def = getFurnitureDef(f.type);
        if (!def) continue;
        // Skip floor/wall tiles unless selectAll mode
        if (!selectAll && (def.category === "floor_tile" || def.category === "wall_tile")) continue;
        if (col >= f.col && col < f.col + def.widthCells &&
            row >= f.row && row < f.row + def.heightCells) {
          return f;
        }
      }
      return null;
    },
    []
  );

  const removeFurnitureAt = useCallback(
    (col: number, row: number) => {
      const hit = findFurnitureAt(col, row);
      if (hit) removeFurniture(hit.uid);
    },
    [findFurnitureAt, removeFurniture]
  );

  /** Draw selection highlights around selected furniture */
  const drawSelectionOverlay = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;

    // Ensure overlay graphics exists
    if (!selectionOverlayRef.current) {
      const g = new Graphics();
      g.label = "selection-overlay";
      g.zIndex = 998;
      world.addChild(g);
      selectionOverlayRef.current = g;
    }
    const g = selectionOverlayRef.current;
    g.clear();

    // Draw selection rectangle if dragging
    const sr = selectionRectRef.current;
    if (sr) {
      const x = Math.min(sr.startX, sr.curX);
      const y = Math.min(sr.startY, sr.curY);
      const w = Math.abs(sr.curX - sr.startX);
      const h = Math.abs(sr.curY - sr.startY);
      g.rect(x, y, w, h);
      g.fill({ color: 0x3b82f6, alpha: 0.1 });
      g.stroke({ color: 0x3b82f6, alpha: 0.5, width: 1 });
    }

    // Highlight selected furniture
    const { layout: l } = useOfficeStore.getState();
    for (const f of l.furniture) {
      if (!selectedUidsRef.current.has(f.uid)) continue;
      const def = getFurnitureDef(f.type);
      if (!def) continue;
      const fx = f.col * TILE_SIZE;
      const fy = f.row * TILE_SIZE;
      const fw = def.widthCells * TILE_SIZE;
      const fh = def.heightCells * TILE_SIZE;
      g.rect(fx - 1, fy - 1, fw + 2, fh + 2);
      g.stroke({ color: 0x3b82f6, alpha: 0.8, width: 2 });
    }
  }, []);

  const clearSelection = useCallback(() => {
    selectedUidsRef.current.clear();
    drawSelectionOverlay();
  }, [drawSelectionOverlay]);

  const removeTileAt = useCallback(
    (col: number, row: number) => {
      // Remove only wall_tile / floor_tile at this position, keep dividers and furniture
      const { layout: l } = useOfficeStore.getState();
      for (let i = l.furniture.length - 1; i >= 0; i--) {
        const f = l.furniture[i];
        const def = getFurnitureDef(f.type);
        if (!def) continue;
        if (def.category !== "wall_tile" && def.category !== "floor_tile") continue;
        if (col >= f.col && col < f.col + def.widthCells &&
            row >= f.row && row < f.row + def.heightCells) {
          removeFurniture(f.uid);
          return;
        }
      }
    },
    [removeFurniture]
  );

  const placeTileAsFurniture = useCallback(
    (col: number, row: number, tileId: string) => {
      const def = getFurnitureDef(tileId);
      if (!def) return;
      // Remove only existing wall/floor tile at this position (keep dividers)
      removeTileAt(col, row);
      placeFurniture({
        uid: `${tileId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: tileId,
        col,
        row,
      });
    },
    [placeFurniture, removeTileAt]
  );

  const paintTile = useCallback(
    (col: number, row: number) => {
      const key = `${col},${row}`;
      if (lastPaintedTileRef.current === key) return;
      lastPaintedTileRef.current = key;

      const { editorMode, tileSelection } = useOfficeStore.getState();
      if (editorMode === "floor") {
        placeTileAsFurniture(col, row, tileSelection.floorTileId);
        setTile(col, row, TileType.FLOOR_1);
      } else if (editorMode === "wall") {
        placeTileAsFurniture(col, row, tileSelection.wallTileId);
        setTile(col, row, TileType.WALL);
      } else if (editorMode === "eraser") {
        eraseTileNoHistory(col, row);
      }
    },
    [setTile, eraseTileNoHistory, placeTileAsFurniture]
  );

  const handleEditorPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const mode = useOfficeStore.getState().editorMode;
      if (mode === "view") return;

      const tile = screenToTile(e.clientX, e.clientY);
      if (!tile) return;

      if (mode === "divider") {
        const { tileSelection } = useOfficeStore.getState();
        const dividerId = tileSelection.dividerTileId;
        const def = getFurnitureDef(dividerId);
        if (!def) return;
        const { layout } = useOfficeStore.getState();
        const result = canPlaceFurniture(layout, def, tile.col, tile.row);
        if (result.valid) {
          placeFurniture({
            uid: `${dividerId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: dividerId,
            col: tile.col,
            row: tile.row,
          });
        }
        isPaintingRef.current = true;
        return;
      }

      if (mode === "furniture") {
        selectAllModeRef.current = e.altKey;
        const existing = findFurnitureAt(tile.col, tile.row, e.altKey);
        const furnitureType = useOfficeStore.getState().selectedFurnitureType;

        // If clicking on a selected furniture item → start group drag (only when no catalog type selected)
        if (existing && selectedUidsRef.current.has(existing.uid) && !furnitureType) {
          const startPx = screenToPixel(e.clientX, e.clientY);
          if (!startPx) return;
          const { layout: l } = useOfficeStore.getState();
          const items = l.furniture
            .filter((f) => selectedUidsRef.current.has(f.uid))
            .map((f) => ({ uid: f.uid, origCol: f.col, origRow: f.row }));
          groupDragRef.current = {
            startPx,
            items,
          };
          // Visual feedback
          for (const item of items) {
            const sprite = furnitureLayerRef.current?.children.find(
              (c) => c.label === `furniture-${item.uid}`
            );
            if (sprite) sprite.alpha = 0.6;
          }
          return;
        }

        // If clicking on existing furniture (not selected) → always drag/select (even with catalog type)
        if (existing) {
          if (e.shiftKey) {
            // Shift+click: add/remove from selection
            if (selectedUidsRef.current.has(existing.uid)) {
              selectedUidsRef.current.delete(existing.uid);
            } else {
              selectedUidsRef.current.add(existing.uid);
            }
            drawSelectionOverlay();
            return;
          }
          // Plain click: select and start single drag
          const startPx = screenToPixel(e.clientX, e.clientY);
          if (!startPx) return;
          selectedUidsRef.current.clear();
          selectedUidsRef.current.add(existing.uid);
          drawSelectionOverlay();
          draggingFurnitureRef.current = { uid: existing.uid, origCol: existing.col, origRow: existing.row, startPx };
          const sprite = furnitureLayerRef.current?.children.find(
            (c) => c.label === `furniture-${existing.uid}`
          );
          if (sprite) sprite.alpha = 0.6;
          return;
        }

        // Clicking on empty space
        if (!furnitureType) {
          // No type selected: start selection rectangle
          const px = screenToPixel(e.clientX, e.clientY);
          if (px) {
            if (!e.shiftKey) selectedUidsRef.current.clear();
            selectionRectRef.current = { startX: px.x, startY: px.y, curX: px.x, curY: px.y };
            drawSelectionOverlay();
          }
          return;
        }

        // Place new furniture (clear selection when placing)
        if (selectedUidsRef.current.size > 0) {
          clearSelection();
        }
        const def = getFurnitureDef(furnitureType);
        if (!def) return;
        const { layout } = useOfficeStore.getState();
        const result = canPlaceFurniture(layout, def, tile.col, tile.row);
        if (result.valid) {
          clearSelection();
          placeFurniture({
            uid: `${furnitureType}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: furnitureType,
            col: tile.col,
            row: tile.row,
          });
        }
        isPaintingRef.current = true;
      } else if (mode === "eraser") {
        // eraser: drag rectangle to erase area
        clearSelection();
        pushUndoSnapshot();
        const px = screenToPixel(e.clientX, e.clientY);
        if (px) {
          selectionRectRef.current = { startX: px.x, startY: px.y, curX: px.x, curY: px.y };
          drawSelectionOverlay();
        }
      } else {
        // floor / wall: paint on down + drag
        clearSelection();
        isPaintingRef.current = true;
        lastPaintedTileRef.current = null;
        paintTile(tile.col, tile.row);
      }
    },
    [screenToTile, screenToPixel, paintTile, placeFurniture, findFurnitureAt, drawSelectionOverlay, clearSelection, pushUndoSnapshot]
  );

  const handleEditorPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const tile = screenToTile(e.clientX, e.clientY);
      if (!tile) return;

      // Handle group drag (smooth pixel movement)
      if (groupDragRef.current) {
        const px = screenToPixel(e.clientX, e.clientY);
        if (!px) return;
        const gd = groupDragRef.current;
        const dx = px.x - gd.startPx.x;
        const dy = px.y - gd.startPx.y;
        for (const item of gd.items) {
          const sprite = furnitureLayerRef.current?.children.find(
            (c) => c.label === `furniture-${item.uid}`
          );
          if (sprite) {
            sprite.position.set(
              item.origCol * TILE_SIZE + dx,
              item.origRow * TILE_SIZE + dy,
            );
          }
        }
        return;
      }

      // Handle selection rectangle
      if (selectionRectRef.current) {
        const px = screenToPixel(e.clientX, e.clientY);
        if (px) {
          selectionRectRef.current.curX = px.x;
          selectionRectRef.current.curY = px.y;
          drawSelectionOverlay();
        }
        return;
      }

      // Handle single furniture drag (smooth pixel movement)
      if (draggingFurnitureRef.current) {
        const px = screenToPixel(e.clientX, e.clientY);
        if (!px) return;
        const df = draggingFurnitureRef.current;
        const dx = px.x - df.startPx.x;
        const dy = px.y - df.startPx.y;
        const sprite = furnitureLayerRef.current?.children.find(
          (c) => c.label === `furniture-${df.uid}`
        );
        if (sprite) {
          sprite.position.set(
            df.origCol * TILE_SIZE + dx,
            df.origRow * TILE_SIZE + dy,
          );
        }
        return;
      }

      if (!isPaintingRef.current) return;
      const mode = useOfficeStore.getState().editorMode;
      if (mode === "view") return;

      if (mode === "divider") {
        const { tileSelection } = useOfficeStore.getState();
        const dividerId = tileSelection.dividerTileId;
        const def = getFurnitureDef(dividerId);
        if (!def) return;
        const { layout } = useOfficeStore.getState();
        const result = canPlaceFurniture(layout, def, tile.col, tile.row);
        if (result.valid) {
          placeFurniture({
            uid: `${dividerId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: dividerId,
            col: tile.col,
            row: tile.row,
          });
        }
      } else if (mode === "furniture") {
        const furnitureType = useOfficeStore.getState().selectedFurnitureType;
        if (!furnitureType) return;
        const def = getFurnitureDef(furnitureType);
        if (!def) return;
        const { layout } = useOfficeStore.getState();
        const result = canPlaceFurniture(layout, def, tile.col, tile.row);
        if (result.valid) {
          placeFurniture({
            uid: `${furnitureType}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: furnitureType,
            col: tile.col,
            row: tile.row,
          });
        }
      } else {
        paintTile(tile.col, tile.row);
      }
    },
    [screenToTile, screenToPixel, paintTile, placeFurniture, drawSelectionOverlay]
  );

  const handleEditorPointerUp = useCallback(() => {
    // Finalize group drag (snap each item to nearest tile)
    if (groupDragRef.current) {
      const gd = groupDragRef.current;
      // Calculate delta from first item's sprite position
      const firstSprite = furnitureLayerRef.current?.children.find(
        (c) => c.label === `furniture-${gd.items[0]?.uid}`
      );
      if (firstSprite && gd.items[0]) {
        const snapCol = Math.round(firstSprite.x / TILE_SIZE);
        const snapRow = Math.round(firstSprite.y / TILE_SIZE);
        const dc = snapCol - gd.items[0].origCol;
        const dr = snapRow - gd.items[0].origRow;
        if (dc !== 0 || dr !== 0) {
          moveFurnitureBatch(
            gd.items.map((item) => ({
              uid: item.uid,
              col: item.origCol + dc,
              row: item.origRow + dr,
            }))
          );
        } else {
          // No movement: rebuild to restore positions
          if (furnitureLayerRef.current) {
            furnitureLayerRef.current.rebuild(useOfficeStore.getState().layout);
          }
        }
      }
      groupDragRef.current = null;
      drawSelectionOverlay();
      return;
    }

    // Finalize selection rectangle
    if (selectionRectRef.current) {
      const sr = selectionRectRef.current;
      const minX = Math.min(sr.startX, sr.curX);
      const maxX = Math.max(sr.startX, sr.curX);
      const minY = Math.min(sr.startY, sr.curY);
      const maxY = Math.max(sr.startY, sr.curY);

      const mode = useOfficeStore.getState().editorMode;

      if (mode === "eraser") {
        // Erase all tiles in the rectangle
        const minCol = Math.floor(minX / TILE_SIZE);
        const maxCol = Math.floor(maxX / TILE_SIZE);
        const minRow = Math.floor(minY / TILE_SIZE);
        const maxRow = Math.floor(maxY / TILE_SIZE);
        for (let r = minRow; r <= maxRow; r++) {
          for (let c = minCol; c <= maxCol; c++) {
            eraseTileNoHistory(c, r);
          }
        }
        selectionRectRef.current = null;
        drawSelectionOverlay();
        return;
      }

      // Find all furniture intersecting the rectangle
      const selectAll = selectAllModeRef.current;
      const { layout: l } = useOfficeStore.getState();
      for (const f of l.furniture) {
        const def = getFurnitureDef(f.type);
        if (!def) continue;
        if (!selectAll && (def.category === "floor_tile" || def.category === "wall_tile")) continue;
        const fx = f.col * TILE_SIZE;
        const fy = f.row * TILE_SIZE;
        const fw = def.widthCells * TILE_SIZE;
        const fh = def.heightCells * TILE_SIZE;
        // AABB intersection
        if (fx < maxX && fx + fw > minX && fy < maxY && fy + fh > minY) {
          selectedUidsRef.current.add(f.uid);
        }
      }
      selectionRectRef.current = null;
      drawSelectionOverlay();
      return;
    }

    // Finalize single furniture drag (snap to nearest tile)
    if (draggingFurnitureRef.current) {
      const df = draggingFurnitureRef.current;
      const sprite = furnitureLayerRef.current?.children.find(
        (c) => c.label === `furniture-${df.uid}`
      );
      if (sprite) {
        const snapCol = Math.round(sprite.x / TILE_SIZE);
        const snapRow = Math.round(sprite.y / TILE_SIZE);
        moveFurniture(df.uid, snapCol, snapRow);
      }
      draggingFurnitureRef.current = null;
      return;
    }
    isPaintingRef.current = false;
    lastPaintedTileRef.current = null;
    selectAllModeRef.current = false;
  }, [moveFurniture, moveFurnitureBatch, drawSelectionOverlay]);

  // Grid overlay for editor modes + debug overlay
  useEffect(() => {
    if (!worldRef.current || !isReady) return;
    const world = worldRef.current;

    // Remove old overlays
    const oldGrid = world.children.find((c) => c.label === "grid-overlay");
    if (oldGrid) { world.removeChild(oldGrid); oldGrid.destroy(); }
    const { layout: currentLayout } = useOfficeStore.getState();

    if (editorMode === "view") return;

    // Grid lines
    const g = new Graphics();
    g.label = "grid-overlay";
    g.zIndex = 999;

    for (let r = 0; r <= currentLayout.rows; r++) {
      g.moveTo(0, r * TILE_SIZE);
      g.lineTo(currentLayout.cols * TILE_SIZE, r * TILE_SIZE);
    }
    for (let c = 0; c <= currentLayout.cols; c++) {
      g.moveTo(c * TILE_SIZE, 0);
      g.lineTo(c * TILE_SIZE, currentLayout.rows * TILE_SIZE);
    }
    g.stroke({ color: 0x000000, alpha: 0.08, width: 1 });
    world.addChild(g);
  }, [editorMode, isReady, layout]);

  // Keyboard: Copy (Ctrl+C), Paste (Ctrl+V), Delete selected furniture
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mode = useOfficeStore.getState().editorMode;
      if (mode !== "furniture") return;

      // Delete / Backspace: remove selected furniture
      if ((e.key === "Delete" || e.key === "Backspace") && selectedUidsRef.current.size > 0) {
        e.preventDefault();
        for (const uid of selectedUidsRef.current) {
          removeFurniture(uid);
        }
        selectedUidsRef.current.clear();
        drawSelectionOverlay();
        return;
      }

      // R: rotate selected furniture 90° CW
      if (e.key === "r" && !e.metaKey && !e.ctrlKey && selectedUidsRef.current.size > 0) {
        e.preventDefault();
        useOfficeStore.getState().rotateFurnitureBatch([...selectedUidsRef.current]);
        return;
      }

      // ]: bring selected furniture forward (higher z-order)
      if (e.key === "]" && !e.metaKey && !e.ctrlKey && selectedUidsRef.current.size > 0) {
        e.preventDefault();
        useOfficeStore.getState().bringForward([...selectedUidsRef.current]);
        return;
      }

      // [: send selected furniture backward (lower z-order)
      if (e.key === "[" && !e.metaKey && !e.ctrlKey && selectedUidsRef.current.size > 0) {
        e.preventDefault();
        useOfficeStore.getState().sendBackward([...selectedUidsRef.current]);
        return;
      }

      if (!e.metaKey && !e.ctrlKey) return;

      // Ctrl+C: copy selected furniture to clipboard
      if (e.key === "c" && selectedUidsRef.current.size > 0) {
        e.preventDefault();
        const { layout: l } = useOfficeStore.getState();
        const items = l.furniture.filter((f) => selectedUidsRef.current.has(f.uid));
        if (items.length === 0) return;
        // Store relative positions (relative to top-left of selection)
        const minCol = Math.min(...items.map((f) => f.col));
        const minRow = Math.min(...items.map((f) => f.row));
        clipboardRef.current = items.map((f) => ({
          type: f.type,
          col: f.col - minCol,
          row: f.row - minRow,
          rotation: f.rotation,
        }));
        return;
      }

      // Ctrl+V: paste clipboard at offset from original
      if (e.key === "v" && clipboardRef.current.length > 0) {
        e.preventDefault();
        const clipboard = clipboardRef.current;
        // Find a paste position: offset from the selection's bounding box
        const { layout: l } = useOfficeStore.getState();
        // Find max col/row of the clipboard items for offset
        let maxW = 0;
        for (const item of clipboard) {
          const def = getFurnitureDef(item.type);
          if (def) maxW = Math.max(maxW, item.col + def.widthCells);
        }
        // Paste offset: right of the original selection by 1 tile
        const selectedItems = l.furniture.filter((f) => selectedUidsRef.current.has(f.uid));
        let baseCol = 0;
        let baseRow = 0;
        if (selectedItems.length > 0) {
          baseCol = Math.min(...selectedItems.map((f) => f.col)) + maxW + 1;
          baseRow = Math.min(...selectedItems.map((f) => f.row));
        }

        // Place all items and select them
        const newUids = new Set<string>();
        for (const item of clipboard) {
          const uid = `${item.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          placeFurniture({
            uid,
            type: item.type,
            col: baseCol + item.col,
            row: baseRow + item.row,
            rotation: item.rotation,
          });
          newUids.add(uid);
        }
        selectedUidsRef.current = newUids;
        // Update clipboard to new relative positions (so next paste offsets from these)
        setTimeout(() => drawSelectionOverlay(), 50);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [removeFurniture, placeFurniture, drawSelectionOverlay]);

  // Drop handler for desk placement
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const data = e.dataTransfer.getData("text/plain");
      if (data !== "new-desk") return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const snapped = snapToGrid(screenX, screenY);
      const gridX = snapped.x / GRID_CELL;
      const gridY = snapped.y / GRID_CELL;

      openAgentCreate({ x: gridX, y: gridY });
    },
    [openAgentCreate]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const contentBounds = useMemo(() => {
    const TILE_PX = 32;
    const { cols, rows, tiles, furniture } = layout;

    // Calculate bounding box of non-VOID tiles
    let minC = cols, maxC = 0, minR = rows, maxR = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (tiles[r * cols + c] !== 0) {
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
        }
      }
    }
    // Extend with furniture bounds
    for (const f of furniture) {
      const def = getFurnitureDef(f.type);
      const fw = def ? def.widthCells : 1;
      const fh = def ? def.heightCells : 1;
      if (f.col < minC) minC = f.col;
      if (f.col + fw - 1 > maxC) maxC = f.col + fw - 1;
      if (f.row < minR) minR = f.row;
      if (f.row + fh - 1 > maxR) maxR = f.row + fh - 1;
    }
    // Include agent desk positions
    for (const [, agent] of agents) {
      const ac = Math.floor(agent.position.x * GRID_CELL / TILE_PX);
      const ar = Math.floor(agent.position.y * GRID_CELL / TILE_PX);
      const acEnd = Math.ceil((agent.position.x * GRID_CELL + DESK_WIDTH) / TILE_PX) - 1;
      const arEnd = Math.ceil((agent.position.y * GRID_CELL + DESK_HEIGHT) / TILE_PX) - 1;
      if (ac < minC) minC = ac;
      if (acEnd > maxC) maxC = acEnd;
      if (ar < minR) minR = ar;
      if (arEnd > maxR) maxR = arEnd;
    }
    // Include manager position
    const managerPos = getManagerPosition(layout, managerPosition);
    const mc = Math.floor(managerPos.x / TILE_PX);
    const mr = Math.floor(managerPos.y / TILE_PX);
    const mcEnd = Math.ceil((managerPos.x + CHAR_W) / TILE_PX) - 1;
    const mrEnd = Math.ceil((managerPos.y + CHAR_H) / TILE_PX) - 1;
    if (mc < minC) minC = mc;
    if (mcEnd > maxC) maxC = mcEnd;
    if (mr < minR) minR = mr;
    if (mrEnd > maxR) maxR = mrEnd;

    // Fallback: if no content, use full grid
    if (maxC < minC || maxR < minR) {
      minC = 0; maxC = cols - 1; minR = 0; maxR = rows - 1;
    }

    return {
      width: (maxC - minC + 1) * TILE_PX,
      height: (maxR - minR + 1) * TILE_PX,
    };
  }, [layout.cols, layout.rows, layout.tiles, layout.furniture, agents, managerPosition]);

  const handlePan = useCallback((dx: number, dy: number) => {
    if (!worldRef.current || !canvasRef.current) return;
    const world = worldRef.current;
    const scale = world.scale.x;
    const canvasW = canvasRef.current.clientWidth;
    const canvasH = canvasRef.current.clientHeight;

    const scaledW = contentBounds.width * scale;
    const scaledH = contentBounds.height * scale;

    // When content fits inside canvas, allow panning within centered bounds
    // When content overflows, clamp so edges stay visible
    const minX = scaledW > canvasW ? canvasW - scaledW : (canvasW - scaledW) / 2;
    const maxX = scaledW > canvasW ? 0 : (canvasW - scaledW) / 2;
    const minY = scaledH > canvasH ? canvasH - scaledH : (canvasH - scaledH) / 2;
    const maxY = scaledH > canvasH ? 0 : (canvasH - scaledH) / 2;

    world.position.x = Math.max(minX, Math.min(maxX, world.position.x + dx));
    world.position.y = Math.max(minY, Math.min(maxY, world.position.y + dy));
  }, [contentBounds]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        ref={canvasRef}
        className="w-full h-full"
        style={{ backgroundColor: "#3A3A50" }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onPointerDown={handleEditorPointerDown}
        onPointerMove={handleEditorPointerMove}
        onPointerUp={handleEditorPointerUp}
        onPointerLeave={handleEditorPointerUp}
      />
      <ArrowController onPan={handlePan} />
    </div>
  );
}
