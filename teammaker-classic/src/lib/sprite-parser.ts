import { Rectangle, Texture } from "pixi.js";

export const FRAME_W = 32;
export const FRAME_H = 64;

export type Direction = "down" | "up" | "left" | "right";

/** Direction order in spritesheets: right, up, left, down */
const DIRECTION_ORDER: Direction[] = ["right", "up", "left", "down"];

export interface SpriteFrames {
  /** All frames in order */
  all: Texture[];
  /** Frames grouped by direction */
  byDirection: Record<Direction, Texture[]>;
  /** Frames per direction */
  framesPerDirection: number;
}

/**
 * Parse a single-row spritesheet (32×64 frames) into directional frame groups.
 * Sheets are laid out as: [right × N] [up × N] [left × N] [down × N]
 */
export function parseSpriteSheet(baseTexture: Texture): SpriteFrames {
  const totalFrames = Math.floor(baseTexture.width / FRAME_W);
  const framesPerDirection = Math.floor(totalFrames / 4);

  const all: Texture[] = [];
  const byDirection: Record<Direction, Texture[]> = {
    down: [],
    up: [],
    left: [],
    right: [],
  };

  for (let i = 0; i < totalFrames; i++) {
    const frame = new Texture({
      source: baseTexture.source,
      frame: new Rectangle(i * FRAME_W, 0, FRAME_W, FRAME_H),
    });
    all.push(frame);

    const dirIndex = Math.floor(i / framesPerDirection);
    const dir = DIRECTION_ORDER[dirIndex];
    if (dir) {
      byDirection[dir].push(frame);
    }
  }

  return { all, byDirection, framesPerDirection };
}
