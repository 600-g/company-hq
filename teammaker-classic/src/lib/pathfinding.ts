import { TileType } from "@/types/office-layout";
import type { OfficeLayout } from "@/types/office-layout";
import type { PlacedFurniture } from "@/types/office-layout";
import { getFurnitureDef, WALKABLE_CATEGORIES } from "@/config/furniture-catalog";

interface Node {
  x: number;
  y: number;
  g: number; // cost from start
  h: number; // heuristic to end
  f: number; // g + h
  parent: Node | null;
}

export const TILE_SIZE = 32;
const TILE_PER_GRID = 2; // 64px grid / 32px tile

/** Check if a single tile (32px) is walkable */
function isTileWalkable(
  layout: OfficeLayout,
  tx: number,
  ty: number,
): boolean {
  if (tx < 0 || tx >= layout.cols || ty < 0 || ty >= layout.rows) return false;
  const idx = ty * layout.cols + tx;
  return layout.tiles[idx] >= TileType.FLOOR_1;
}

/**
 * Build a set of tiles blocked by non-walkable furniture.
 * Returns tile coordinates (32px units).
 */
export function buildBlockedCells(furniture: PlacedFurniture[]): Set<string> {
  const blocked = new Set<string>();

  for (const item of furniture) {
    const def = getFurnitureDef(item.type);
    if (!def) continue;
    if (WALKABLE_CATEGORIES.has(def.category)) continue;

    for (let tr = 0; tr < def.heightCells; tr++) {
      for (let tc = 0; tc < def.widthCells; tc++) {
        blocked.add(`${item.col + tc},${item.row + tr}`);
      }
    }
  }

  return blocked;
}

/**
 * Build a set of tiles covered by walkable furniture (chairs, floor_decor, etc.).
 * Used as soft penalty in pathfinding — prefer open floor over furniture.
 */
export function buildSoftBlockedCells(furniture: PlacedFurniture[]): Set<string> {
  const soft = new Set<string>();

  for (const item of furniture) {
    const def = getFurnitureDef(item.type);
    if (!def) continue;
    if (!WALKABLE_CATEGORIES.has(def.category)) continue;

    for (let tr = 0; tr < def.heightCells; tr++) {
      for (let tc = 0; tc < def.widthCells; tc++) {
        soft.add(`${item.col + tc},${item.row + tr}`);
      }
    }
  }

  return soft;
}

/** Check if a tile is blocked (unwalkable or has blocking furniture) */
export function isTileBlocked(
  layout: OfficeLayout,
  tx: number,
  ty: number,
  blockedCells: Set<string>,
): boolean {
  return !isTileWalkable(layout, tx, ty) || blockedCells.has(`${tx},${ty}`);
}

/**
 * Find nearest free tile via BFS.
 * When preferToward is provided, among all free tiles at the same BFS distance,
 * picks the one closest to preferToward (e.g. the source agent).
 */
export function findNearestFree(
  layout: OfficeLayout,
  tx: number,
  ty: number,
  blockedCells: Set<string>,
  preferToward?: { x: number; y: number },
): { x: number; y: number } {
  const maxTx = layout.cols;
  const maxTy = layout.rows;
  const key = (x: number, y: number) => `${x},${y}`;
  const originKey = key(tx, ty);
  const visited = new Set<string>();
  const dist = new Map<string, number>();
  const queue: { x: number; y: number }[] = [{ x: tx, y: ty }];
  visited.add(originKey);
  dist.set(originKey, 0);

  // Collect all free tiles at the minimum BFS distance
  let minDist = Infinity;
  const candidates: { x: number; y: number }[] = [];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curDist = dist.get(key(cur.x, cur.y))!;

    // If we already found candidates and this is farther, stop
    if (curDist > minDist) break;

    if (isTileWalkable(layout, cur.x, cur.y) && !blockedCells.has(key(cur.x, cur.y))) {
      if (curDist < minDist) {
        minDist = curDist;
        candidates.length = 0;
      }
      candidates.push(cur);
    }

    for (const dir of DIRS) {
      const nx = cur.x + dir.dx;
      const ny = cur.y + dir.dy;
      const nk = key(nx, ny);
      if (nx >= 0 && nx < maxTx && ny >= 0 && ny < maxTy && !visited.has(nk)) {
        // Only expand through walkable tiles (except origin which may be blocked)
        if (nk !== originKey && (!isTileWalkable(layout, nx, ny) || blockedCells.has(nk))) {
          visited.add(nk);
          continue;
        }
        visited.add(nk);
        dist.set(nk, curDist + 1);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  if (candidates.length === 0) return { x: tx, y: ty };
  if (candidates.length === 1 || !preferToward) return candidates[0];

  // Pick the candidate closest to preferToward
  let best = candidates[0];
  let bestDist = Math.abs(best.x - preferToward.x) + Math.abs(best.y - preferToward.y);
  for (let i = 1; i < candidates.length; i++) {
    const d = Math.abs(candidates[i].x - preferToward.x) + Math.abs(candidates[i].y - preferToward.y);
    if (d < bestDist) {
      bestDist = d;
      best = candidates[i];
    }
  }
  return best;
}

/** 8-directional neighbors (cardinal + diagonal) */
const SQRT2 = Math.SQRT2;
const DIRS = [
  { dx: 0, dy: -1, cost: 1 },      // up
  { dx: 0, dy: 1, cost: 1 },       // down
  { dx: -1, dy: 0, cost: 1 },      // left
  { dx: 1, dy: 0, cost: 1 },       // right
  { dx: -1, dy: -1, cost: SQRT2 }, // up-left
  { dx: 1, dy: -1, cost: SQRT2 },  // up-right
  { dx: -1, dy: 1, cost: SQRT2 },  // down-left
  { dx: 1, dy: 1, cost: SQRT2 },   // down-right
];

/**
 * A* pathfinding on the tile level (32px tiles).
 *
 * @param layout     Office layout with tile data
 * @param occupied   Set of "tx,ty" strings for occupied tiles
 * @param startTx    Start tile X
 * @param startTy    Start tile Y
 * @param endTx      End tile X
 * @param endTy      End tile Y
 * @param skipOccupied Set of "tx,ty" to treat as walkable (start/end agent positions)
 * @param blockedCells Set of "tx,ty" blocked by furniture
 * @returns Array of {x, y} tile coords from start to end, or null if no path
 */
export function findPath(
  layout: OfficeLayout,
  occupied: Map<string, string>,
  _startTx: number,
  _startTy: number,
  _endTx: number,
  _endTy: number,
  skipOccupied: Set<string> = new Set(),
  blockedCells: Set<string> = new Set(),
  softBlockedCells: Set<string> = new Set(),
): { x: number; y: number }[] | null {
  const maxTx = layout.cols;
  const maxTy = layout.rows;

  const key = (x: number, y: number) => `${x},${y}`;

  // Quick check: start or end out of bounds
  if (_startTx < 0 || _startTx >= maxTx || _startTy < 0 || _startTy >= maxTy) return null;
  if (_endTx < 0 || _endTx >= maxTx || _endTy < 0 || _endTy >= maxTy) return null;

  let startTx = _startTx;
  let startTy = _startTy;
  let endTx = _endTx;
  let endTy = _endTy;

  // If start or end is on a blocked/unwalkable tile, snap to nearest free tile via BFS
  function findNearestFreeTile(tx: number, ty: number): { x: number; y: number } {
    const visited = new Set<string>();
    const queue: { x: number; y: number }[] = [{ x: tx, y: ty }];
    visited.add(key(tx, ty));
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (isTileWalkable(layout, cur.x, cur.y)
        && !blockedCells.has(key(cur.x, cur.y))) {
        return cur;
      }
      for (const dir of DIRS) {
        const nx = cur.x + dir.dx;
        const ny = cur.y + dir.dy;
        const nk = key(nx, ny);
        if (nx >= 0 && nx < maxTx && ny >= 0 && ny < maxTy && !visited.has(nk)) {
          visited.add(nk);
          queue.push({ x: nx, y: ny });
        }
      }
    }
    return { x: tx, y: ty }; // fallback
  }

  const startBlocked = !isTileWalkable(layout, startTx, startTy) || blockedCells.has(key(startTx, startTy));
  const endBlocked = !isTileWalkable(layout, endTx, endTy) || blockedCells.has(key(endTx, endTy));
  if (startBlocked) {
    const free = findNearestFreeTile(startTx, startTy);
    startTx = free.x;
    startTy = free.y;
  }
  if (endBlocked) {
    const free = findNearestFreeTile(endTx, endTy);
    endTx = free.x;
    endTy = free.y;
  }

  const open: Node[] = [];
  const closed = new Set<string>();

  // Octile distance heuristic (optimal for 8-directional movement)
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - endTx);
    const dy = Math.abs(y - endTy);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };

  const startNode: Node = {
    x: startTx,
    y: startTy,
    g: 0,
    h: h(startTx, startTy),
    f: h(startTx, startTy),
    parent: null,
  };
  open.push(startNode);

  // Track best g-score per tile to avoid reprocessing
  const gScore = new Map<string, number>();
  gScore.set(key(startTx, startTy), 0);

  let iterations = 0;
  const MAX_ITERATIONS = 5000;

  while (open.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;

    // Find node with lowest f
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const current = open[bestIdx];
    open.splice(bestIdx, 1);

    const ck = key(current.x, current.y);
    if (closed.has(ck)) continue;
    closed.add(ck);

    // Reached the goal
    if (current.x === endTx && current.y === endTy) {
      const path: { x: number; y: number }[] = [];
      let node: Node | null = current;
      while (node) {
        path.push({ x: node.x, y: node.y });
        node = node.parent;
      }
      path.reverse();

      return path;
    }

    for (const dir of DIRS) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      const nk = key(nx, ny);

      if (nx < 0 || nx >= maxTx || ny < 0 || ny >= maxTy) continue;
      if (closed.has(nk)) continue;

      // Skip cells bypass ALL blocking checks (tiles, furniture, occupied)
      if (!skipOccupied.has(nk)) {
        if (!isTileWalkable(layout, nx, ny)) continue;
        if (blockedCells.has(nk)) continue;
        // occupiedCells now uses tile coords (32px) directly
        if (occupied.has(nk)) continue;
      }

      // Prevent diagonal corner-cutting: both adjacent cardinal cells must be passable
      if (dir.dx !== 0 && dir.dy !== 0) {
        const adjAKey = key(current.x + dir.dx, current.y);
        const adjBKey = key(current.x, current.y + dir.dy);
        const isBlocked = (k: string, cx: number, cy: number) =>
          !skipOccupied.has(k) && (
            !isTileWalkable(layout, cx, cy) || blockedCells.has(k) || occupied.has(k)
          );
        if (isBlocked(adjAKey, current.x + dir.dx, current.y) ||
            isBlocked(adjBKey, current.x, current.y + dir.dy)) continue;
      }

      const SOFT_PENALTY = 5;
      const penalty = softBlockedCells.has(nk) ? SOFT_PENALTY : 0;
      const tentativeG = current.g + dir.cost + penalty;
      const prevG = gScore.get(nk);
      if (prevG !== undefined && tentativeG >= prevG) continue;

      gScore.set(nk, tentativeG);
      const hVal = h(nx, ny);
      open.push({
        x: nx,
        y: ny,
        g: tentativeG,
        h: hVal,
        f: tentativeG + hVal,
        parent: current,
      });
    }
  }

  return null; // No path found
}

/**
 * Convert a tile-coordinate path to pixel waypoints.
 */
export function pathToPixelWaypoints(
  path: { x: number; y: number }[],
  offsetX: number,
  offsetY: number,
): { x: number; y: number }[] {
  return path.map((p) => ({
    x: p.x * TILE_SIZE + offsetX,
    y: p.y * TILE_SIZE + offsetY,
  }));
}

/**
 * Calculate total pixel distance along a path of waypoints.
 */
export function pathDistance(waypoints: { x: number; y: number }[]): number {
  let dist = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const dx = waypoints[i].x - waypoints[i - 1].x;
    const dy = waypoints[i].y - waypoints[i - 1].y;
    dist += Math.sqrt(dx * dx + dy * dy);
  }
  return dist;
}
