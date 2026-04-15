import { Assets, Container, Graphics, Sprite, Texture, Rectangle } from "pixi.js";
import { TileType, type OfficeLayout, type TileSelection } from "@/types/office-layout";
import tileManifest from "@/../public/tiles/office/tile-manifest.json";

const TILE_SIZE = 32;
const TILE_BASE = "/tiles/office/";

/**
 * Maps TileType (FLOOR_1..FLOOR_7) to an index into floorSets.
 * We group by base pattern: lavender, gray, brick, pink each have 2 base + 4 checker variants.
 * FLOOR_1 → first floorSet pair, FLOOR_2 → second, etc.
 * For simplicity: FLOOR_N maps to floorSets index (N-2)*2 and (N-2)*2+1 (alternating pattern).
 * But since the user picks a floorSetId via TileSelector, we use that directly.
 */

/** Get the floor texture filename for a given floorSetId */
function getFloorTextureFile(floorSetId: string): string | null {
  const fs = tileManifest.floorSets.find((s) => s.id === floorSetId);
  return fs ? fs.tile : null;
}

/** Wall base color by wallSetId prefix */
const WALL_BASE_COLORS: Record<string, number> = {
  wall_lavender: 0xc8bfe0,
  wall_gray: 0xa0a0a0,
  wall_brick: 0xb09080,
  wall_pink: 0xe0b0b8,
};

function getWallColor(wallSetId: string): number {
  for (const [prefix, color] of Object.entries(WALL_BASE_COLORS)) {
    if (wallSetId.startsWith(prefix)) return color;
  }
  return 0xb0b0b0;
}

/**
 * FloorLayer: renders the tile grid (floor + wall base colors).
 * VOID tiles are skipped (transparent).
 * WALL tiles render as a solid color rectangle.
 * FLOOR_* tiles render the selected floor texture.
 */
export class FloorLayer extends Container {
  private floorTexture: Texture | null = null;
  private currentFloorSetId: string = "";
  private currentWallSetId: string = "";
  private sprites: (Sprite | Graphics)[] = [];

  constructor() {
    super();
    this.label = "floor-layer";
    this.zIndex = 0;
  }

  async rebuild(layout: OfficeLayout, tileSelection: TileSelection) {
    // Clear existing sprites
    for (const s of this.sprites) {
      this.removeChild(s);
      s.destroy();
    }
    this.sprites = [];

    // Load floor texture if needed
    if (tileSelection.floorSetId !== this.currentFloorSetId) {
      const file = getFloorTextureFile(tileSelection.floorSetId);
      if (file) {
        const path = TILE_BASE + file;
        try {
          await Assets.load(path);
          const tex = Assets.get(path);
          if (tex) tex.source.scaleMode = "nearest";
          this.floorTexture = tex ?? null;
        } catch {
          this.floorTexture = null;
        }
      }
      this.currentFloorSetId = tileSelection.floorSetId;
    }

    this.currentWallSetId = tileSelection.wallSetId;
    const wallColor = getWallColor(tileSelection.wallSetId);

    const { cols, rows, tiles } = layout;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const tileType = tiles[i];

        if (tileType === TileType.VOID) continue;

        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;

        if (tileType === TileType.WALL) {
          // Solid color rectangle for wall base
          const g = new Graphics();
          g.rect(0, 0, TILE_SIZE, TILE_SIZE);
          g.fill(wallColor);
          g.position.set(x, y);
          this.addChild(g);
          this.sprites.push(g);
        } else if (tileType >= TileType.FLOOR_1 && tileType <= TileType.FLOOR_7) {
          // Floor tile sprite
          if (this.floorTexture) {
            const sprite = new Sprite(this.floorTexture);
            sprite.position.set(x, y);
            sprite.width = TILE_SIZE;
            sprite.height = TILE_SIZE;
            this.addChild(sprite);
            this.sprites.push(sprite);
          } else {
            // Fallback: light gray rect
            const g = new Graphics();
            g.rect(0, 0, TILE_SIZE, TILE_SIZE);
            g.fill(0xe8e8e8);
            g.position.set(x, y);
            this.addChild(g);
            this.sprites.push(g);
          }
        }
      }
    }
  }
}
