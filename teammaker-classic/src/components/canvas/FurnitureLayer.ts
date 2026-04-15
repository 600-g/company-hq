import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";
import { type OfficeLayout } from "@/types/office-layout";
import { getFurnitureDef } from "@/config/furniture-catalog";

const TILE_SIZE = 32;
const FURNITURE_TEXTURE_PATH = "/tiles/office/furniture-sheet.png";

/**
 * FurnitureLayer: renders placed furniture from the layout data.
 * Each furniture sprite is Z-sorted by its bottom edge row.
 */
export class FurnitureLayer extends Container {
  private sprites: Sprite[] = [];
  private textureCache = new Map<string, Texture>();

  constructor() {
    super();
    this.label = "furniture-layer";
    this.zIndex = 2;
    this.sortableChildren = true;
    this.eventMode = "static";
  }

  private async getBaseTexture(path: string): Promise<Texture | null> {
    if (this.textureCache.has(path)) return this.textureCache.get(path)!;
    try {
      await Assets.load(path);
      const tex = Assets.get(path);
      if (tex) {
        tex.source.scaleMode = "nearest";
        this.textureCache.set(path, tex);
        return tex;
      }
    } catch { /* ignore */ }
    return null;
  }

  async rebuild(layout: OfficeLayout) {
    // Clear existing sprites
    for (const s of this.sprites) {
      this.removeChild(s);
      s.destroy();
    }
    this.sprites = [];

    for (let i = 0; i < layout.furniture.length; i++) {
      const placed = layout.furniture[i];
      const def = getFurnitureDef(placed.type);
      if (!def) { continue; }

      const sheetPath = def.sheetPath ?? FURNITURE_TEXTURE_PATH;
      const baseTex = await this.getBaseTexture(sheetPath);
      if (!baseTex) { continue; }

      const frame = new Rectangle(
        def.sprite.x,
        def.sprite.y,
        def.sprite.w,
        def.sprite.h
      );

      const tex = new Texture({
        source: baseTex.source,
        frame,
      });

      const sprite = new Sprite(tex);
      const rot = (placed.rotation ?? 0) % 4;
      const cellW = def.widthCells * TILE_SIZE;
      const cellH = def.heightCells * TILE_SIZE;

      sprite.width = cellW;
      sprite.height = cellH;
      sprite.label = `furniture-${placed.uid}`;

      // Apply rotation around center of the tile area
      if (rot === 0) {
        sprite.position.set(placed.col * TILE_SIZE, placed.row * TILE_SIZE);
        sprite.anchor.set(0, 0);
        sprite.rotation = 0;
      } else if (rot === 1) {
        // 90° CW: pivot at top-right
        sprite.position.set(placed.col * TILE_SIZE + cellH, placed.row * TILE_SIZE);
        sprite.anchor.set(0, 0);
        sprite.rotation = Math.PI / 2;
      } else if (rot === 2) {
        // 180°: pivot at bottom-right
        sprite.position.set(placed.col * TILE_SIZE + cellW, placed.row * TILE_SIZE + cellH);
        sprite.anchor.set(0, 0);
        sprite.rotation = Math.PI;
      } else {
        // 270° CW: pivot at bottom-left
        sprite.position.set(placed.col * TILE_SIZE, placed.row * TILE_SIZE + cellW);
        sprite.anchor.set(0, 0);
        sprite.rotation = (3 * Math.PI) / 2;
      }

      // Z-sort: floor/wall tiles at bottom, dividers on top, then by manual zOrder, then by bottom edge + placement order
      const isTileLayer = def.category === "floor_tile" || def.category === "wall_tile";
      const isDivider = def.category === "divider";
      const baseZ = isTileLayer ? -10000 : isDivider ? 10000 : 0;
      const manualZ = (placed.zOrder ?? 0) * 1000;
      sprite.zIndex = baseZ + manualZ + (placed.row + def.heightCells) * TILE_SIZE + i * 0.001;

      this.addChild(sprite);
      this.sprites.push(sprite);
    }
  }
}
