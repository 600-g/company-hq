"use client";
import dynamic from "next/dynamic";
const LoginGame = dynamic(() => import("../game/LoginGame"), { ssr: false });

export default function GamePreview() {
  return (
    <div className="h-screen w-screen relative overflow-hidden bg-black">
      <div className="absolute inset-0">
        <LoginGame />
      </div>
    </div>
  );
}
