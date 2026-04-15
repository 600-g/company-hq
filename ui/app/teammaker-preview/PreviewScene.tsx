"use client";
import { useEffect, useRef } from "react";

const TILE = 32;

interface Layout {
  version: number;
  cols: number;
  rows: number;
  tiles: number[]; // 0=void, 1=wall, 2=floor
  furniture: { uid: string; type: string; col: number; row: number }[];
}

export default function PreviewScene() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<unknown>(null);

  useEffect(() => {
    let destroyed = false;

    (async () => {
      if (!hostRef.current || gameRef.current) return;
      const Phaser = await import("phaser");

      // 레이아웃 로드
      const layoutRes = await fetch("/assets/teammaker/layouts/default.json");
      const layout: Layout = await layoutRes.json();

      // 쓰는 가구 타입만 추려서 프리로드
      const furnitureTypes = Array.from(new Set(layout.furniture.map((f) => f.type)));

      class Scene extends Phaser.Scene {
        constructor() {
          super({ key: "TMPreview" });
        }
        preload() {
          // 기본 타일
          this.load.image("tm_floor", "/assets/teammaker/tiles/floor.png");
          this.load.image("tm_wall_body", "/assets/teammaker/tiles/wall_body.png");
          this.load.image("tm_wall_top", "/assets/teammaker/tiles/wall_top.png");
          this.load.image("tm_wall_bottom", "/assets/teammaker/tiles/wall_bottom.png");
          // 가구
          for (const type of furnitureTypes) {
            this.load.image(`tm_${type}`, `/assets/teammaker/tiles/office/${type}.png`);
          }
          this.load.on("loaderror", (file: { key?: string; src?: string }) => {
            console.warn("[tm-preview] missing asset", file.key, file.src);
          });
        }
        create() {
          const worldW = layout.cols * TILE;
          const worldH = layout.rows * TILE;

          this.cameras.main.setBackgroundColor(0x101020);
          this.cameras.main.setBounds(-64, -64, worldW + 128, worldH + 128);
          this.cameras.main.roundPixels = true;
          this.cameras.main.centerOn(worldW / 2, worldH / 2);

          // 타일 베이스 레이어
          for (let r = 0; r < layout.rows; r++) {
            for (let c = 0; c < layout.cols; c++) {
              const idx = r * layout.cols + c;
              const tile = layout.tiles[idx];
              if (tile === 0) continue; // void
              const key = tile === 1 ? "tm_wall_body" : "tm_floor";
              if (!this.textures.exists(key)) continue;
              const img = this.add.image(c * TILE, r * TILE, key).setOrigin(0, 0).setDepth(1);
              img.setDisplaySize(TILE, TILE);
            }
          }

          // 가구 레이어
          for (const f of layout.furniture) {
            const key = `tm_${f.type}`;
            if (!this.textures.exists(key)) continue;
            this.add.image(f.col * TILE, f.row * TILE, key)
              .setOrigin(0, 0)
              .setDepth(10 + f.row); // y-sort
          }

          // 드래그 팬
          let dragging = false;
          let startX = 0, startY = 0, camStartX = 0, camStartY = 0;
          this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
            dragging = true;
            startX = p.x; startY = p.y;
            camStartX = this.cameras.main.scrollX;
            camStartY = this.cameras.main.scrollY;
          });
          this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
            if (!dragging) return;
            this.cameras.main.scrollX = camStartX - (p.x - startX);
            this.cameras.main.scrollY = camStartY - (p.y - startY);
          });
          this.input.on("pointerup", () => { dragging = false; });

          // 휠 줌
          this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => {
            const z = this.cameras.main.zoom;
            const newZ = Math.max(0.25, Math.min(2.5, z - dy * 0.001));
            this.cameras.main.setZoom(newZ);
          });
        }
      }

      const hostW = hostRef.current.clientWidth || 1200;
      const hostH = Math.min(720, window.innerHeight - 140);

      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: hostW,
        height: hostH,
        parent: hostRef.current,
        backgroundColor: "#101020",
        scene: [Scene],
        pixelArt: false,
        antialias: true,
        render: { pixelArt: false, antialias: true },
      };

      if (destroyed) return;
      gameRef.current = new Phaser.Game(config);
    })();

    return () => {
      destroyed = true;
      const g = gameRef.current as { destroy?: (_: boolean) => void } | null;
      if (g?.destroy) g.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="w-full rounded-md overflow-hidden border border-[#2a2a5a] bg-[#0a0a14]"
      style={{ minHeight: 480 }}
    />
  );
}
