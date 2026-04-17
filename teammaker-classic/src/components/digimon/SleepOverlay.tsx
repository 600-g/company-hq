"use client";

interface SleepOverlayProps {
  visible: boolean;
  onWake: () => void;
}

export function SleepOverlay({ visible, onWake }: SleepOverlayProps) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0, 5, 20, 0.85)",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        zIndex: 5,
      }}
    >
      <div
        style={{
          fontSize: 32,
          animation: "sleepFloat 2s ease-in-out infinite alternate",
        }}
      >
        💤
      </div>
      <div
        style={{
          color: "#4488ff",
          fontFamily: "monospace",
          fontSize: 14,
          letterSpacing: 4,
        }}
      >
        Z Z Z
      </div>
      <div style={{ color: "#2244aa", fontFamily: "monospace", fontSize: 10 }}>
        수면 중…
      </div>
      <button
        onClick={onWake}
        style={{
          marginTop: 8,
          background: "#000a20",
          border: "2px solid #2244aa",
          color: "#4488ff",
          fontFamily: "monospace",
          fontSize: 11,
          padding: "6px 16px",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        기상
      </button>
    </div>
  );
}
