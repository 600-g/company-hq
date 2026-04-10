"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Team } from "../config/teams";
import ChatPanel, { Message } from "./ChatPanel";
import ServerDashboard from "./ServerDashboard";
import TradingDashboard from "./TradingDashboard";
import TeamMonitor from "./TeamMonitor";

// 채팅 가능한 팀 — CPO와 매매봇만 (나머지는 모니터링 대시보드)
const CHAT_TEAMS = new Set(["cpo-claude", "trading-bot"]);

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h.startsWith("192.168.");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

function SpecPopup({ team, onClose }: { team: Team; onClose: () => void }) {
  const [claudeMd, setClaudeMd] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"spec" | "prompt" | "info">("spec");

  useEffect(() => {
    fetch(`${getApiBase()}/api/teams/${team.id}/guide`)
      .then(r => r.json())
      .then(d => {
        setClaudeMd(d.claude_md || "스펙 없음");
        setSystemPrompt(d.system_prompt || "프롬프트 없음");
        setLoading(false);
      })
      .catch(() => { setClaudeMd("불러오기 실패"); setLoading(false); });
  }, [team.id]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`${getApiBase()}/api/teams/${team.id}/guide`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claude_md: claudeMd }),
      });
      if (res.ok) { setSaved(true); setEditing(false); setTimeout(() => setSaved(false), 2000); }
    } catch { /* ignore */ }
    setSaving(false);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const tabBtn = (id: typeof tab, label: string) => (
    <button onClick={() => { setTab(id); setEditing(false); }}
      className={`text-[10px] px-2 py-1 rounded transition-colors ${
        tab === id ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" : "text-gray-500 hover:text-gray-300"
      }`}>{label}</button>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-[520px] max-w-[90vw] h-[75vh] bg-[#0a0a18] border border-[#3a3a5a] rounded-lg shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#14142a] border-b border-[#2a2a5a] shrink-0">
          <span className="text-[11px] font-bold text-gray-300">{team.emoji} {team.name}</span>
          <div className="flex items-center gap-1.5">
            {saved && <span className="text-[9px] text-green-400">저장됨</span>}
            {tab === "spec" && !editing && (
              <button onClick={() => setEditing(true)}
                className="text-[9px] px-2 py-0.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded hover:bg-yellow-500/20">수정</button>
            )}
            {tab === "spec" && editing && (
              <>
                <button onClick={handleSave} disabled={saving}
                  className="text-[9px] px-2 py-0.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded hover:bg-green-500/30 disabled:opacity-50">
                  {saving ? "..." : "저장"}</button>
                <button onClick={() => setEditing(false)} className="text-[9px] px-2 py-0.5 text-gray-500 hover:text-gray-300">취소</button>
              </>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white text-sm px-1">✕</button>
          </div>
        </div>
        {/* 탭 */}
        <div className="flex gap-1 px-3 py-1.5 border-b border-[#1a1a3a] shrink-0">
          {tabBtn("spec", "CLAUDE.md")}
          {tabBtn("prompt", "시스템 프롬프트")}
          {tabBtn("info", "팀 정보")}
        </div>
        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-3 min-h-0">
          {loading ? (
            <span className="text-[11px] text-gray-500 p-2">로딩중...</span>
          ) : tab === "spec" ? (
            editing ? (
              <textarea value={claudeMd} onChange={e => setClaudeMd(e.target.value)}
                className="w-full h-full bg-[#0f0f1f] text-[11px] text-gray-300 leading-relaxed p-2 border border-[#2a2a5a] rounded resize-none focus:outline-none focus:border-yellow-500/40 font-mono" />
            ) : (
              <div className="text-[11px] text-gray-300 leading-relaxed whitespace-pre-wrap p-1 font-mono">{claudeMd}</div>
            )
          ) : tab === "prompt" ? (
            <div className="text-[11px] text-gray-300 leading-relaxed whitespace-pre-wrap p-1 font-mono">{systemPrompt}</div>
          ) : (
            <div className="space-y-3 text-[11px]">
              <div className="bg-[#12122a] rounded-lg p-3 border border-[#2a2a5a]">
                <div className="text-gray-500 text-[9px] mb-2">기본 정보</div>
                <div className="grid grid-cols-2 gap-y-1.5">
                  <span className="text-gray-500">팀 ID</span>
                  <span className="text-gray-300 font-mono">{team.id}</span>
                  <span className="text-gray-500">이름</span>
                  <span className="text-white">{team.emoji} {team.name}</span>
                  <span className="text-gray-500">모델</span>
                  <span className={`font-mono ${team.model === "opus" ? "text-purple-400" : "text-blue-400"}`}>{team.model || "sonnet"}</span>
                  <span className="text-gray-500">레포</span>
                  <span className="text-gray-300 font-mono">{team.repo || "-"}</span>
                  <span className="text-gray-500">상태</span>
                  <span className={team.status === "운영중" ? "text-green-400" : "text-gray-500"}>{team.status}</span>
                  {team.siteUrl && (<><span className="text-gray-500">사이트</span>
                    <a href={team.siteUrl} target="_blank" rel="noreferrer" className="text-yellow-400 hover:underline truncate">{team.siteUrl}</a></>)}
                  {team.githubUrl && (<><span className="text-gray-500">GitHub</span>
                    <a href={team.githubUrl} target="_blank" rel="noreferrer" className="text-yellow-400 hover:underline truncate">{team.githubUrl}</a></>)}
                </div>
              </div>
              <div className="bg-[#12122a] rounded-lg p-3 border border-[#2a2a5a]">
                <div className="text-gray-500 text-[9px] mb-2">역할 요약</div>
                <div className="text-gray-300 leading-relaxed">
                  {systemPrompt.split("\n").slice(0, 5).join("\n") || "역할 정보 없음"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface Props {
  team: Team;
  messages: Message[];
  onMessages: (msgs: Message[]) => void;
  onClose: () => void;
  onWorkingChange: (working: boolean) => void;
  onFocus: () => void;
  zIndex: number;
  initialX: number;
  initialY: number;
}

const MIN_W = 300;
const MIN_H = 300;

export default function ChatWindow({
  team, messages, onMessages, onClose, onWorkingChange, onFocus, zIndex, initialX, initialY
}: Props) {
  const isDashboard = team.id === "server-monitor";
  const isTrading = team.id === "trading-bot";
  const [showSpec, setShowSpec] = useState(false);
  const [showTradingDash, setShowTradingDash] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [pos, setPos] = useState({ x: initialX, y: initialY });

  // 크기 저장/복원 (localStorage)
  const sizeKey = `hq-chat-size-${team.id}`;
  const getInitialSize = () => {
    if (typeof window === "undefined") return { w: isDashboard ? 420 : 380, h: isDashboard ? 560 : 440 };
    try {
      const saved = localStorage.getItem(sizeKey);
      if (saved) return JSON.parse(saved) as { w: number; h: number };
    } catch {}
    return { w: isDashboard ? 420 : 380, h: isDashboard ? 560 : 440 };
  };
  const [size, setSize] = useState(getInitialSize);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0, px: 0, py: 0 });

  // 리사이즈 끝나면 크기 저장
  useEffect(() => {
    if (!resizing) {
      try { localStorage.setItem(sizeKey, JSON.stringify(size)); } catch {}
    }
  }, [resizing, size, sizeKey]);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (isMobile) return; // 모바일에서는 드래그 안 함
    onFocus();
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos, onFocus, isMobile]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setPos({
      x: Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - 200)),
      y: Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - 100)),
    });
  }, [dragging]);

  const onPointerUp = useCallback(() => setDragging(false), []);

  // ── 리사이즈 핸들러 ──────────────────────────────────
  const onResizeStart = useCallback((dir: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    onFocus();
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h, px: pos.x, py: pos.y };
    setResizing(dir);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [size, pos, onFocus]);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizing) return;
    const dx = e.clientX - resizeStart.current.x;
    const dy = e.clientY - resizeStart.current.y;
    const s = resizeStart.current;

    let newW = s.w, newH = s.h, newX = s.px, newY = s.py;

    if (resizing.includes("r")) newW = Math.max(MIN_W, s.w + dx);
    if (resizing.includes("b")) newH = Math.max(MIN_H, s.h + dy);
    if (resizing.includes("l")) {
      const dw = Math.min(dx, s.w - MIN_W);
      newW = s.w - dw;
      newX = s.px + dw;
    }
    if (resizing.includes("t")) {
      const dh = Math.min(dy, s.h - MIN_H);
      newH = s.h - dh;
      newY = s.py + dh;
    }

    setSize({ w: newW, h: newH });
    setPos({ x: newX, y: newY });
  }, [resizing]);

  const onResizeEnd = useCallback(() => setResizing(null), []);

  const edgeClass = "absolute z-10";
  const cornerClass = "absolute z-20";

  // 모바일: 전체화면 센터 모달
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2" onClick={onClose}>
        <div
          className="w-full max-w-md h-[85vh] bg-[#0f0f1f] border border-[#3a3a5a] rounded-xl shadow-2xl flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* 모바일 터미널 타이틀바 */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2a2a5a] shrink-0" style={{ background: '#0f0f1f' }}>
            <div className="flex gap-1.5 shrink-0">
              <div onClick={onClose} className="w-[11px] h-[11px] rounded-full bg-[#ff5f57]" />
              <div className="w-[11px] h-[11px] rounded-full bg-[#ffbd2e]" />
              <div className="w-[11px] h-[11px] rounded-full bg-[#28c940]" />
            </div>
            <span className="text-[12px] text-[#c8c8d8] font-mono">{team.emoji} {team.name}</span>
            <div className="flex items-center gap-1.5 ml-auto">
              {isTrading && (
                <button onClick={() => setShowTradingDash(v => !v)}
                  className="text-[9px] px-1.5 py-0.5 rounded border bg-yellow-900/20 text-yellow-400 border-yellow-800/40 hover:bg-yellow-900/40 transition-colors">
                  📊
                </button>
              )}
              {!isDashboard && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono border ${
                  team.model === 'opus'
                    ? 'bg-[#2a1a4a] text-[#a080f0] border-[#4a2a7a]'
                    : 'bg-[#1a2a3a] text-[#60a0e0] border-[#2a4a6a]'
                }`}>{team.model || 'sonnet'}</span>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden p-2 flex flex-col relative">
            {showSpec && <SpecPopup team={team} onClose={() => setShowSpec(false)} />}
            {showTradingDash && <TradingDashboard onClose={() => setShowTradingDash(false)} />}
            {team.id === "server-monitor"
              ? <ServerDashboard onClose={onClose} />
              : !CHAT_TEAMS.has(team.id)
                ? <TeamMonitor teamId={team.id} teamName={team.name} teamEmoji={team.emoji} model={team.model} siteUrl={team.siteUrl} onClose={onClose} />
                : <ChatPanel team={team} onClose={onClose} onWorkingChange={onWorkingChange}
                    inline messages={messages} onMessages={onMessages} />
            }
          </div>
        </div>
      </div>
    );
  }

  // PC: 드래그 + 리사이즈 가능 윈도우
  return (
    <div
      className="fixed flex flex-col bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg shadow-2xl overflow-hidden"
      style={{
        left: pos.x, top: pos.y,
        width: size.w, height: size.h,
        zIndex: zIndex + 30,
      }}
      onClick={onFocus}
    >
      {/* ── 리사이즈 가장자리 (상/하/좌/우) ── */}
      <div className={`${edgeClass} top-0 left-2 right-2 h-1 cursor-n-resize`}
        onPointerDown={onResizeStart("t")} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} />
      <div className={`${edgeClass} bottom-0 left-2 right-2 h-1 cursor-s-resize`}
        onPointerDown={onResizeStart("b")} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} />
      <div className={`${edgeClass} left-0 top-2 bottom-2 w-1 cursor-w-resize`}
        onPointerDown={onResizeStart("l")} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} />
      <div className={`${edgeClass} right-0 top-2 bottom-2 w-1 cursor-e-resize`}
        onPointerDown={onResizeStart("r")} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} />

      {/* ── 리사이즈 꼭짓점 (4개) ── */}
      <div className={`${cornerClass} top-0 left-0 w-3 h-3 cursor-nw-resize`}
        onPointerDown={onResizeStart("tl")} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} />
      <div className={`${cornerClass} top-0 right-0 w-3 h-3 cursor-ne-resize`}
        onPointerDown={onResizeStart("tr")} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} />
      <div className={`${cornerClass} bottom-0 left-0 w-3 h-3 cursor-sw-resize`}
        onPointerDown={onResizeStart("bl")} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} />
      <div className={`${cornerClass} bottom-0 right-0 w-3 h-3 cursor-se-resize`}
        onPointerDown={onResizeStart("br")} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} />

      {/* ── 터미널 타이틀바 (드래그) ── */}
      <div
        className="flex flex-col border-b border-[#2a2a5a] shrink-0 select-none"
        style={{ background: '#14142a' }}
      >
        {/* 상단: 신호등 + 팀명 + 경로 + 모델 뱃지 */}
        <div
          className="flex items-center gap-2.5 px-3 py-2 cursor-move"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* 팀 이모지 + 이름 */}
          <span className="text-[12px] text-white font-semibold whitespace-nowrap">
            {team.emoji} {team.name}
          </span>
          {/* 스펙 보기 */}
          {!isDashboard && (
            <button onClick={() => setShowSpec(true)} onPointerDown={e => e.stopPropagation()}
              className="text-[9px] text-gray-600 hover:text-yellow-400 transition-colors" title="CLAUDE.md 스펙">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="inline">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6zm2-7h8v1.5H8V13zm0 3h8v1.5H8V16zm0-6h3v1.5H8V10z"/>
              </svg>
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto shrink-0">
            {/* 매매봇 대시보드 */}
            {isTrading && (
              <button onClick={() => setShowTradingDash(v => !v)} onPointerDown={e => e.stopPropagation()}
                className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                  showTradingDash
                    ? "bg-yellow-500/30 text-yellow-300 border-yellow-500/50"
                    : "bg-yellow-900/20 text-yellow-400 border-yellow-800/40 hover:bg-yellow-900/40"
                }`} title="매매봇 대시보드">
                📊
              </button>
            )}
            {/* 모델 뱃지 */}
            {!isDashboard && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono border ${
                team.model === 'opus'
                  ? 'bg-[#2a1a4a] text-[#a080f0] border-[#4a2a7a]'
                  : 'bg-[#1a2a3a] text-[#60a0e0] border-[#2a4a6a]'
              }`}>
                {team.model || 'sonnet'}
              </span>
            )}
            {team.id === "server-monitor" && (
              <span className="text-[9px] text-green-500 font-mono border border-green-800 px-1.5 py-0.5 rounded">LIVE</span>
            )}
            {/* 닫기 */}
            <button onClick={onClose} onPointerDown={e => e.stopPropagation()}
              className="text-gray-500 hover:text-white text-sm px-1 transition-colors ml-1">✕</button>
          </div>
        </div>
      </div>

      {/* ── 콘텐츠 영역 ── */}
      <div className="flex-1 min-h-0 overflow-hidden p-2 flex flex-col relative" style={{ background: '#0a0a18' }}>
        {showSpec && <SpecPopup team={team} onClose={() => setShowSpec(false)} />}
        {showTradingDash && <TradingDashboard onClose={() => setShowTradingDash(false)} />}
        {team.id === "server-monitor"
          ? <ServerDashboard onClose={onClose} />
          : !CHAT_TEAMS.has(team.id)
            ? <TeamMonitor teamId={team.id} teamName={team.name} teamEmoji={team.emoji} model={team.model} siteUrl={team.siteUrl} onClose={onClose} />
            : <ChatPanel team={team} onClose={onClose} onWorkingChange={onWorkingChange}
                inline messages={messages} onMessages={onMessages} />
        }
      </div>
    </div>
  );
}
