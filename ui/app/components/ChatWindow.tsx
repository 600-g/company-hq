"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Team } from "../config/teams";
import ChatPanel, { Message } from "./ChatPanel";
import ServerDashboard from "./ServerDashboard";

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
  const [isMobile, setIsMobile] = useState(false);
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [size, setSize] = useState({ w: isDashboard ? 420 : 380, h: isDashboard ? 560 : 440 });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0, px: 0, py: 0 });

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
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2" onClick={onClose}>
        <div
          className="w-full max-w-md h-[75vh] bg-[#0f0f1f] border border-[#3a3a5a] rounded-t-xl shadow-2xl flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3 py-2 bg-[#1a1a3a] border-b border-[#2a2a5a] shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-base">{team.emoji}</span>
              <span className="text-xs font-semibold text-white">{team.name}</span>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-sm px-2 py-1">✕</button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden p-2 flex flex-col">
            {team.id === "server-monitor"
              ? <ServerDashboard onClose={onClose} />
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

      {/* ── 타이틀바 (드래그) ── */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-b cursor-move select-none shrink-0 ${
          team.id === "server-monitor"
            ? "bg-[#0d1a0d] border-[#1a3a1a]"
            : "bg-[#1a1a3a] border-[#2a2a5a]"
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{team.emoji}</span>
          <span className={`text-xs font-semibold tracking-wide ${
            team.id === "server-monitor" ? "text-green-400" : "text-white"
          }`}>{team.name}</span>
          {team.id === "server-monitor" && (
            <span className="text-[9px] text-green-600 font-mono border border-green-800 px-1 rounded">LIVE</span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-200 text-sm px-1 transition-colors">✕</button>
      </div>

      {/* ── 콘텐츠 영역 ── */}
      <div className="flex-1 min-h-0 overflow-hidden p-2 flex flex-col">
        {team.id === "server-monitor"
          ? <ServerDashboard onClose={onClose} />
          : <ChatPanel team={team} onClose={onClose} onWorkingChange={onWorkingChange}
              inline messages={messages} onMessages={onMessages} />
        }
      </div>
    </div>
  );
}
