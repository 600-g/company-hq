export const GRID_CELL = 64;
export const DESK_WIDTH_CELLS = 4;
export const DESK_HEIGHT_CELLS = 3;
export const DESK_WIDTH = DESK_WIDTH_CELLS * GRID_CELL; // 256px
export const DESK_HEIGHT = DESK_HEIGHT_CELLS * GRID_CELL; // 192px

export function snapToGrid(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(x / GRID_CELL) * GRID_CELL,
    y: Math.round(y / GRID_CELL) * GRID_CELL,
  };
}

export function pixelToGrid(px: number, py: number): { gx: number; gy: number } {
  return {
    gx: Math.floor(px / GRID_CELL),
    gy: Math.floor(py / GRID_CELL),
  };
}

export function gridToPixel(gx: number, gy: number): { x: number; y: number } {
  return {
    x: gx * GRID_CELL,
    y: gy * GRID_CELL,
  };
}

/** Shared character scale — single source of truth for all rendering & pathfinding */
export const CHAR_SCALE = 1;
const CHAR_W = 32 * CHAR_SCALE;
const CHAR_H = 64 * CHAR_SCALE;
const TILE_SIZE = 32;

/**
 * Convert agent grid position to occupied tile key (32px units).
 * Based on character's feet (bottom-center).
 * Returns the single tile coordinate where the character's feet are.
 */
export function agentOccKey(posX: number, posY: number): { gx: number; gy: number } {
  const feetPxX = posX * GRID_CELL + CHAR_W / 2;
  const feetPxY = posY * GRID_CELL + CHAR_H;
  return {
    gx: Math.floor(feetPxX / TILE_SIZE),
    gy: Math.floor(feetPxY / TILE_SIZE) - 1, // one tile above feet (where character body is)
  };
}

/**
 * Find empty chair positions where agents can be seated.
 * Returns fractional grid coords so the character's bottom aligns
 * with the chair's bottom and is horizontally centered on the chair.
 */
export function findEmptyChairPositions(
  layout: { furniture: { uid: string; type: string; col: number; row: number }[] },
  occupiedCells: Map<string, string>,
  count: number,
  getFurnitureDef: (id: string) => { widthCells?: number; heightCells?: number; isSeat?: boolean } | undefined,
): { x: number; y: number }[] {
  const TILE_PER_GRID = 2;
  const positions: { x: number; y: number }[] = [];
  const seen = new Set<string>();

  for (const item of layout.furniture) {
    const def = getFurnitureDef(item.type);
    if (!def?.isSeat) continue;

    // Pixel-precise alignment: character bottom → chair bottom, horizontally centered
    const chairW = (def.widthCells ?? 1) * TILE_SIZE;
    const chairBottomY = (item.row + (def.heightCells ?? 2)) * TILE_SIZE;
    const chairCenterX = item.col * TILE_SIZE + chairW / 2;

    // deskContainer.x + CHAR_W/2 = chairCenterX  →  x = (chairCenterX - CHAR_W/2) / GRID_CELL
    // deskContainer.y + CHAR_H   = chairBottomY   →  y = (chairBottomY - CHAR_H) / GRID_CELL
    const x = (chairCenterX - CHAR_W / 2) / GRID_CELL;
    const y = (chairBottomY - CHAR_H) / GRID_CELL;

    // Deduplicate by chair tile position (not grid key, which can merge adjacent chairs)
    const chairKey = `${item.col},${item.row}`;
    if (seen.has(chairKey)) continue;
    seen.add(chairKey);

    // Check occupiedCells using agentOccKey (same logic as occupyCell)
    // Also skip if we already assigned another chair with the same grid key in this batch
    const { gx, gy } = agentOccKey(x, y);
    const occKey = `${gx},${gy}`;
    if (occupiedCells.has(occKey) || seen.has(`occ:${occKey}`)) continue;
    seen.add(`occ:${occKey}`);

    positions.push({ x, y });
    if (positions.length >= count) return positions;
  }

  return positions;
}

/**
 * Find available positions on the floor for desk placement.
 * Returns grid coordinates (GRID_CELL=64px units) where a desk can fit
 * without overlapping walls, voids, or occupied cells.
 *
 * Layout tiles are 32px; grid cells are 64px (1 grid cell = 2x2 tiles).
 * Desk size: DESK_WIDTH_CELLS(4) x DESK_HEIGHT_CELLS(3) in grid cells
 *          = 8x6 tiles.
 */
export function findAvailablePositions(
  layout: { cols: number; rows: number; tiles: number[] },
  occupiedCells: Map<string, string>,
  count: number,
): { x: number; y: number }[] {
  const FLOOR_MIN = 2; // TileType.FLOOR_1
  const TILE_PER_GRID = 2; // GRID_CELL(64) / TILE_SZ(32)
  const deskTileW = DESK_WIDTH_CELLS * TILE_PER_GRID; // 8 tiles
  const deskTileH = DESK_HEIGHT_CELLS * TILE_PER_GRID; // 6 tiles
  const positions: { x: number; y: number }[] = [];

  // Max grid coords that fit in the layout
  const maxGridX = Math.floor((layout.cols - deskTileW) / TILE_PER_GRID);
  const maxGridY = Math.floor((layout.rows - deskTileH) / TILE_PER_GRID);

  for (let gy = 0; gy <= maxGridY; gy++) {
    for (let gx = 0; gx <= maxGridX; gx++) {
      const tileStartX = gx * TILE_PER_GRID;
      const tileStartY = gy * TILE_PER_GRID;

      // Check that all tiles under the desk area are floor
      let fits = true;
      for (let tr = 0; tr < deskTileH && fits; tr++) {
        for (let tc = 0; tc < deskTileW && fits; tc++) {
          const tileIdx = (tileStartY + tr) * layout.cols + (tileStartX + tc);
          if (layout.tiles[tileIdx] < FLOOR_MIN) {
            fits = false;
          }
        }
      }

      // Check occupiedCells (stored in 32px tile coordinates via agentOccKey)
      if (fits) {
        const occ = agentOccKey(gx, gy);
        if (occupiedCells.has(`${occ.gx},${occ.gy}`)) {
          fits = false;
        }
      }

      if (fits) {
        // No overlap with already-selected positions (1 grid cell gap)
        const overlaps = positions.some(
          (p) =>
            Math.abs(p.x - gx) < DESK_WIDTH_CELLS + 1 &&
            Math.abs(p.y - gy) < DESK_HEIGHT_CELLS + 1,
        );
        if (!overlaps) {
          positions.push({ x: gx, y: gy });
          if (positions.length >= count) return positions;
        }
      }
    }
  }

  return positions;
}
