"use client";

import { useState, useEffect, useCallback } from "react";

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h.startsWith("192.168.");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

interface Commit { hash: string; message: string; ago: string; }
interface EvoEntry { ver: string; date: string; changes: string[]; }
interface Props { teamId: string; teamName: string; teamEmoji: string; model?: string; siteUrl?: string; onClose: () => void; }

export default function TeamMonitor({ teamId, teamName, teamEmoji, model, siteUrl, onClose }: Props) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [status, setStatus] = useState("idle");
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [evolution, setEvolution] = useState<{ version: string; history: EvoEntry[]; lessons_count: number }>({ version: "1.0", history: [], lessons_count: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"activity" | "evolution">("activity");

  const fetchAll = useCallback(async () => {
    try {
      const [actRes, evoRes] = await Promise.all([
        fetch(`${getApiBase()}/api/teams/${teamId}/activity`),
        fetch(`${getApiBase()}/api/teams/${teamId}/evolution`),
      ]);
      const act = await actRes.json();
      const evo = await evoRes.json();
      if (act.ok) {
        setCommits(act.commits || []);
        setStatus(act.status || "idle");
        setCurrentTool(act.current_tool || null);
      }
      if (evo.ok) {
        setEvolution({ version: evo.version || "1.0", history: evo.history || [], lessons_count: evo.lessons_count || 0 });
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 15000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const statusColor = status === "working" ? "text-yellow-400" : status === "collaborating" ? "text-purple-400" : "text-green-400";
  const statusLabel = status === "working" ? "작업중" : status === "collaborating" ? "협업중" : "대기";

  const tabBtn = (id: typeof tab, label: string) => (
    <button onClick={() => setTab(id)}
      className={`text-[10px] px-2 py-1 rounded transition-colors ${
        tab === id ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" : "text-gray-500 hover:text-gray-300"
      }`}>{label}</button>
  );

  if (loading) {
    return (
      <div className="absolute inset-0 z-50 bg-[#0a0a18]/95 flex items-center justify-center rounded-lg">
        <span className="text-gray-400 text-sm animate-pulse">로딩 중...</span>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-50 bg-[#0a0a18]/98 flex flex-col rounded-lg overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a5a] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-white">{teamEmoji} {teamName}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${
            model === "opus" ? "bg-[#2a1a4a] text-[#a080f0] border-[#4a2a7a]" : "bg-[#1a2a3a] text-[#60a0e0] border-[#2a4a6a]"
          }`}>{model || "sonnet"}</span>
          <span className={`text-[9px] ${statusColor}`}>{statusLabel}</span>
          {currentTool && <span className="text-[9px] text-gray-500">⚡ {currentTool}</span>}
        </div>
        <div className="flex items-center gap-2">
          {siteUrl && (
            <a href={siteUrl} target="_blank" rel="noreferrer"
              className="text-[9px] px-2 py-0.5 rounded border bg-blue-900/20 text-blue-400 border-blue-800/40 hover:bg-blue-900/40 transition-colors">
              🔗 사이트
            </a>
          )}
          <span className="text-[9px] text-gray-600 font-mono">v{evolution.version}</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-sm transition-colors">✕</button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 px-3 py-1.5 border-b border-[#1a1a3a] shrink-0">
        {tabBtn("activity", "활동")}
        {tabBtn("evolution", `학습 (v${evolution.version})`)}
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 text-[11px]">
        {tab === "activity" && (
          <>
            {/* 최근 커밋 */}
            <div className="bg-[#12122a] rounded-lg p-3 border border-[#2a2a5a]">
              <div className="text-gray-500 text-[9px] mb-2">최근 커밋</div>
              {commits.length === 0 ? (
                <div className="text-gray-600 text-center py-2">커밋 없음</div>
              ) : (
                <div className="space-y-1.5">
                  {commits.map((c, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-yellow-500/60 font-mono text-[9px] shrink-0 mt-0.5">{c.hash}</span>
                      <span className="text-gray-300 flex-1">{c.message}</span>
                      <span className="text-gray-600 text-[9px] shrink-0">{c.ago}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 학습 현황 요약 */}
            <div className="bg-[#12122a] rounded-lg p-3 border border-[#1a1a3a]">
              <div className="text-gray-500 text-[9px] mb-2">학습 현황</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[14px] font-bold text-white">v{evolution.version}</div>
                  <div className="text-gray-600 text-[9px]">프롬프트 버전</div>
                </div>
                <div>
                  <div className="text-[14px] font-bold text-yellow-400">{evolution.history.length}</div>
                  <div className="text-gray-600 text-[9px]">업그레이드 횟수</div>
                </div>
                <div>
                  <div className="text-[14px] font-bold text-green-400">{evolution.lessons_count}</div>
                  <div className="text-gray-600 text-[9px]">학습 메모</div>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "evolution" && (
          <>
            {evolution.history.length === 0 ? (
              <div className="text-gray-600 text-center py-8">학습 히스토리 없음</div>
            ) : (
              <div className="space-y-2">
                {[...evolution.history].reverse().map((e, i) => (
                  <div key={i} className="bg-[#12122a] rounded-lg p-3 border border-[#1a1a3a]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-yellow-400 font-mono font-bold">v{e.ver}</span>
                      <span className="text-gray-600 text-[9px]">{e.date}</span>
                    </div>
                    <ul className="space-y-0.5">
                      {e.changes.map((c, j) => (
                        <li key={j} className="text-gray-300 flex items-start gap-1.5">
                          <span className="text-green-500 shrink-0">+</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
