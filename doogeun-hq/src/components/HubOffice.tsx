"use client";

import { useEffect, useRef } from "react";
import { useWeatherStore } from "@/components/Weather";

interface Props {
  floor: number;
  agentCount: number;
}

/**
 * Phaser 오피스 씬 + 날씨/시간 반영 (하늘 그라디언트 + 엠비언트 틴트).
 * 다음 세션에 실제 픽셀 캐릭터/가구 이식 예정. 현재는 바닥 그리드 + 하늘 오버레이.
 */
export default function HubOffice({ floor, agentCount }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<unknown>(null);
  const skyTop = useWeatherStore((s) => s.skyTop);
  const skyBottom = useWeatherStore((s) => s.skyBottom);
  const tod = useWeatherStore((s) => s.tod);
  const label = useWeatherStore((s) => s.label);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    let destroyed = false;
    (async () => {
      const Phaser = (await import("phaser")).default;
      class OfficeScene extends Phaser.Scene {
        skyGraphics!: Phaser.GameObjects.Graphics;
        constructor() { super("office"); }
        create() {
          const { width, height } = this.scale;
          // 바닥 그리드
          const g = this.add.graphics();
          g.lineStyle(1, 0x1a1a2e, 0.6);
          for (let x = 0; x < width; x += 32) g.lineBetween(x, 0, x, height);
          for (let y = 0; y < height; y += 32) g.lineBetween(0, y, width, y);
          // 상단 하늘(통창) — 세로 60px 그라디언트
          this.skyGraphics = this.add.graphics();
          this.redrawSky();
          // 중앙 텍스트
          this.add.text(width / 2, height / 2 - 10, `🏢 오피스 · 층 ${floor}`, {
            fontSize: "18px", color: "#93c5fd",
            fontFamily: "Pretendard Variable, system-ui, sans-serif", resolution: 4,
          }).setOrigin(0.5);
          this.add.text(width / 2, height / 2 + 16, `${agentCount}명 배치 · ${tod.toUpperCase()} · ${label}`, {
            fontSize: "12px", color: "#6b7280",
            fontFamily: "Pretendard Variable, system-ui, sans-serif", resolution: 4,
          }).setOrigin(0.5);
        }
        redrawSky() {
          const { width } = this.scale;
          const top = parseInt(skyTop.slice(1), 16);
          const bot = parseInt(skyBottom.slice(1), 16);
          this.skyGraphics.clear();
          // 간단 세로 그라디언트 — 여러 구간 fillRect
          const H = 72;
          for (let i = 0; i < H; i++) {
            const t = i / H;
            const r = Math.round(((top >> 16) & 255) * (1 - t) + ((bot >> 16) & 255) * t);
            const gn = Math.round(((top >> 8) & 255) * (1 - t) + ((bot >> 8) & 255) * t);
            const b = Math.round((top & 255) * (1 - t) + (bot & 255) * t);
            this.skyGraphics.fillStyle((r << 16) | (gn << 8) | b, 1);
            this.skyGraphics.fillRect(0, i, width, 1);
          }
        }
      }

      if (destroyed || !containerRef.current) return;
      const game = new Phaser.Game({
        type: Phaser.AUTO, parent: containerRef.current,
        width: 960, height: 420,
        backgroundColor: "transparent", pixelArt: false, antialias: true,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [OfficeScene],
      });
      gameRef.current = game;
    })();
    return () => {
      destroyed = true;
      const g = gameRef.current as { destroy?: (b: boolean) => void } | null;
      g?.destroy?.(true);
      gameRef.current = null;
    };
  }, [floor, agentCount, tod, label, skyTop, skyBottom]);

  return <div ref={containerRef} className="w-full h-full" />;
}
