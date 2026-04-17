"use client";

import type { ActionMode } from "@/types/digimon";
import type { GameState } from "@/types/digimon";

interface ActionButtonsProps {
  state: GameState;
  activeMode: ActionMode;
  onAction: (mode: ActionMode) => void;
}

interface ButtonDef {
  mode: ActionMode;
  label: string;
  icon: string;
  color: string;
  activeColor: string;
}

const BUTTONS: ButtonDef[] = [
  { mode: "feed",   label: "밥",   icon: "🍖", color: "#1a3a1a", activeColor: "#2a5a2a" },
  { mode: "train",  label: "훈련", icon: "⚔️", color: "#1a1a3a", activeColor: "#2a2a5a" },
  { mode: "battle", label: "배틀", icon: "🥊", color: "#3a1a1a", activeColor: "#5a2a2a" },
  { mode: "sleep",  label: "수면", icon: "🌙", color: "#1a1a3a", activeColor: "#0a0a2a" },
  { mode: "heal",   label: "약",   icon: "💊", color: "#1a3a3a", activeColor: "#2a5a5a" },
  { mode: "status", label: "확인", icon: "📋", color: "#2a2a1a", activeColor: "#4a4a2a" },
];

export function ActionButtons({ state, activeMode, onAction }: ActionButtonsProps) {
  const disabled = state.isDead;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 6,
      }}
    >
      {BUTTONS.map(({ mode, label, icon, color, activeColor }) => {
        const isActive = activeMode === mode;
        const isSleepToggle = mode === "sleep";
        const isCurrentlySleeping = state.isSleeping;
        const sleepLabel = isSleepToggle ? (isCurrentlySleeping ? "기상" : "수면") : label;
        const sleepIcon = isSleepToggle ? (isCurrentlySleeping ? "☀️" : "🌙") : icon;

        return (
          <button
            key={mode}
            onClick={() => onAction(mode)}
            disabled={disabled}
            style={{
              background: isActive ? activeColor : color,
              border: `2px solid ${isActive ? "#4dff91" : "#1a4a1a"}`,
              borderRadius: 4,
              color: isActive ? "#00ff41" : "#4dff91",
              fontFamily: "monospace",
              fontSize: 10,
              padding: "6px 4px",
              cursor: disabled ? "not-allowed" : "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              opacity: disabled ? 0.4 : 1,
              transition: "all 0.1s",
              userSelect: "none",
            }}
          >
            <span style={{ fontSize: 16 }}>{sleepIcon}</span>
            <span>{sleepLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
