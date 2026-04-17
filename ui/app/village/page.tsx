"use client";
import dynamic from "next/dynamic";
const LoginGame = dynamic(() => import("../game/LoginGame"), { ssr: false });

export default function VillagePage() {
  return (
    <div className="h-screen w-screen relative overflow-hidden bg-[#0a0a1a]">
      <div className="absolute inset-0">
        <LoginGame />
      </div>
      <button
        onClick={() => window.close()}
        className="fixed top-3 right-3 z-[300] px-3 py-1.5 rounded-lg bg-black/60 border border-white/20 text-white text-xs backdrop-blur hover:bg-black/80"
        title="탭 닫기"
      >✕ 닫기</button>
    </div>
  );
}
