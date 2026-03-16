"use client";

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useState } from "react";

export interface OfficeGameHandle {
  setWorking: (teamId: string, working: boolean) => void;
  changeFloor: (floor: number) => void;
}

interface Props {
  onTeamClick: (teamId: string) => void;
}

const OfficeGame = forwardRef<OfficeGameHandle, Props>(({ onTeamClick }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<unknown>(null);
  const sceneRef = useRef<unknown>(null);
  const onTeamClickRef = useRef(onTeamClick);
  const [loading, setLoading] = useState(true);
  onTeamClickRef.current = onTeamClick;

  const stableCallback = useCallback((teamId: string) => {
    onTeamClickRef.current(teamId);
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
  }));

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    let destroyed = false;

    (async () => {
      const Phaser = await import("phaser");
      const { default: OfficeScene } = await import("./OfficeScene");

      if (destroyed || !containerRef.current) return;

      const scene = new OfficeScene();
      sceneRef.current = scene;

      const dpr = window.devicePixelRatio || 1;
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: 832 * dpr,
        height: 576 * dpr,
        pixelArt: false,
        backgroundColor: "#1a1a2e",
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          zoom: 1 / dpr,
        },
        scene: scene,
      });

      game.scene.start("OfficeScene", { onTeamClick: stableCallback });
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
