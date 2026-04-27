"use client";

import {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useState,
} from "react";

export interface OfficeGameHandle {
  setWorking: (teamId: string, working: boolean) => void;
  changeFloor: (floor: number) => void;
  addTeam: (teamId: string, teamName: string, emoji: string) => void;
  moveTeamToFloor: (teamId: string, targetFloor: number) => void;
  getTeamFloor: (teamId: string) => number | null;
  showBubble: (teamId: string, text: string, variant?: "loading" | "result" | "info") => void;
  clearBubble: (teamId: string) => void;
  walkCharToTeam: (fromId: string, toId: string) => void;
  walkCharToSpot: (teamId: string, gx: number, gy: number) => void;
  walkCharHome: (teamId: string) => void;
  showStatusBadge: (teamId: string, status: "complete" | "error" | "dispatching") => void;
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

  const stableCallback = useCallback(
    (teamId: string, screenX?: number, screenY?: number) => {
      onTeamClickRef.current(teamId, screenX, screenY);
    },
    []
  );

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
      const scene = sceneRef.current as {
        addTeam?: (id: string, name: string, emoji: string) => void;
      } | null;
      scene?.addTeam?.(teamId, teamName, emoji);
    },
    moveTeamToFloor: (teamId: string, targetFloor: number) => {
      const scene = sceneRef.current as {
        moveTeamToFloor?: (id: string, floor: number) => void;
      } | null;
      scene?.moveTeamToFloor?.(teamId, targetFloor);
    },
    showBubble: (
      teamId: string,
      text: string,
      variant: "loading" | "result" | "info" = "result"
    ) => {
      const scene = sceneRef.current as { showBubble?: (id: string, t: string, v?: string) => void } | null;
      scene?.showBubble?.(teamId, text, variant);
    },
    clearBubble: (teamId: string) => {
      const scene = sceneRef.current as { clearBubble?: (id: string) => void } | null;
      scene?.clearBubble?.(teamId);
    },
    walkCharToTeam: (fromId: string, toId: string) => {
      const scene = sceneRef.current as { walkCharToTeam?: (f: string, t: string) => void } | null;
      scene?.walkCharToTeam?.(fromId, toId);
    },
    walkCharToSpot: (teamId: string, gx: number, gy: number) => {
      const scene = sceneRef.current as {
        walkCharToSpot?: (id: string, gx: number, gy: number) => void;
      } | null;
      scene?.walkCharToSpot?.(teamId, gx, gy);
    },
    walkCharHome: (teamId: string) => {
      const scene = sceneRef.current as { walkCharHome?: (id: string) => void } | null;
      scene?.walkCharHome?.(teamId);
    },
    showStatusBadge: (teamId: string, status: "complete" | "error" | "dispatching") => {
      const scene = sceneRef.current as {
        showStatusBadge?: (id: string, s: "complete" | "error" | "dispatching") => void;
      } | null;
      scene?.showStatusBadge?.(teamId, status);
    },
    getTeamFloor: (teamId: string) => {
      const scene = sceneRef.current as { getTeamFloor?: (id: string) => number | null } | null;
      return scene?.getTeamFloor?.(teamId) ?? null;
    },
  }));

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    let destroyed = false;

    (async () => {
      const Phaser = await import("phaser");
      const { default: OfficeScene } = await import("./OfficeScene");
      // TODO: Import other scenes as needed (OutdoorScene, LoginScene, FortressScene)

      if (destroyed || !containerRef.current) return;

      // 날씨 fetch (실패해도 기본값 0으로)
      let weatherCode = 0;
      try {
        const res = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978&current=weather_code&timezone=Asia/Seoul"
        );
        const data = await res.json();
        weatherCode = data.current?.weather_code ?? 0;
      } catch {
        // Weather fetch failed, use default
      }

      if (destroyed || !containerRef.current) return;

      const scene = new OfficeScene();
      sceneRef.current = scene;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: 1024, // WORLD_W = 32 cols × 32px
        height: 736, // WORLD_H = 23 rows × 32px
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
        scene: [scene], // TODO: Add other scenes as needed
      });

      // Test/debug: global game reference
      if (typeof window !== "undefined") {
        (window as unknown as { __hqGame?: Phaser.Game }).__hqGame = game;
      }

      // Determine API base (for loading floor layout)
      const h = window.location.hostname;
      const isLocal = h === "localhost" || h.startsWith("192.168.");
      const apiBase = isLocal ? `http://${h}:8000` : "https://api.600g.net";

      game.scene.start("OfficeScene", {
        onTeamClick: stableCallback,
        weatherCode,
        apiBase,
      });
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
