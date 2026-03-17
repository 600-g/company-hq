"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { teams, Team } from "../config/teams";
import { Message, getWsStorageKey } from "./ChatPanel";
import ChatWindow from "./ChatWindow";
import WeatherBoard from "./WeatherBoard";
import type { OfficeGameHandle } from "../game/OfficeGame";

const WS_KEY = "hq-ws-base-url";

function ServerUrlModal({ onClose }: { onClose: () => void }) {
  const [val, setVal] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(WS_KEY) || "" : ""
  );
  const save = () => {
    const url = val.trim().replace(/\/$/, "");
    localStorage.setItem(WS_KEY, url);
    onClose();
    window.location.reload();
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg p-5 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-yellow-400 mb-1">서버 URL 설정</h3>
        <p className="text-[10px] text-gray-500 mb-3">
          터널 실행 후 나오는 URL 입력<br/>
          예) <span className="text-gray-400">https://abc123.lhr.rocks</span>
        </p>
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && save()}
          placeholder="https://..."
          className="w-full bg-[#1a1a2e] border border-[#3a3a5a] text-white px-3 py-2 text-xs rounded mb-3 focus:outline-none focus:border-yellow-400/50"
        />
        <div className="flex gap-2">
          <button onClick={save} className="flex-1 bg-yellow-500 text-black py-1.5 text-xs font-bold rounded hover:bg-yellow-400">저장</button>
          <button onClick={onClose} className="flex-1 bg-[#2a2a3a] text-gray-400 py-1.5 text-xs rounded hover:bg-[#3a3a4a]">취소</button>
        </div>
      </div>
    </div>
  );
}

export default function Office() {
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [openWindows, setOpenWindows] = useState<string[]>([]); // 열린 팀 id 목록
  const [focusedWindow, setFocusedWindow] = useState<string>("");
  const [chatHistory, setChatHistory] = useState<Record<string, Message[]>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("hq-chat-history");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // 대화 변경 시 localStorage 저장
  useEffect(() => {
    try {
      localStorage.setItem("hq-chat-history", JSON.stringify(chatHistory));
    } catch {}
  }, [chatHistory]);
  const [GameComponent, setGameComponent] = useState<React.ComponentType<{
    onTeamClick: (id: string) => void;
    ref: React.Ref<OfficeGameHandle>;
  }> | null>(null);
  const gameRef = useRef<OfficeGameHandle>(null);

  useEffect(() => {
    import("../game/OfficeGame").then((mod) => setGameComponent(() => mod.default));
  }, []);

  const handleTeamClick = useCallback((teamId: string) => {
    setOpenWindows(prev => {
      if (prev.includes(teamId)) {
        // 이미 열려있으면 닫기
        return prev.filter(id => id !== teamId);
      }
      return [...prev, teamId];
    });
    setFocusedWindow(teamId);
  }, []);

  const handleWorkingChange = useCallback((teamId: string, working: boolean) => {
    gameRef.current?.setWorking(teamId, working);
  }, []);

  return (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden bg-[#1a1a2e]">
      {showUrlModal && <ServerUrlModal onClose={() => setShowUrlModal(false)} />}
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
            <button
              onClick={() => setShowUrlModal(true)}
              className="bg-[#1a1a3a] border border-[#2a2a5a] px-2 py-0.5 rounded hover:border-yellow-400/50 hover:text-yellow-400 transition-colors"
              title="서버 URL 설정"
            >
              ⚙
            </button>
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

      {/* ── 채팅 윈도우들 (팀 위치 기반) ── */}
      {openWindows.map((teamId, idx) => {
        const team = teams.find(t => t.id === teamId);
        if (!team) return null;
        const teamIdx = teams.indexOf(team);
        // PC: 팀 위치 근처에 뜨기 (대략 계산)
        const baseX = 120 + (teamIdx % 4) * 160;
        const baseY = 40 + Math.floor(teamIdx / 4) * 180;
        return (
          <ChatWindow
            key={teamId}
            team={team}
            messages={chatHistory[teamId] || []}
            onMessages={(msgs) => setChatHistory(prev => ({ ...prev, [teamId]: msgs }))}
            onClose={() => setOpenWindows(prev => prev.filter(id => id !== teamId))}
            onWorkingChange={(working) => handleWorkingChange(teamId, working)}
            onFocus={() => setFocusedWindow(teamId)}
            zIndex={focusedWindow === teamId ? openWindows.length + 1 : idx + 1}
            initialX={baseX}
            initialY={baseY}
          />
        );
      })}

      {/* ── 우측/하단 패널 ── */}
      <aside className="w-full md:w-[300px] h-[50vh] md:h-full bg-[#12122a] border-t md:border-t-0 md:border-l border-[#2a2a5a] flex flex-col shrink-0 overflow-hidden">
        {/* 에이전트 목록 */}
        <div className="p-2 border-b border-[#2a2a5a] overflow-x-auto">
          <h2 className="text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Agents</h2>
          <div className="flex md:flex-col gap-1 md:gap-1">
            {teams.map((team) => (
              <div key={team.id} className="flex items-center gap-1">
                <button
                  onClick={() => handleTeamClick(team.id)}
                  className={`shrink-0 flex-1 text-left px-3 py-2 rounded text-[12px] transition-all flex items-center gap-1.5 min-h-[36px] ${
                    openWindows.includes(team.id)
                      ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                      : "text-gray-400 border border-transparent hover:bg-[#1a1a3a] active:bg-[#2a2a4a]"
                  }`}
                >
                  <span>{team.emoji} {team.name}</span>
                </button>
                {team.siteUrl && (
                  <a
                    href={team.siteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-yellow-400 hover:bg-[#1a1a3a] transition-all"
                    title={`${team.name} 사이트 열기`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                )}
              </div>
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
