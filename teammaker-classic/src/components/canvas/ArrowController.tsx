"use client";

import { useCallback, useRef, useEffect } from "react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const PAN_SPEED = 8;
const PAN_INTERVAL = 16; // ~60fps

type Direction = "up" | "down" | "left" | "right";

interface ArrowControllerProps {
  onPan: (dx: number, dy: number) => void;
}

export function ArrowController({ onPan }: ArrowControllerProps) {
  const intervalRef = useRef<number | null>(null);

  const startPan = useCallback(
    (dir: Direction) => {
      if (intervalRef.current) return;
      const move = () => {
        const dx = dir === "left" ? PAN_SPEED : dir === "right" ? -PAN_SPEED : 0;
        const dy = dir === "up" ? PAN_SPEED : dir === "down" ? -PAN_SPEED : 0;
        onPan(dx, dy);
      };
      move();
      intervalRef.current = window.setInterval(move, PAN_INTERVAL);
    },
    [onPan]
  );

  const stopPan = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Keyboard arrow support
  useEffect(() => {
    const pressed = new Set<string>();
    let rafId: number | null = null;

    const tick = () => {
      let dx = 0;
      let dy = 0;
      if (pressed.has("ArrowLeft")) dx += PAN_SPEED;
      if (pressed.has("ArrowRight")) dx -= PAN_SPEED;
      if (pressed.has("ArrowUp")) dy += PAN_SPEED;
      if (pressed.has("ArrowDown")) dy -= PAN_SPEED;
      if (dx !== 0 || dy !== 0) onPan(dx, dy);
      if (pressed.size > 0) rafId = requestAnimationFrame(tick);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      if (!pressed.has(e.key)) {
        pressed.add(e.key);
        if (pressed.size === 1) rafId = requestAnimationFrame(tick);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      pressed.delete(e.key);
      if (pressed.size === 0 && rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [onPan]);

  const btnClass =
    "flex items-center justify-center w-9 h-9 rounded-lg bg-white/80 hover:bg-white shadow-sm border border-gray-200/60 text-gray-500 hover:text-gray-700 active:scale-90 transition-all cursor-pointer select-none touch-none";

  return (
    <div className="absolute bottom-4 right-4 z-10 pointer-events-auto">
      <div className="grid grid-cols-3 grid-rows-3 gap-0.5 w-[7.5rem] h-[7.5rem]">
        {/* Row 1 */}
        <div />
        <button
          className={btnClass}
          onPointerDown={() => startPan("up")}
          onPointerUp={stopPan}
          onPointerLeave={stopPan}
          aria-label="Pan up"
        >
          <ChevronUp size={18} />
        </button>
        <div />

        {/* Row 2 */}
        <button
          className={btnClass}
          onPointerDown={() => startPan("left")}
          onPointerUp={stopPan}
          onPointerLeave={stopPan}
          aria-label="Pan left"
        >
          <ChevronLeft size={18} />
        </button>
        <div />
        <button
          className={btnClass}
          onPointerDown={() => startPan("right")}
          onPointerUp={stopPan}
          onPointerLeave={stopPan}
          aria-label="Pan right"
        >
          <ChevronRight size={18} />
        </button>

        {/* Row 3 */}
        <div />
        <button
          className={btnClass}
          onPointerDown={() => startPan("down")}
          onPointerUp={stopPan}
          onPointerLeave={stopPan}
          aria-label="Pan down"
        >
          <ChevronDown size={18} />
        </button>
        <div />
      </div>
    </div>
  );
}
