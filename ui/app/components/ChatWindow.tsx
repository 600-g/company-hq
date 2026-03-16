"use client";

import { useRef, useState, useCallback } from "react";
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
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    onFocus();
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos, onFocus]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setPos({
      x: Math.max(0, e.clientX - dragOffset.current.x),
      y: Math.max(0, e.clientY - dragOffset.current.y),
    });
  }, [dragging]);

  const onPointerUp = useCallback(() => setDragging(false), []);

  return (
    <div
      className="fixed flex flex-col bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg shadow-2xl overflow-hidden"
      style={{
        left: pos.x, top: pos.y,
        width: 360, height: 420,
        zIndex: zIndex + 30,
      }}
      onClick={onFocus}
    >
      {/* 타이틀바 (드래그 핸들) */}
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

      {/* 채팅 */}
      <div className="flex-1 min-h-0 p-2">
        <ChatPanel
          team={team}
          onClose={onClose}
          onWorkingChange={onWorkingChange}
          inline
          messages={messages}
          onMessages={onMessages}
        />
      </div>
    </div>
  );
}
