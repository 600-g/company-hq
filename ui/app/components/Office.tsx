"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { teams as defaultTeamList, Team } from "../config/teams";
import { Message, getWsStorageKey } from "./ChatPanel";
import ChatWindow from "./ChatWindow";
import WeatherBoard from "./WeatherBoard";
import type { OfficeGameHandle } from "../game/OfficeGame";

const WS_KEY = "hq-ws-base-url";

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h.startsWith("192.168.");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

interface TeamInfo {
  id: string;
  version: string | null;
  version_updated: string | null;
  last_commit_date: string | null;
  last_commit: string | null;
}

// ── 신규 에이전트 추가 모달 ──────────────────────────
function AddTeamModal({ onClose, onCreated }: { onClose: () => void; onCreated: (team: Team) => void }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🆕");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!name.trim()) { setError("팀 이름을 입력하세요"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${getApiBase()}/api/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          repo: name.trim().toLowerCase().replace(/\s+/g, "-"),
          emoji,
          description: desc.trim(),
        }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || "생성 실패"); setLoading(false); return; }
      const newTeam: Team = {
        id: data.team.id,
        name: data.team.name,
        emoji: data.team.emoji,
        repo: data.team.repo,
        localPath: data.team.localPath,
        status: data.team.status,
        githubUrl: data.repo_url,
      };
      onCreated(newTeam);
      onClose();
    } catch {
      setError("서버 연결 실패");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg p-5 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-yellow-400 mb-3">+ 새 팀 추가</h3>
        <div className="space-y-2.5">
          <div className="flex gap-2">
            <div className="w-16">
              <label className="text-[9px] text-gray-500 block mb-0.5">이모지</label>
              <input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={4}
                className="w-full bg-[#1a1a2e] border border-[#3a3a5a] text-white text-center px-1 py-1.5 text-lg rounded focus:outline-none focus:border-yellow-400/50" />
            </div>
            <div className="flex-1">
              <label className="text-[9px] text-gray-500 block mb-0.5">팀 이름</label>
              <input autoFocus value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !loading && submit()}
                placeholder="예) 웹크롤러"
                className="w-full bg-[#1a1a2e] border border-[#3a3a5a] text-white px-2 py-1.5 text-xs rounded focus:outline-none focus:border-yellow-400/50" />
            </div>
          </div>
          <div>
            <label className="text-[9px] text-gray-500 block mb-0.5">설명 (선택)</label>
            <input value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="프로젝트 한 줄 설명"
              className="w-full bg-[#1a1a2e] border border-[#3a3a5a] text-white px-2 py-1.5 text-xs rounded focus:outline-none focus:border-yellow-400/50" />
          </div>
          {error && <p className="text-[10px] text-red-400">{error}</p>}
          <p className="text-[8px] text-gray-600">GitHub 레포 자동 생성 + 로컬 클론 + CLAUDE.md 생성</p>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={submit} disabled={loading}
            className="flex-1 bg-yellow-500 text-black py-1.5 text-xs font-bold rounded hover:bg-yellow-400 disabled:opacity-50">
            {loading ? "생성중..." : "추가"}
          </button>
          <button onClick={onClose} className="flex-1 bg-[#2a2a3a] text-gray-400 py-1.5 text-xs rounded hover:bg-[#3a3a4a]">취소</button>
        </div>
      </div>
    </div>
  );
}

export default function Office() {
  const [teams, setTeams] = useState<Team[]>(defaultTeamList);
  const [teamInfoMap, setTeamInfoMap] = useState<Record<string, TeamInfo>>({});
  const [showAddModal, setShowAddModal] = useState(false);
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

  // 팀 버전 정보 fetch (30초마다)
  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/teams/info`);
        if (!res.ok) return;
        const list: TeamInfo[] = await res.json();
        const map: Record<string, TeamInfo> = {};
        list.forEach(t => { map[t.id] = t; });
        setTeamInfoMap(map);
      } catch {}
    };
    fetchInfo();
    const id = setInterval(fetchInfo, 30000);
    return () => clearInterval(id);
  }, []);

  // 에이전트 working 상태 폴링 (3초마다) → 채팅창 안 열어도 말풍선/글로우 표시
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/dashboard`);
        if (!res.ok) return;
        const data = await res.json();
        (data.agents as { id: string; working: boolean }[]).forEach(agent => {
          gameRef.current?.setWorking(agent.id, agent.working);
        });
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  const [GameComponent, setGameComponent] = useState<React.ComponentType<{
    onTeamClick: (id: string, screenX?: number, screenY?: number) => void;
    ref: React.Ref<OfficeGameHandle>;
  }> | null>(null);
  const gameRef = useRef<OfficeGameHandle>(null);

  useEffect(() => {
    import("../game/OfficeGame").then((mod) => setGameComponent(() => mod.default));
  }, []);

  const [clickPositions, setClickPositions] = useState<Record<string, { x: number; y: number }>>({});

  const handleTeamClick = useCallback((teamId: string, screenX?: number, screenY?: number) => {
    if (screenX != null && screenY != null) {
      setClickPositions(prev => ({ ...prev, [teamId]: { x: screenX, y: screenY } }));
    }
    setOpenWindows(prev => {
      if (prev.includes(teamId)) {
        return prev.filter(id => id !== teamId);
      }
      return [...prev, teamId];
    });
    setFocusedWindow(teamId);
  }, []);

  const handleWorkingChange = useCallback((teamId: string, working: boolean) => {
    gameRef.current?.setWorking(teamId, working);
  }, []);

  const handleAddTeam = useCallback((newTeam: Team) => {
    setTeams(prev => [...prev, newTeam]);
  }, []);

  // 날짜 상대 표시
  const formatRelativeDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return "방금";
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  };

  return (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden bg-[#1a1a2e]">
      {showAddModal && <AddTeamModal onClose={() => setShowAddModal(false)} onCreated={handleAddTeam} />}
      {/* ── 사무실 영역 ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* HUD */}
        <header className="bg-[#0e0e20]/90 border-b border-[#2a2a5a] px-3 py-1.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base cursor-pointer" onClick={() => window.location.reload()}>🏢</span>
            <h1 className="text-xs font-semibold text-yellow-400 cursor-pointer" onClick={() => window.location.reload()}>(주)두근 컴퍼니</h1>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] text-gray-400">
            {/* 네트워크 신호 아이콘 */}
            <div className="flex items-center gap-1 bg-[#1a1a3a] border border-[#2a2a5a] px-2 py-0.5 rounded">
              <svg width="12" height="12" viewBox="0 0 16 16" className="text-green-400">
                <rect x="1" y="11" width="3" height="4" rx="0.5" fill="currentColor" />
                <rect x="5" y="8" width="3" height="7" rx="0.5" fill="currentColor" />
                <rect x="9" y="5" width="3" height="10" rx="0.5" fill="currentColor" />
                <rect x="13" y="2" width="3" height="13" rx="0.5" fill="currentColor" opacity="0.3" />
              </svg>
              <span>연결됨</span>
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

        {/* ── 모바일 하단 에이전트 바 ── */}
        <div className="md:hidden border-t border-[#2a2a5a] bg-[#0e0e20] px-2 py-1.5 shrink-0">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
            {teams.filter(t => t.id !== "server-monitor").map(team => (
              <button
                key={team.id}
                onClick={() => handleTeamClick(team.id)}
                className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] transition-all ${
                  openWindows.includes(team.id)
                    ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
                    : "bg-[#1a1a3a] text-gray-400 border border-[#2a2a5a] active:bg-[#2a2a4a]"
                }`}
              >
                <span>{team.emoji}</span>
                <span className="whitespace-nowrap">{team.name}</span>
              </button>
            ))}
            <button
              onClick={() => setShowAddModal(true)}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] bg-[#1a1a3a] text-yellow-400/60 border border-dashed border-yellow-500/20 active:bg-[#2a2a4a]"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* ── 채팅 윈도우들 (팀 위치 기반) ── */}
      {openWindows.map((teamId, idx) => {
        const team = teams.find(t => t.id === teamId);
        if (!team) return null;
        const cp = clickPositions[teamId];
        const baseX = cp ? Math.min(cp.x, window.innerWidth - 400) : 120 + (idx % 3) * 140;
        const baseY = cp ? Math.max(40, Math.min(cp.y - 60, window.innerHeight - 460)) : 40 + idx * 40;
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

      {/* ── 우측 패널 (PC만) ── */}
      <aside className="hidden md:flex md:w-[300px] h-full bg-[#12122a] border-l border-[#2a2a5a] flex-col shrink-0 overflow-hidden">
        {/* 에이전트 목록 */}
        <div className="p-2 border-b border-[#2a2a5a] overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Agents</h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-[9px] px-2 py-0.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded hover:bg-yellow-500/20 transition-colors"
              title="새 팀 추가"
            >
              + 추가
            </button>
          </div>
          <div className="flex md:flex-col gap-1 md:gap-1">
            {teams.map((team) => {
              const info = teamInfoMap[team.id];
              return (
                <div key={team.id} className="flex items-center gap-1">
                  <button
                    onClick={() => handleTeamClick(team.id)}
                    className={`shrink-0 flex-1 text-left px-2.5 py-1.5 rounded text-[12px] transition-all min-h-[36px] ${
                      openWindows.includes(team.id)
                        ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                        : "text-gray-400 border border-transparent hover:bg-[#1a1a3a] active:bg-[#2a2a4a]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{team.emoji} {team.name}</span>
                      {info?.version && (
                        <span className="text-[8px] text-gray-600 font-mono">{info.version}</span>
                      )}
                    </div>
                    {info?.last_commit_date && (
                      <div className="text-[8px] text-gray-600 mt-0.5 truncate">
                        {formatRelativeDate(info.last_commit_date)}
                        {info.last_commit && <span className="text-gray-700"> · {info.last_commit.slice(0, 30)}</span>}
                      </div>
                    )}
                  </button>
                  {/* 사이트 링크 */}
                  <div className="flex shrink-0 gap-0.5">
                    {team.siteUrl && (
                      <a href={team.siteUrl} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-blue-400 hover:bg-[#1a1a3a] transition-all"
                        title={`${team.name} 사이트`}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                        </svg>
                      </a>
                    )}
                    {team.githubUrl && (
                      <a href={team.githubUrl} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-gray-300 hover:bg-[#1a1a3a] transition-all"
                        title="GitHub">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 날씨 게시판 */}
        <div className="p-2 border-t border-[#2a2a5a] hidden md:block">
          <WeatherBoard />
        </div>

        <div
          className="px-2.5 py-1 border-t border-[#2a2a5a] text-[8px] text-gray-700 text-center select-none cursor-default"
          onDoubleClick={() => {
            if (typeof caches !== "undefined") caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
            window.location.reload();
          }}
          title="더블클릭: 새로고침 및 업데이트 반영"
        >
          Claude Code CLI · $0 · <span className="text-gray-500">v0.1.0</span>
        </div>
      </aside>
    </div>
  );
}
