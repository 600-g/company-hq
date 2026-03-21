"use client";

import { useEffect, useRef, useState } from "react";

export default function LoginGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    let destroyed = false;

    (async () => {
      const Phaser = await import("phaser");
      const { default: LoginScene } = await import("./LoginScene");

      if (destroyed || !containerRef.current) return;

      // 날씨
      let weatherCode = 0;
      try {
        const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978&current=weather_code&timezone=Asia/Seoul");
        const data = await res.json();
        weatherCode = data.current?.weather_code ?? 0;
      } catch {}

      if (destroyed || !containerRef.current) return;

      const scene = new LoginScene();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: 960,
        height: 540,
        pixelArt: true,
        antialias: false,
        antialiasGL: false,
        roundPixels: true,
        backgroundColor: "#1a1a2e",
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          zoom: dpr,
        },
        scene: scene,
      });

      game.scene.start("LoginScene", { weatherCode });
      gameRef.current = game;
      setLoading(false);
    })();

    return () => {
      destroyed = true;
      const game = gameRef.current as { destroy?: (b: boolean) => void } | null;
      game?.destroy?.(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e] z-10">
          <p className="text-sm text-gray-400">거리 로딩중...</p>
        </div>
      )}
    </div>
  );
}
