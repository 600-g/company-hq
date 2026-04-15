"use client";

import { useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import { CHARACTERS, type ActionType, type CharacterDef } from "@/lib/character-registry";
import { type Direction } from "@/lib/sprite-parser";
import { PixelCharacter } from "@/components/canvas/PixelCharacter";

const SCALE = 4;

export default function PixelPage() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const charRef = useRef<PixelCharacter | null>(null);

  const [selectedChar, setSelectedChar] = useState<CharacterDef>(CHARACTERS[0]);
  const [selectedAction, setSelectedAction] = useState<ActionType>("idle_anim");
  const [selectedDirection, setSelectedDirection] = useState<Direction>("down");
  const [isReady, setIsReady] = useState(false);

  // Initialize PixiJS
  useEffect(() => {
    if (!canvasRef.current || appRef.current) return;

    let destroyed = false;
    const app = new Application();

    app.init({
      background: 0x1a1a2e,
      width: 400,
      height: 300,
      antialias: false,
      resolution: 1,
    }).then(() => {
      if (destroyed || !canvasRef.current) {
        app.destroy(true, { children: true });
        return;
      }
      canvasRef.current.appendChild(app.canvas as HTMLCanvasElement);
      appRef.current = app;
      setIsReady(true);
    });

    return () => {
      destroyed = true;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, []);

  // Swap character when selection changes
  useEffect(() => {
    const app = appRef.current;
    if (!app || !isReady) return;

    // Remove old character
    if (charRef.current) {
      app.stage.removeChild(charRef.current);
      charRef.current.destroy({ children: true });
      charRef.current = null;
    }

    const pc = new PixelCharacter(selectedChar.id, SCALE);
    pc.position.set(200, 230);
    app.stage.addChild(pc);
    charRef.current = pc;

    pc.init().then(() => {
      pc.setAction(selectedAction, selectedDirection);
    });
  }, [selectedChar, isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update action/direction on existing character
  useEffect(() => {
    charRef.current?.setAction(selectedAction, selectedDirection);
  }, [selectedAction, selectedDirection]);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <h1 className="text-2xl font-bold mb-6">Pixel Character Preview</h1>

      <div className="flex gap-8">
        {/* Canvas */}
        <div className="flex-shrink-0">
          <div
            ref={canvasRef}
            className="rounded-lg overflow-hidden border border-gray-700"
            style={{ width: 400, height: 300 }}
          />
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-6 min-w-[240px]">
          {/* Character */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Character
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CHARACTERS.map((char) => (
                <button
                  key={char.id}
                  onClick={() => {
                    setSelectedChar(char);
                    setSelectedAction("idle_anim");
                  }}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    selectedChar.id === char.id
                      ? "bg-purple-600 text-white"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  {char.name}
                  <span className="block text-xs opacity-60">
                    {char.suggestedRole}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Animation */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Animation
            </label>
            <div className="flex flex-wrap gap-2">
              {(["idle_anim", "run", "sit", "reading", "phone"] as ActionType[]).map(
                (action) => (
                  <button
                    key={action}
                    onClick={() => setSelectedAction(action)}
                    disabled={!selectedChar.actions.includes(action)}
                    className={`px-3 py-1.5 rounded text-sm transition-colors ${
                      selectedAction === action
                        ? "bg-blue-600 text-white"
                        : !selectedChar.actions.includes(action)
                        ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    {action.replace("_", " ")}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Direction */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Direction
            </label>
            <div className="grid grid-cols-3 gap-2 w-fit">
              <div />
              <DirButton dir="up" current={selectedDirection} onSelect={setSelectedDirection} />
              <div />
              <DirButton dir="left" current={selectedDirection} onSelect={setSelectedDirection} />
              <DirButton dir="down" current={selectedDirection} onSelect={setSelectedDirection} />
              <DirButton dir="right" current={selectedDirection} onSelect={setSelectedDirection} />
            </div>
          </div>

          {/* Status mapping */}
          <div className="text-xs text-gray-500 border-t border-gray-800 pt-4">
            <p className="font-medium text-gray-400 mb-1">Status Mapping:</p>
            <p>idle → idle anim</p>
            <p>working → reading</p>
            <p>running → run</p>
            <p>complete → sit</p>
            <p>talking → phone</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DirButton({
  dir,
  current,
  onSelect,
}: {
  dir: Direction;
  current: Direction;
  onSelect: (d: Direction) => void;
}) {
  const labels: Record<Direction, string> = { up: "↑", down: "↓", left: "←", right: "→" };
  return (
    <button
      onClick={() => onSelect(dir)}
      className={`px-3 py-1.5 rounded text-sm ${
        current === dir
          ? "bg-green-600 text-white"
          : "bg-gray-800 text-gray-300 hover:bg-gray-700"
      }`}
    >
      {labels[dir]}
    </button>
  );
}
