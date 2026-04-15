import { Assets, Container, Sprite, Texture } from "pixi.js";
import { TileType, DEFAULT_WALL_SET_ID, type OfficeLayout } from "@/types/office-layout";
import {
  computeWallTiles,
  wallTileFilename,
  type WallVariant,
  type WallPart,
} from "@/lib/wall-autotile";

const TILE_SIZE = 32;
const TILE_BASE = "/tiles/office/";

/**
 * Extract the wall base ID from a wallSetId.
 * e.g., "wall_lavender_A" → "wall_lavender"
 *        "wall_gray_B"    → "wall_gray"
 */
function wallBaseId(wallSetId: string): string {
  const match = wallSetId.match(/^(.+)_[ABC]$/);
  return match ? match[1] : wallSetId;
}

/**
 * WallLayer: renders wall tiles with autotile logic.
 * Supports per-tile wall sets — each WALL cell can use a different wallSetId.
 */
export class WallLayer extends Container {
  private sprites: Sprite[] = [];
  /** Cache: "baseId/variant_part" → Texture */
  private textureCache = new Map<string, Texture>();
  private loadedBases = new Set<string>();

  constructor() {
    super();
    this.label = "wall-layer";
    this.zIndex = 1;
    this.sortableChildren = true;
  }

  private async ensureBaseLoaded(baseId: string) {
    if (this.loadedBases.has(baseId)) return;
    this.loadedBases.add(baseId);

    const variants: WallVariant[] = ["A", "B", "C"];
    const parts: WallPart[] = ["tl", "t", "tr", "l", "c", "r"];

    // Gap tiles are single images (e.g. wall_brick_gap.png), not autotile sets.
    // Load the single texture and map it to all variant/part combinations.
    if (baseId.includes("_gap")) {
      const singlePath = TILE_BASE + baseId + ".png";
      try {
        await Assets.load(singlePath);
        const tex = Assets.get(singlePath);
        if (tex) {
          tex.source.scaleMode = "nearest";
          for (const v of variants) {
            for (const p of parts) {
              this.textureCache.set(`${baseId}/${v}_${p}`, tex);
            }
          }
        } else {
        }
      } catch {
      }
      return;
    }

    const paths: string[] = [];
    for (const v of variants) {
      for (const p of parts) {
        paths.push(TILE_BASE + wallTileFilename(baseId, v, p));
      }
    }

    await Promise.allSettled(paths.map((p) => Assets.load(p)));
    let loaded = 0;
    let failed = 0;

    for (const v of variants) {
      for (const p of parts) {
        const filename = wallTileFilename(baseId, v, p);
        const path = TILE_BASE + filename;
        const tex = Assets.get(path);
        if (tex) {
          tex.source.scaleMode = "nearest";
          this.textureCache.set(`${baseId}/${v}_${p}`, tex);
          loaded++;
        } else {
          failed++;
        }
      }
    }
  }

  async rebuild(layout: OfficeLayout) {
    // Clear existing sprites
    for (const s of this.sprites) {
      this.removeChild(s);
      s.destroy();
    }
    this.sprites = [];

    const wallSetIds = layout.wallSetIds ?? [];

    // Collect unique wall base IDs used in layout
    const usedBases = new Set<string>();
    for (let i = 0; i < layout.tiles.length; i++) {
      if (layout.tiles[i] === TileType.WALL) {
        const setId = wallSetIds[i] || DEFAULT_WALL_SET_ID;
        usedBases.add(wallBaseId(setId));
      }
    }

    // Load all needed wall bases
    await Promise.all([...usedBases].map((b) => this.ensureBaseLoaded(b)));

    // Compute wall tile assignments
    const wallTiles = computeWallTiles(layout);

    for (const wt of wallTiles) {
      const idx = wt.row * layout.cols + wt.col;
      const setId = wallSetIds[idx] || DEFAULT_WALL_SET_ID;
      const base = wallBaseId(setId);

      const key = `${base}/${wt.variant}_${wt.part}`;
      let tex = this.textureCache.get(key);

      // Fallback: if B or C variant missing, use A
      if (!tex && wt.variant !== "A") {
        tex = this.textureCache.get(`${base}/A_${wt.part}`);
      }

      if (!tex) {
        continue;
      }

      const sprite = new Sprite(tex);
      sprite.position.set(wt.col * TILE_SIZE, wt.row * TILE_SIZE);
      sprite.width = TILE_SIZE;
      sprite.height = TILE_SIZE;
      sprite.zIndex = (wt.row + 1) * TILE_SIZE;
      this.addChild(sprite);
      this.sprites.push(sprite);
    }
  }
}
