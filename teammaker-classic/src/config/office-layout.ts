/**
 * Office interior layout configuration.
 * Positions are in 32px tile units (not grid cells).
 * The furniture spritesheet is at /tiles/office/furniture.png
 */

/** Sprite region within the furniture spritesheet */
export interface SpriteRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A placed furniture item */
export interface FurnitureItem {
  sprite: string;
  /** Position in pixels */
  px: number;
  py: number;
  /** Optional scale (default 1) */
  scale?: number;
  /** z-index layer (default 2) */
  zIndex?: number;
}

/** Sprite regions within furniture.png */
export const FURNITURE_SPRITES: Record<string, SpriteRegion> = {
  desk_computer:    { x: 0,   y: 0,   w: 64,  h: 64  },
  desk_books:       { x: 64,  y: 0,   w: 64,  h: 64  },
  desk_front:       { x: 128, y: 0,   w: 64,  h: 64  },
  workstation_row:  { x: 192, y: 0,   w: 256, h: 32  },
  office_chair:     { x: 448, y: 0,   w: 32,  h: 64  },
  chair_front:      { x: 480, y: 0,   w: 32,  h: 32  },
  chair_side:       { x: 0,   y: 64,  w: 32,  h: 32  },
  chair_back:       { x: 32,  y: 64,  w: 32,  h: 32  },
  bulletin_board:   { x: 64,  y: 64,  w: 64,  h: 64  },
  blackboard:       { x: 128, y: 64,  w: 64,  h: 64  },
  whiteboard:       { x: 192, y: 64,  w: 64,  h: 64  },
  filing_cabinet_1: { x: 256, y: 64,  w: 64,  h: 64  },
  filing_cabinet_2: { x: 320, y: 64,  w: 64,  h: 64  },
  partition_wood:   { x: 384, y: 64,  w: 64,  h: 96  },
  partition_metal:  { x: 448, y: 64,  w: 64,  h: 96  },
  vending_machine:  { x: 0,   y: 160, w: 32,  h: 64  },
  water_cooler:     { x: 32,  y: 160, w: 32,  h: 64  },
  server_fridge:    { x: 64,  y: 160, w: 32,  h: 64  },
  sofa_green:       { x: 96,  y: 160, w: 64,  h: 64  },
  sofa_yellow:      { x: 160, y: 160, w: 96,  h: 32  },
  globe_1:          { x: 256, y: 160, w: 32,  h: 64  },
  frame_1:          { x: 288, y: 160, w: 32,  h: 32  },
  frame_2:          { x: 320, y: 160, w: 32,  h: 32  },
  desk_lamp:        { x: 352, y: 160, w: 32,  h: 64  },
  reception_desk:   { x: 384, y: 160, w: 96,  h: 96  },
  projection_screen:{ x: 0,   y: 256, w: 96,  h: 64  },
  counter_brown:    { x: 96,  y: 256, w: 128, h: 64  },
};

/**
 * Office layout: predefined furniture placement.
 * Coordinates are in pixels (32px tile aligned).
 * The canvas is rendered at 2x scale so these are "world" coords.
 */
export const OFFICE_LAYOUT: FurnitureItem[] = [
  // === WALL DECORATIONS (on or near the wall, row 0-3) ===
  // Whiteboard on wall
  { sprite: "whiteboard",       px: 64,   py: 32,  zIndex: 3 },
  // Bulletin board
  { sprite: "bulletin_board",   px: 192,  py: 32,  zIndex: 3 },
  // Picture frames
  { sprite: "frame_1",          px: 320,  py: 32,  zIndex: 3 },
  { sprite: "frame_2",          px: 352,  py: 32,  zIndex: 3 },
  // Projection screen
  { sprite: "projection_screen",px: 448,  py: 16,  zIndex: 3 },

  // === LEFT SIDE FURNITURE ===
  // Filing cabinets along left wall
  { sprite: "filing_cabinet_1", px: 0,    py: 128, zIndex: 4 },
  { sprite: "filing_cabinet_2", px: 0,    py: 192, zIndex: 4 },
  // Vending machine
  { sprite: "vending_machine",  px: 0,    py: 288, zIndex: 4 },

  // === RIGHT SIDE FURNITURE ===
  // Water cooler
  { sprite: "water_cooler",     px: 640,  py: 128, zIndex: 4 },
  // Server/fridge
  { sprite: "server_fridge",    px: 640,  py: 224, zIndex: 4 },

  // === BOTTOM AREA (break/lounge) ===
  // Green sofa
  { sprite: "sofa_green",       px: 64,   py: 416, zIndex: 5 },
  // Globe decorative
  { sprite: "globe_1",          px: 160,  py: 416, zIndex: 5 },

  // === WORK AREA (center) ===
  // Counter/reception
  { sprite: "counter_brown",    px: 416,  py: 384, zIndex: 5 },
];

/** Number of wall tile rows at the top (each 32px) */
export const WALL_ROWS = 3;
