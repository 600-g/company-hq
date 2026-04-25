"use client";

import { useEffect } from "react";
import { Settings, MessageSquare, Trash2, Activity } from "lucide-react";
import type { Agent } from "@/stores/agentStore";

interface Props {
  agent: Agent;
  x: number;
  y: number;
  onClose: () => void;
  onOpenConfig: () => void;
  onOpenChat: () => void;
  onOpenActivity: () => void;
  onDelete: () => void;
}

/** 에이전트 우클릭 컨텍스트 메뉴 */
export default function AgentContextMenu({
  agent, x, y, onClose, onOpenConfig, onOpenChat, onOpenActivity, onDelete,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 화면 밖 넘어가지 않게 위치 보정
  const left = Math.min(x, typeof window !== "undefined" ? window.innerWidth - 200 : x);
  const top = Math.min(y, typeof window !== "undefined" ? window.innerHeight - 180 : y);

  return (
    <>
      <div
        className="fixed inset-0 z-[200]"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        className="fixed z-[201] w-48 rounded-lg border border-gray-700 bg-gray-950 shadow-2xl overflow-hidden"
        style={{ left, top }}
      >
        <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2 bg-gray-900/50">
          <span className="text-base">{agent.emoji}</span>
          <span className="text-[12px] text-gray-200 font-bold truncate">{agent.name}</span>
        </div>
        <MenuItem onClick={onOpenChat} icon={<MessageSquare className="w-3.5 h-3.5" />} color="sky">
          채팅 열기
        </MenuItem>
        <MenuItem onClick={onOpenConfig} icon={<Settings className="w-3.5 h-3.5" />} color="sky">
          설정 (편집)
        </MenuItem>
        <MenuItem onClick={onOpenActivity} icon={<Activity className="w-3.5 h-3.5" />} color="sky">
          활동 로그
        </MenuItem>
        <div className="h-px bg-gray-800" />
        <MenuItem onClick={onDelete} icon={<Trash2 className="w-3.5 h-3.5" />} color="red">
          삭제
        </MenuItem>
      </div>
    </>
  );
}

function MenuItem({
  onClick, icon, color = "gray", children,
}: { onClick: () => void; icon: React.ReactNode; color?: "sky" | "red" | "gray"; children: React.ReactNode }) {
  const cls = color === "sky"
    ? "text-gray-200 hover:bg-sky-500/15 hover:text-sky-200"
    : color === "red"
    ? "text-red-300 hover:bg-red-500/15"
    : "text-gray-300 hover:bg-gray-800";
  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-2 text-[13px] flex items-center gap-2 transition-colors ${cls}`}
    >
      {icon}{children}
    </button>
  );
}
