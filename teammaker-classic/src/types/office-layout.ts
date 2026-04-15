/** Tile type enum for the layout grid */
export enum TileType {
  VOID = 0,
  WALL = 1,
  FLOOR_1 = 2,
  FLOOR_2 = 3,
  FLOOR_3 = 4,
  FLOOR_4 = 5,
  FLOOR_5 = 6,
  FLOOR_6 = 7,
  FLOOR_7 = 8,
}

/** HSB + Contrast color for floor tile colorization */
export interface FloorColor {
  h: number; // Hue 0-360
  s: number; // Saturation 0-1
  b: number; // Brightness 0-1
  contrast: number; // Contrast adjustment -1 to 1
}

/** A furniture item placed on the layout */
export interface PlacedFurniture {
  uid: string;
  type: string; // furniture catalog ID
  col: number;
  row: number;
  /** Rotation in 90° increments: 0, 1 (90°), 2 (180°), 3 (270°) */
  rotation?: number;
  /** Manual z-order offset (higher = rendered on top) */
  zOrder?: number;
  color?: string;
}

/** The complete office layout data (serializable) */
export interface OfficeLayout {
  version: 1;
  cols: number;
  rows: number;
  tiles: TileType[];
  tileColors: FloorColor[];
  /** Per-tile wall set ID (only meaningful for WALL tiles) */
  wallSetIds: string[];
  furniture: PlacedFurniture[];
}

/** Editor interaction modes */
export type EditorMode = "view" | "floor" | "wall" | "divider" | "furniture" | "eraser";

/** Currently selected wall/floor tile set */
export interface TileSelection {
  wallSetId: string;
  floorSetId: string;
  /** Which floor TileType to paint (FLOOR_1..FLOOR_7) */
  floorTileType: TileType;
  /** Currently selected divider tile ID (furniture catalog) */
  dividerTileId: string;
  /** Currently selected wall tile ID (furniture catalog) */
  wallTileId: string;
  /** Currently selected floor tile ID (furniture catalog) */
  floorTileId: string;
}

/** Default floor color (neutral gray) */
export const DEFAULT_FLOOR_COLOR: FloorColor = {
  h: 0,
  s: 0,
  b: 1,
  contrast: 0,
};

export const DEFAULT_WALL_SET_ID = "wall_lavender_A";

/** Create a default layout */
export function createDefaultLayout(
  cols = 14,
  rows = 12,
  wallRows = 2
): OfficeLayout {
  const total = cols * rows;
  const tiles: TileType[] = new Array(total);
  const tileColors: FloorColor[] = new Array(total);
  const wallSetIds: string[] = new Array(total).fill("");

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      tiles[i] = r < wallRows ? TileType.WALL : TileType.FLOOR_1;
      tileColors[i] = { ...DEFAULT_FLOOR_COLOR };
      if (r < wallRows) wallSetIds[i] = DEFAULT_WALL_SET_ID;
    }
  }

  return {
    version: 1,
    cols,
    rows,
    tiles,
    tileColors,
    wallSetIds,
    furniture: [],
  };
}
