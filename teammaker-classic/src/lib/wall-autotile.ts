import { TileType, type OfficeLayout } from "@/types/office-layout";

/**
 * Wall autotile system.
 *
 * Wall tiles in the asset set come in 3 variants (A/B/C) each with 6 parts:
 *   tl (top-left), t (top-center), tr (top-right)
 *   l  (left),     c (center),     r  (right)
 *
 * For a wall block, we need to determine:
 * 1. Horizontal position: left edge / center / right edge (based on E/W neighbors)
 * 2. Vertical position: top row / middle row / bottom row (based on N/S neighbors)
 *
 * The 3 wall set variants (A/B/C) map to vertical position:
 *   - No wall to the North (top edge) → variant A (top row tiles)
 *   - Has wall N and has wall S (middle) → variant B (middle row tiles)
 *   - Has wall N but no wall S (bottom edge) → variant C (bottom row tiles)
 *
 * Within each variant, the horizontal part:
 *   - No wall to the West (left edge) → tl / l
 *   - Has wall W and has wall E (center) → t / c
 *   - Has wall W but no wall E (right edge) → tr / r
 *
 * Since each variant only has a top row (tl/t/tr) and bottom row (l/c/r),
 * we use the top row for odd vertical positions within the variant and bottom
 * row for even ones, creating a 2-row repeating pattern.
 */

/** Check if a cell is a WALL tile */
function isWall(layout: OfficeLayout, col: number, row: number): boolean {
  if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows)
    return false;
  return layout.tiles[row * layout.cols + col] === TileType.WALL;
}

export type WallVariant = "A" | "B" | "C";
export type WallPart = "tl" | "t" | "tr" | "l" | "c" | "r";

export interface WallTileInfo {
  variant: WallVariant;
  part: WallPart;
  col: number;
  row: number;
}

/**
 * Determine which variant (A/B/C) a wall cell belongs to,
 * based on its vertical neighbors.
 */
function getVariant(layout: OfficeLayout, col: number, row: number): WallVariant {
  const hasN = isWall(layout, col, row - 1);
  const hasS = isWall(layout, col, row + 1);

  if (!hasN) return "A"; // Top edge
  if (hasN && hasS) return "B"; // Middle
  return "C"; // Bottom edge (has N, no S)
}

/**
 * Determine horizontal part within a variant.
 * We use the 2-row structure of each variant:
 * - First row within variant → tl / t / tr
 * - Subsequent rows → l / c / r
 */
function getPart(
  layout: OfficeLayout,
  col: number,
  row: number,
  variant: WallVariant
): WallPart {
  const hasW = isWall(layout, col - 1, row);
  const hasE = isWall(layout, col + 1, row);

  // Determine if this is the "top row" or "bottom row" within the variant
  // For A: always top row (tl/t/tr) since it's the topmost
  // For B/C: check if the cell above has same variant
  let isTopRow: boolean;
  if (variant === "A") {
    // Count how many wall rows up from the first non-wall
    // A variant = top of wall block. First row of A = top row, second = bottom row
    let offset = 0;
    let r = row;
    while (r >= 0 && isWall(layout, col, r) && getVariant(layout, col, r) === "A") {
      offset++;
      r--;
    }
    isTopRow = offset % 2 === 1; // first row (offset=1) = top
  } else if (variant === "C") {
    // C = bottom edge, always use bottom row (l/c/r)
    isTopRow = false;
  } else {
    // B = middle rows, alternate
    // Find distance from the first B row
    let offset = 0;
    let r = row;
    while (r >= 0 && isWall(layout, col, r) && getVariant(layout, col, r) === "B") {
      offset++;
      r--;
    }
    isTopRow = offset % 2 === 1;
  }

  if (isTopRow) {
    // Top row: tl / t / tr
    if (!hasW) return "tl";
    if (hasW && hasE) return "t";
    return "tr";
  } else {
    // Bottom row: l / c / r
    if (!hasW) return "l";
    if (hasW && hasE) return "c";
    return "r";
  }
}

/**
 * Compute wall tile info for all WALL cells in the layout.
 */
export function computeWallTiles(layout: OfficeLayout): WallTileInfo[] {
  const result: WallTileInfo[] = [];
  const { cols, rows, tiles } = layout;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r * cols + c] !== TileType.WALL) continue;
      const variant = getVariant(layout, c, r);
      const part = getPart(layout, c, r, variant);
      result.push({ variant, part, col: c, row: r });
    }
  }

  return result;
}

/**
 * Build the texture filename for a wall tile.
 * e.g., wallSetId="wall_lavender" + variant="A" + part="tl" → "wall_lavender_A_tl.png"
 */
export function wallTileFilename(
  wallSetId: string,
  variant: WallVariant,
  part: WallPart
): string {
  return `${wallSetId}_${variant}_${part}.png`;
}

/**
 * Get all unique texture filenames needed for a given wallSetId.
 */
export function getWallTextureFiles(wallSetId: string): string[] {
  const variants: WallVariant[] = ["A", "B", "C"];
  const parts: WallPart[] = ["tl", "t", "tr", "l", "c", "r"];
  const files: string[] = [];
  for (const v of variants) {
    for (const p of parts) {
      files.push(wallTileFilename(wallSetId, v, p));
    }
  }
  return files;
}
