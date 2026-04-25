"use client";

import { useEffect, useRef } from "react";
import type { Agent } from "@/stores/agentStore";

interface Props {
  query: string;
  agents: Agent[];
  onSelect: (agent: Agent) => void;
  onClose: () => void;
}

/** @멘션 드롭다운 — 입력창 위에 뜨는 에이전트 선택 팝업 */
export default function MentionPopup({ query, agents, onSelect, onClose }: Props) {
  const filtered = agents.filter((a) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q);
  }).slice(0, 8);
  const ref = useRef<HTMLDivElement>(null);
  const activeIdx = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (filtered.length === 0) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIdx.current = Math.min(activeIdx.current + 1, filtered.length - 1);
        update();
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIdx.current = Math.max(activeIdx.current - 1, 0);
        update();
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        onSelect(filtered[activeIdx.current]);
      }
    };
    const update = () => {
      const nodes = ref.current?.querySelectorAll<HTMLButtonElement>("[data-mention-item]");
      nodes?.forEach((n, i) => {
        n.classList.toggle("bg-sky-500/20", i === activeIdx.current);
        n.classList.toggle("text-sky-200", i === activeIdx.current);
      });
    };
    window.addEventListener("keydown", onKey, true);
    update();
    return () => window.removeEventListener("keydown", onKey, true);
  }, [filtered, onSelect, onClose]);

  if (filtered.length === 0) {
    return (
      <div className="absolute bottom-full left-0 mb-1 z-50 w-60 rounded-lg border border-gray-700 bg-gray-950/95 backdrop-blur-md shadow-xl p-2 text-[11px] text-gray-500">
        매칭되는 에이전트 없음
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-1 z-50 w-64 rounded-lg border border-gray-700 bg-gray-950/95 backdrop-blur-md shadow-xl overflow-hidden"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="px-2 py-1 text-[10px] text-gray-500 border-b border-gray-800">
        에이전트 호출 · ↑↓ Enter
      </div>
      <div className="max-h-60 overflow-y-auto py-1">
        {filtered.map((a, i) => (
          <button
            key={a.id}
            data-mention-item
            onClick={() => onSelect(a)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-[12px] hover:bg-sky-500/20 hover:text-sky-200 ${
              i === 0 ? "bg-sky-500/20 text-sky-200" : "text-gray-300"
            }`}
          >
            <span className="text-base leading-none">{a.emoji}</span>
            <span className="font-bold truncate">{a.name}</span>
            <span className="ml-auto text-[10px] text-gray-500 truncate">{a.id}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
