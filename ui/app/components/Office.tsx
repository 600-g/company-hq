"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { teams, Team } from "../config/teams";
import ChatPanel from "./ChatPanel";
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

      {/* ── 우측/하단 패널 ── */}
      <aside className="w-full md:w-[300px] h-[45vh] md:h-full bg-[#12122a] border-t md:border-t-0 md:border-l border-[#2a2a5a] flex flex-col shrink-0">
        {/* 에이전트 목록 */}
        <div className="p-2.5 border-b border-[#2a2a5a]">
          <h2 className="text-[10px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Agents</h2>
          <div className="space-y-1">
            {teams.map((team) => (
              <button
                key={team.id}
                onClick={() => setActiveTeam(team)}
                className={`w-full text-left px-2.5 py-1.5 rounded text-[11px] transition-all flex items-center justify-between ${
                  activeTeam?.id === team.id
                    ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                    : "text-gray-400 border border-transparent hover:bg-[#1a1a3a]"
                }`}
              >
                <span>{team.emoji} {team.name}</span>
                <span className="text-[8px] text-gray-600">{team.status}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 채팅 영역 */}
        <div className="flex-1 flex flex-col p-2.5 overflow-hidden min-h-0">
          {activeTeam ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-2">
                <span>{activeTeam.emoji}</span>
                <div>
                  <h3 className="text-xs font-semibold text-white">{activeTeam.name}</h3>
                  <p className="text-[8px] text-gray-600">{activeTeam.repo}</p>
                </div>
              </div>
              <ChatPanel
                team={activeTeam}
                onClose={() => setActiveTeam(null)}
                onWorkingChange={(working) => handleWorkingChange(activeTeam.id, working)}
                inline
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[10px] text-gray-600 text-center">팀을 선택하세요</p>
            </div>
          )}
        </div>

        <div className="px-2.5 py-1 border-t border-[#2a2a5a] text-[8px] text-gray-700 text-center">
          Claude Code CLI · $0
        </div>
      </aside>
    </div>
  );
}
