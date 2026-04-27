"use client";

import { useCallback, useRef } from "react";
import dynamic from "next/dynamic";

// Dynamic import for Phaser OfficeScene (CSR only)
const OfficeGame = dynamic(
  () => import("@/components/office/OfficeGame").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-[#1a1a2e]">
        <div className="text-center">
          <div className="text-4xl mb-3">🏢</div>
          <p className="text-sm text-gray-400">사무실 로딩중...</p>
        </div>
      </div>
    ),
  }
);

export default function OfficePage() {
  const gameRef = useRef<any>(null);

  const handleTeamClick = useCallback(
    (teamId: string, screenX?: number, screenY?: number) => {
      // TODO: Handle team click (chat open, team selection, etc.)
      console.log(`[OfficePage] Team clicked: ${teamId} at (${screenX}, ${screenY})`);
    },
    []
  );

  return (
    <div className="w-full h-screen bg-[#1a1a2e] overflow-hidden">
      <OfficeGame ref={gameRef} onTeamClick={handleTeamClick} />
    </div>
  );
}
