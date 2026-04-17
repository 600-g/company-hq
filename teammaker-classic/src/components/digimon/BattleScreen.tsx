"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface BattleScreenProps {
  onComplete: (won: boolean, hits: number) => void;
  onCancel: () => void;
  isTrain?: boolean;
}

const BAR_COUNT = 5;
const BATTLE_DURATION = 5000; // 5 seconds
const WIN_THRESHOLD = 60; // percent

export function BattleScreen({ onComplete, onCancel, isTrain = false }: BattleScreenProps) {
  const [phase, setPhase] = useState<"countdown" | "active" | "result">("countdown");
  const [countdown, setCountdown] = useState(3);
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(0));
  const [timeLeft, setTimeLeft] = useState(BATTLE_DURATION);
  const [result, setResult] = useState<{ won: boolean; hits: number } | null>(null);
  const barsRef = useRef<number[]>(Array(BAR_COUNT).fill(0));
  const currentBarRef = useRef(0);
  const activeRef = useRef(false);

  // Countdown
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      setPhase("active");
      activeRef.current = true;
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // Timer during active phase
  useEffect(() => {
    if (phase !== "active") return;
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 100) {
          clearInterval(interval);
          activeRef.current = false;
          finishBattle();
          return 0;
        }
        return t - 100;
      });
    }, 100);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const finishBattle = useCallback(() => {
    const finalBars = [...barsRef.current];
    const hits = finalBars.filter((b) => b >= WIN_THRESHOLD).length;
    const won = hits >= 3;
    setResult({ won, hits });
    setPhase("result");
    setTimeout(() => onComplete(won, hits), 1800);
  }, [onComplete]);

  // Click to fill current bar
  const handleClick = useCallback(() => {
    if (!activeRef.current) return;
    const idx = currentBarRef.current;
    const newBars = [...barsRef.current];
    newBars[idx] = Math.min(100, newBars[idx] + 18);
    barsRef.current = newBars;
    setBars([...newBars]);

    // Advance to next bar when filled
    if (newBars[idx] >= 100 && idx < BAR_COUNT - 1) {
      currentBarRef.current = idx + 1;
    }
  }, []);

  const progressPct = Math.round(((BATTLE_DURATION - timeLeft) / BATTLE_DURATION) * 100);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#000d00",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 16,
        zIndex: 10,
      }}
    >
      <div style={{ color: "#00ff41", fontFamily: "monospace", fontSize: 14, fontWeight: "bold" }}>
        {isTrain ? "— 훈련 —" : "— 배틀 —"}
      </div>

      {phase === "countdown" && (
        <div
          style={{
            fontSize: 48,
            color: "#4dff91",
            fontFamily: "monospace",
            fontWeight: "bold",
          }}
        >
          {countdown === 0 ? "GO!" : countdown}
        </div>
      )}

      {(phase === "active" || phase === "result") && (
        <>
          {/* Time bar */}
          <div style={{ width: "100%", background: "#0a1a0a", height: 8, borderRadius: 4, border: "1px solid #1a4a1a" }}>
            <div
              style={{
                height: "100%",
                width: `${progressPct}%`,
                background: timeLeft < 1500 ? "#ff4444" : "#00ff41",
                borderRadius: 4,
                transition: "width 0.1s linear",
              }}
            />
          </div>

          {/* Bars */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 80 }}>
            {bars.map((val, i) => {
              const isWin = val >= WIN_THRESHOLD;
              const isCurrent = i === currentBarRef.current && phase === "active";
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div
                    style={{
                      width: 28,
                      height: 70,
                      background: "#0a1a0a",
                      border: `2px solid ${isCurrent ? "#ffffff" : isWin ? "#00ff41" : "#1a4a1a"}`,
                      borderRadius: 3,
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        width: "100%",
                        height: `${val}%`,
                        background: isWin ? "#00ff41" : "#2a8a2a",
                        transition: "height 0.05s",
                      }}
                    />
                    {/* threshold line */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: `${WIN_THRESHOLD}%`,
                        width: "100%",
                        height: 1,
                        background: "#ff4444",
                        opacity: 0.6,
                      }}
                    />
                  </div>
                  <span style={{ color: isWin ? "#00ff41" : "#2a4a2a", fontSize: 9, fontFamily: "monospace" }}>
                    {isWin ? "OK" : `${val}%`}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Click button */}
          {phase === "active" && (
            <button
              onClick={handleClick}
              style={{
                background: "#0a2a0a",
                border: "3px solid #00ff41",
                borderRadius: 6,
                color: "#00ff41",
                fontFamily: "monospace",
                fontSize: 16,
                padding: "10px 28px",
                cursor: "pointer",
                fontWeight: "bold",
                userSelect: "none",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              TAP!
            </button>
          )}

          {/* Result */}
          {phase === "result" && result && (
            <div
              style={{
                color: result.won ? "#00ff41" : "#ff4444",
                fontFamily: "monospace",
                fontSize: 20,
                fontWeight: "bold",
                textAlign: "center",
              }}
            >
              {result.won ? "WIN!" : "LOSE"}<br />
              <span style={{ fontSize: 11, color: "#4dff91" }}>
                {result.hits}/{BAR_COUNT} 바 클리어
              </span>
            </div>
          )}
        </>
      )}

      <button
        onClick={onCancel}
        style={{
          background: "transparent",
          border: "1px solid #1a4a1a",
          color: "#2a6a2a",
          fontFamily: "monospace",
          fontSize: 10,
          padding: "4px 12px",
          cursor: "pointer",
          borderRadius: 3,
        }}
      >
        취소
      </button>
    </div>
  );
}
