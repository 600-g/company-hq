"use client";

import { useEffect, useRef } from "react";

/**
 * Phaser 기반 픽셀 오피스 래퍼 (Option B 이식 진행 중).
 *
 * 현재 상태: 빈 Scene 으로 렌더 검증만. 실제 OfficeScene.ts 이식은 Phase 0-c.
 * dynamic import 로 Phaser 는 CSR 에서만 로드 (SSR 시 window 참조 에러 회피).
 */
export default function OfficeGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    let destroyed = false;

    (async () => {
      const Phaser = (await import("phaser")).default;

      class BlankScene extends Phaser.Scene {
        constructor() { super("blank"); }
        create() {
          const { width, height } = this.scale;
          this.add.rectangle(width / 2, height / 2, width, height, 0x0f0f1f);
          this.add.text(width / 2, height / 2 - 10, "🏢 두근컴퍼니 픽셀 오피스", {
            fontSize: "18px", color: "#fbbf24",
            fontFamily: "Pretendard Variable, system-ui, sans-serif",
            resolution: 4,
          }).setOrigin(0.5);
          this.add.text(width / 2, height / 2 + 16, "Phaser 엔진 연결됨 · OfficeScene 이식 준비중", {
            fontSize: "12px", color: "#6b7280",
            fontFamily: "Pretendard Variable, system-ui, sans-serif",
            resolution: 4,
          }).setOrigin(0.5);
        }
      }

      if (destroyed || !containerRef.current) return;

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: 960,
        height: 540,
        backgroundColor: "transparent",
        pixelArt: false,
        antialias: true,
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        scene: [BlankScene],
      });

      gameRef.current = game;
    })();

    return () => {
      destroyed = true;
      const g = gameRef.current as { destroy?: (removeCanvas: boolean) => void } | null;
      g?.destroy?.(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-[960px] max-w-full h-[540px] border border-[#2a2a4a] rounded-lg bg-[#06060e] overflow-hidden"
    />
  );
}
