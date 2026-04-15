"use client";

import { useEffect, useRef } from "react";
import { getCharIdForAgent } from "@/lib/character-registry";

const FRAME_W = 32;
const FRAME_H = 64;
const FRAMES_PER_DIR = 6;
// Direction order: right(0), up(1), left(2), down(3)
const DOWN_START = FRAMES_PER_DIR * 3; // frame index 18
const ANIM_INTERVAL = 150; // ms per frame

interface AgentAvatarProps {
  agentIndex: number;
  size?: number;
}

export default function AgentAvatar({ agentIndex, size = 28 }: AgentAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const charId = getCharIdForAgent(agentIndex);
    const img = new Image();
    img.src = `/characters/${charId}/${charId}_idle_anim_32x32.png`;

    let frameIndex = 0;
    let timer: ReturnType<typeof setInterval>;

    img.onload = () => {
      ctx.imageSmoothingEnabled = false;

      const draw = () => {
        const srcX = (DOWN_START + frameIndex) * FRAME_W;
        ctx.clearRect(0, 0, size, size);
        // Draw 32x64 frame scaled to fit size, vertically centered
        const scale = size / FRAME_W;
        const drawH = FRAME_H * scale;
        const offsetY = (size - drawH) / 2;
        ctx.drawImage(img, srcX, 0, FRAME_W, FRAME_H, 0, offsetY, size, drawH);
        frameIndex = (frameIndex + 1) % FRAMES_PER_DIR;
      };

      draw();
      timer = setInterval(draw, ANIM_INTERVAL);
    };

    return () => clearInterval(timer);
  }, [agentIndex, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded-full bg-muted"
      style={{ imageRendering: "pixelated", width: size, height: size }}
    />
  );
}
