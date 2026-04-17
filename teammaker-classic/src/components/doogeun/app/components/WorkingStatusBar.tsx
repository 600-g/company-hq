"use client";

import { useEffect, useState } from "react";

interface AgentStatus {
  team_id: string;
  name?: string;
  emoji?: string;
  working?: boolean;
  tool?: string | null;
  working_since?: number | null;
}

function apiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h === "127.0.0.1" || h.endsWith(".local") || h.startsWith("192.168.");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

/** 화면 하단 고정 "⚙ N팀 작업 중" 바 — 채팅 닫혀도 작업 진행상황 보이게 */
export default function WorkingStatusBar() {
  const [working, setWorking] = useState<AgentStatus[]>([]);
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`${apiBase()}/api/agents/status`, { cache: "no-store" });
        const d = await r.json();
        if (cancelled) return;
        const rows: AgentStatus[] = Array.isArray(d) ? d : (d?.agents || d?.rows || []);
        setWorking(rows.filter(a => a.working));
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { cancelled = true; clearInterval(id); clearInterval(tick); };
  }, []);

  if (working.length === 0) return null;

  const fmtSec = (s: number) => s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`;

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-3 z-[180] pointer-events-none">
      <button
        onClick={() => setExpanded(v => !v)}
        className="pointer-events-auto bg-[#0f0f1f]/95 border border-yellow-500/40 shadow-2xl rounded-full px-3 py-1.5 flex items-center gap-2 hover:border-yellow-400 transition-colors"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400"></span>
        </span>
        <span className="text-[11px] font-bold text-yellow-300">⚙ {working.length}팀 작업 중</span>
        <span className="text-[9px] text-gray-500">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="pointer-events-auto mt-1.5 bg-[#0f0f1f]/98 border border-[#3a3a5a] rounded-lg shadow-2xl p-2 min-w-[260px] max-w-[360px]">
          <div className="space-y-1">
            {working.map(a => {
              const elapsed = a.working_since ? Math.floor((now - a.working_since * 1000) / 1000) : 0;
              return (
                <div key={a.team_id} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-[#1a1a2e]">
                  <span className="text-base">{a.emoji || "🤖"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-gray-200 truncate">{a.name || a.team_id}</div>
                    <div className="text-[9px] text-gray-500 truncate">
                      {a.tool ? `🛠 ${a.tool}` : "생각 중..."}
                    </div>
                  </div>
                  <div className="text-[10px] text-yellow-400 font-mono shrink-0">{fmtSec(elapsed)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
