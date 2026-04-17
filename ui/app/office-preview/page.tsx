"use client";
import dynamic from "next/dynamic";
const OfficeGame = dynamic(() => import("../game/OfficeGame"), { ssr: false });

export default function OfficePreview() {
  return (
    <div className="h-screen w-screen relative overflow-hidden bg-black">
      <div className="absolute inset-0">
        <OfficeGame onTeamClick={() => {}} />
      </div>
    </div>
  );
}
