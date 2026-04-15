import { AnimatedSprite, Assets, Container, Texture } from "pixi.js";
import { parseSpriteSheet, type Direction, type SpriteFrames } from "@/lib/sprite-parser";
import { getSpriteSheetUrl, type ActionType } from "@/lib/character-registry";
import { CHAR_SCALE } from "@/lib/grid";

const ANIM_SPEED = 0.12;

/**
 * A PixiJS Container that renders an animated pixel character.
 * Manages spritesheet loading, direction, and action switching.
 */
export class PixelCharacter extends Container {
  private charId: string;
  private sprite: AnimatedSprite | null = null;
  private frameCache: Map<string, SpriteFrames> = new Map();
  private currentAction: ActionType = "idle_anim";
  private currentDirection: Direction = "down";
  private spriteScale: number;

  constructor(charId: string, scale: number = CHAR_SCALE) {
    super();
    this.charId = charId;
    this.spriteScale = scale;
    this.label = `pixel-char-${charId}`;
  }

  /** Load a spritesheet and cache the parsed frames */
  private async loadFrames(action: ActionType): Promise<SpriteFrames | null> {
    const cacheKey = `${this.charId}:${action}`;
    if (this.frameCache.has(cacheKey)) {
      return this.frameCache.get(cacheKey)!;
    }

    const url = getSpriteSheetUrl(this.charId, action);
    try {
      const texture = await Assets.load(url);
      texture.source.scaleMode = "nearest";
      const frames = parseSpriteSheet(texture);
      this.frameCache.set(cacheKey, frames);
      return frames;
    } catch {
      return null;
    }
  }

  /** Set the character action and direction, loading frames as needed */
  async setAction(action: ActionType, direction?: Direction): Promise<void> {
    if (direction) this.currentDirection = direction;

    const frames = await this.loadFrames(action);
    if (!frames) {
      // Fallback to idle_anim if requested action unavailable
      if (action !== "idle_anim") {
        return this.setAction("idle_anim", direction);
      }
      return;
    }

    const dirFrames = frames.byDirection[this.currentDirection];
    if (!dirFrames || dirFrames.length === 0) return;

    this.currentAction = action;
    this.applyFrames(dirFrames);
  }

  /** Change direction only, keeping current action */
  async setDirection(direction: Direction): Promise<void> {
    if (direction === this.currentDirection) return;
    this.currentDirection = direction;
    await this.setAction(this.currentAction, direction);
  }

  /** Apply frames to the internal AnimatedSprite */
  private applyFrames(frames: Texture[]): void {
    const wasPlaying = this.sprite?.playing ?? true;

    if (this.sprite) {
      this.removeChild(this.sprite);
      this.sprite.destroy();
      this.sprite = null;
    }

    const anim = new AnimatedSprite(frames);
    anim.animationSpeed = ANIM_SPEED;
    anim.scale.set(this.spriteScale);
    anim.anchor.set(0.5, 1);

    if (wasPlaying) anim.play();

    this.addChild(anim);
    this.sprite = anim;
  }

  /** Initialize: load idle_anim and display */
  async init(): Promise<void> {
    await this.setAction("idle_anim", this.currentDirection);
  }

  get action(): ActionType {
    return this.currentAction;
  }

  get direction(): Direction {
    return this.currentDirection;
  }

  get playing(): boolean {
    return this.sprite?.playing ?? false;
  }

  play(): void {
    this.sprite?.play();
  }

  stop(): void {
    this.sprite?.stop();
  }
}
