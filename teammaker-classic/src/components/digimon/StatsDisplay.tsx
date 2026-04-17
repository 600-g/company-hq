"use client";

import type { GameState } from "@/types/digimon";
import { stageLabel } from "@/lib/digimon-engine";

interface StatsDisplayProps {
  state: GameState;
}

function HeartRow({ label, value, max = 4 }: { label: string; value: number; max?: number }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs w-6 shrink-0" style={{ color: "#4dff91", fontFamily: "monospace" }}>
        {label}
      </span>
      <div className="flex gap-0.5">
        {Array.from({ length: max }).map((_, i) => (
          <span key={i} style={{ fontSize: 11, color: i < value ? "#ff4488" : "#1a3a1a" }}>
            ♥
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatsDisplay({ state }: StatsDisplayProps) {
  const winRate =
    state.totalBattles > 0
      ? Math.round((state.battleWins / state.totalBattles) * 100)
      : 0;

  return (
    <div
      style={{
        background: "#0d1a0d",
        border: "2px solid #1a4a1a",
        borderRadius: 4,
        padding: "8px 10px",
        fontFamily: "monospace",
        color: "#4dff91",
        fontSize: 11,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {/* Name + Stage */}
      <div className="flex justify-between items-center">
        <span style={{ color: "#00ff41", fontWeight: "bold", fontSize: 12 }}>
          {state.digimonName}
        </span>
        <span style={{ color: "#2a8a4a", fontSize: 10 }}>[{stageLabel(state.stage)}]</span>
      </div>

      {/* Hearts */}
      <div className="flex gap-3">
        <HeartRow label="식:" value={state.hunger} />
        <HeartRow label="행:" value={state.happiness} />
      </div>

      {/* Numeric stats */}
      <div className="flex gap-3 text-xs" style={{ color: "#2aaa5a" }}>
        <span>체력:{state.strength}</span>
        <span>체중:{state.weight}kg</span>
        <span>나이:{state.age}h</span>
        <span>승률:{winRate}%</span>
      </div>

      {/* Status badges */}
      <div className="flex gap-1">
        {state.isSick && (
          <span
            style={{
              background: "#3a1a00",
              color: "#ff8800",
              fontSize: 9,
              padding: "1px 4px",
              borderRadius: 2,
              border: "1px solid #ff4400",
            }}
          >
            SICK
          </span>
        )}
        {state.isSleeping && (
          <span
            style={{
              background: "#001a3a",
              color: "#4488ff",
              fontSize: 9,
              padding: "1px 4px",
              borderRadius: 2,
              border: "1px solid #2266bb",
            }}
          >
            SLEEP
          </span>
        )}
        {state.evolutionReady && !state.isSleeping && (
          <span
            style={{
              background: "#1a3a00",
              color: "#88ff44",
              fontSize: 9,
              padding: "1px 4px",
              borderRadius: 2,
              border: "1px solid #44bb00",
              animation: "pulse 1s infinite",
            }}
          >
            EVOLVE!
          </span>
        )}
        {state.poop > 0 && (
          <span style={{ fontSize: 10 }}>{"💩".repeat(state.poop)}</span>
        )}
      </div>

      {/* Care mistakes */}
      {state.careMistakes > 0 && (
        <div style={{ color: "#884444", fontSize: 9 }}>
          실수: {state.careMistakes}회
        </div>
      )}
    </div>
  );
}
