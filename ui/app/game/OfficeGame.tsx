"use client";

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useState } from "react";

export interface OfficeGameHandle {
  setWorking: (teamId: string, working: boolean) => void;
  changeFloor: (floor: number) => void;
  addTeam: (teamId: string, teamName: string, emoji: string) => void;
}

interface Props {
  onTeamClick: (teamId: string, screenX?: number, screenY?: number) => void;
}

const OfficeGame = forwardRef<OfficeGameHandle, Props>(({ onTeamClick }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<unknown>(null);
  const sceneRef = useRef<unknown>(null);
  const onTeamClickRef = useRef(onTeamClick);
  const [loading, setLoading] = useState(true);
  onTeamClickRef.current = onTeamClick;

  const stableCallback = useCallback((teamId: string, screenX?: number, screenY?: number) => {
    onTeamClickRef.current(teamId, screenX, screenY);
  }, []);

  useImperativeHandle(ref, () => ({
    setWorking: (teamId: string, working: boolean) => {
      const scene = sceneRef.current as { setWorking?: (id: string, w: boolean) => void } | null;
      scene?.setWorking?.(teamId, working);
    },
    changeFloor: (floor: number) => {
      const scene = sceneRef.current as { changeFloor?: (f: number) => void } | null;
      scene?.changeFloor?.(floor);
    },
    addTeam: (teamId: string, teamName: string, emoji: string) => {
      const scene = sceneRef.current as { addTeam?: (id: string, name: string, emoji: string) => void } | null;
      scene?.addTeam?.(teamId, teamName, emoji);
    },
  }));

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    let destroyed = false;

    (async () => {
      const Phaser = await import("phaser");
      const { default: OfficeScene } = await import("./OfficeScene");

      if (destroyed || !containerRef.current) return;

      // 날씨 fetch (실패해도 기본값 0으로)
      let weatherCode = 0;
      try {
        const res = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978&current=weather_code&timezone=Asia/Seoul"
        );
        const data = await res.json();
        weatherCode = data.current?.weather_code ?? 0;
      } catch {}

      if (destroyed || !containerRef.current) return;

      const scene = new OfficeScene();
      sceneRef.current = scene;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: 832,
        height: 576,
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

      game.scene.start("OfficeScene", { onTeamClick: stableCallback, weatherCode });
      gameRef.current = game;
      setLoading(false);
    })();

    return () => {
      destroyed = true;
      const game = gameRef.current as { destroy?: (b: boolean) => void } | null;
      game?.destroy?.(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, [stableCallback]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e] z-10">
          <div className="text-center">
            <div className="text-4xl mb-3">🏢</div>
            <p className="text-sm text-gray-400">사무실 로딩중...</p>
          </div>
        </div>
      )}
    </div>
  );
});

OfficeGame.displayName = "OfficeGame";
export default OfficeGame;
