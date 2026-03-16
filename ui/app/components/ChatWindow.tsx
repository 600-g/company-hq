"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Team } from "../config/teams";
import ChatPanel, { Message } from "./ChatPanel";

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

export default function ChatWindow({
  team, messages, onMessages, onClose, onWorkingChange, onFocus, zIndex, initialX, initialY
}: Props) {
  const [isMobile, setIsMobile] = useState(false);
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

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
          <div className="flex-1 min-h-0 p-2">
            <ChatPanel
              team={team} onClose={onClose} onWorkingChange={onWorkingChange}
              inline messages={messages} onMessages={onMessages}
            />
          </div>
        </div>
      </div>
    );
  }

  // PC: 드래그 가능 윈도우
  return (
    <div
      className="fixed flex flex-col bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg shadow-2xl overflow-hidden"
      style={{
        left: pos.x, top: pos.y,
        width: 380, height: 440,
        zIndex: zIndex + 30,
      }}
      onClick={onFocus}
    >
      <div
        className="flex items-center justify-between px-3 py-2 bg-[#1a1a3a] border-b border-[#2a2a5a] cursor-move select-none shrink-0"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{team.emoji}</span>
          <span className="text-xs font-semibold text-white">{team.name}</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-sm px-1">✕</button>
      </div>
      <div className="flex-1 min-h-0 p-2">
        <ChatPanel
          team={team} onClose={onClose} onWorkingChange={onWorkingChange}
          inline messages={messages} onMessages={onMessages}
        />
      </div>
    </div>
  );
}
