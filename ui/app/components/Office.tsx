"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { teams, Team } from "../config/teams";
import ChatPanel from "./ChatPanel";
import WeatherBoard from "./WeatherBoard";
import type { OfficeGameHandle } from "../game/OfficeGame";

export default function Office() {
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [GameComponent, setGameComponent] = useState<React.ComponentType<{
    onTeamClick: (id: string) => void;
    ref: React.Ref<OfficeGameHandle>;
  }> | null>(null);
  const gameRef = useRef<OfficeGameHandle>(null);

  useEffect(() => {
    import("../game/OfficeGame").then((mod) => setGameComponent(() => mod.default));
  }, []);

  const handleTeamClick = useCallback((teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    if (team) setActiveTeam(team);
  }, []);

  const handleWorkingChange = useCallback((teamId: string, working: boolean) => {
    gameRef.current?.setWorking(teamId, working);
  }, []);

  return (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden bg-[#1a1a2e]">
      {/* ── 사무실 영역 ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* HUD */}
        <header className="bg-[#0e0e20]/90 border-b border-[#2a2a5a] px-3 py-1.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base cursor-pointer" onClick={() => window.location.reload()}>🏢</span>
            <h1 className="text-xs font-semibold text-yellow-400 cursor-pointer" onClick={() => window.location.reload()}>(주)두근 컴퍼니</h1>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] text-gray-400">
            <div className="flex items-center gap-1 bg-[#1a1a3a] border border-[#2a2a5a] px-2 py-0.5 rounded">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              연결됨
            </div>
            <div className="bg-[#1a1a3a] border border-[#2a2a5a] px-2 py-0.5 rounded hidden sm:block">
              에이전트 {teams.length}
            </div>
          </div>
        </header>

        {/* Phaser */}
        <main className="flex-1 relative min-h-0">
          {GameComponent ? (
            <GameComponent ref={gameRef} onTeamClick={handleTeamClick} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-xs text-gray-500">🏢 사무실 로딩중...</p>
            </div>
          )}
        </main>
      </div>

      {/* ── 팝업 채팅 (사무실 위에 모달) ── */}
      {activeTeam && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/30">
          <div className="w-full max-w-md h-[70vh] md:h-[60vh] bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#1a1a3a] border-b border-[#2a2a5a]">
              <div className="flex items-center gap-2">
                <span className="text-lg">{activeTeam.emoji}</span>
                <div>
                  <span className="text-sm font-semibold text-white">{activeTeam.name}</span>
                  <span className="text-[9px] text-gray-500 ml-2">{activeTeam.repo}</span>
                </div>
              </div>
              <button onClick={() => setActiveTeam(null)} className="text-gray-400 hover:text-white text-lg px-1">✕</button>
            </div>
            <div className="flex-1 min-h-0">
              <ChatPanel
                team={activeTeam}
                onClose={() => setActiveTeam(null)}
                onWorkingChange={(working) => handleWorkingChange(activeTeam.id, working)}
                inline
              />
            </div>
          </div>
        </div>
      )}

      {/* ── 우측/하단 패널 ── */}
      <aside className="w-full md:w-[300px] h-[50vh] md:h-full bg-[#12122a] border-t md:border-t-0 md:border-l border-[#2a2a5a] flex flex-col shrink-0 overflow-hidden">
        {/* 에이전트 목록 */}
        <div className="p-2 border-b border-[#2a2a5a] overflow-x-auto">
          <h2 className="text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Agents</h2>
          <div className="flex md:flex-col gap-1 md:gap-1">
            {teams.map((team) => (
              <button
                key={team.id}
                onClick={() => setActiveTeam(team)}
                className={`shrink-0 text-left px-3 py-2 rounded text-[12px] transition-all flex items-center gap-1.5 min-h-[36px] ${
                  activeTeam?.id === team.id
                    ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                    : "text-gray-400 border border-transparent hover:bg-[#1a1a3a] active:bg-[#2a2a4a]"
                }`}
              >
                <span>{team.emoji} {team.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 안내 */}
        <div className="flex-1 flex items-center justify-center p-2.5">
          <p className="text-[10px] text-gray-600 text-center">
            사무실에서 팀을 클릭하세요
          </p>
        </div>

        {/* 날씨 게시판 */}
        <div className="p-2 border-t border-[#2a2a5a] hidden md:block">
          <WeatherBoard />
        </div>

        <div className="px-2.5 py-1 border-t border-[#2a2a5a] text-[8px] text-gray-700 text-center">
          Claude Code CLI · $0
        </div>
      </aside>
    </div>
  );
}
