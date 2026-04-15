import { TileType, type OfficeLayout } from "@/types/office-layout";
import { type FurnitureDef, getFurnitureDef } from "@/config/furniture-catalog";

export interface PlacementResult {
  valid: boolean;
  reason?: string;
}

/**
 * Check if a furniture item can be placed at the given grid position.
 */
export function canPlaceFurniture(
  layout: OfficeLayout,
  def: FurnitureDef,
  col: number,
  row: number
): PlacementResult {
  const { cols, rows, tiles } = layout;

  // 1. Range check
  if (col < 0 || row < 0 || col + def.widthCells > cols || row + def.heightCells > rows) {
    return { valid: false, reason: "Out of bounds" };
  }

  // 2. Tile type check
  for (let r = row; r < row + def.heightCells; r++) {
    for (let c = col; c < col + def.widthCells; c++) {
      const tileType = tiles[r * cols + c];

      // Dividers and tiles can be placed anywhere (including VOID)
      if (tileType === TileType.VOID && def.category !== "divider" && def.category !== "wall_tile" && def.category !== "floor_tile") {
        return { valid: false, reason: "Cannot place on void" };
      }

      // All furniture can be placed on walls
    }
  }

  // Furniture can overlap — later placed items render on top
  return { valid: true };
}

/**
 * Build a set of blocked tile coordinates from furniture placement.
 * Returns a Set of "col,row" strings.
 */
export function getBlockedTiles(layout: OfficeLayout): Set<string> {
  const blocked = new Set<string>();

  for (const placed of layout.furniture) {
    const def = getFurnitureDef(placed.type);
    if (!def) continue;

    for (let r = placed.row; r < placed.row + def.heightCells; r++) {
      for (let c = placed.col; c < placed.col + def.widthCells; c++) {
        blocked.add(`${c},${r}`);
      }
    }
  }

  return blocked;
}
