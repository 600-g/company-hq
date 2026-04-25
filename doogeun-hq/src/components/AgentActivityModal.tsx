"use client";

import { useEffect, useState } from "react";
import { X, GitCommit, MessageSquare, Activity, Loader2 } from "lucide-react";
import { apiBase } from "@/lib/utils";
import type { Agent } from "@/stores/agentStore";

interface Commit {
  hash: string;
  message: string;
  ago: string;
  author: string;
}
interface RecentMessage {
  role: string;
  preview: string;
  ts?: string | number;
}
interface ActivityData {
  ok: boolean;
  commits: Commit[];
  recent_messages: RecentMessage[];
  status?: string;
  current_tool?: string;
  last_active?: string | number;
}

interface Props {
  agent: Agent;
  onClose: () => void;
}

/** 에이전트 활동 로그 — 최근 커밋 + 응답 요약 + 현재 상태 */
export default function AgentActivityModal({ agent, onClose }: Props) {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${apiBase()}/api/agents/${agent.id}/activity`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agent.id]);

  const statusColor = data?.status === "working" ? "text-amber-300"
    : data?.status === "error" ? "text-red-300"
    : "text-emerald-300";

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] rounded-xl border border-gray-700 bg-gray-950 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 bg-gray-900/60">
          <Activity className="w-4 h-4 text-sky-300" />
          <span className="text-base">{agent.emoji}</span>
          <span className="text-sm text-gray-100 font-bold flex-1">{agent.name} · 활동 로그</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-800 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-8 flex items-center justify-center text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> 불러오는 중…
            </div>
          )}
          {err && !loading && (
            <div className="p-6 text-sm text-red-300">에러: {err}</div>
          )}
          {data && !loading && (
            <>
              {/* 현재 상태 */}
              <section className="px-4 py-3 border-b border-gray-800/70">
                <div className="text-[11px] uppercase text-gray-500 mb-1.5">현재 상태</div>
                <div className="flex items-center gap-2 text-sm">
                  <span className={`font-mono font-bold ${statusColor}`}>
                    {data.status || "idle"}
                  </span>
                  {data.current_tool && (
                    <span className="text-xs text-gray-400 font-mono">· {data.current_tool}</span>
                  )}
                </div>
              </section>

              {/* 최근 커밋 */}
              <section className="px-4 py-3 border-b border-gray-800/70">
                <div className="text-[11px] uppercase text-gray-500 mb-2 flex items-center gap-1.5">
                  <GitCommit className="w-3 h-3" />
                  최근 커밋 ({data.commits.length})
                </div>
                {data.commits.length === 0 ? (
                  <div className="text-xs text-gray-500">커밋 없음</div>
                ) : (
                  <ul className="space-y-1.5">
                    {data.commits.map((c) => (
                      <li key={c.hash} className="text-xs flex items-start gap-2">
                        <code className="text-sky-400 font-mono shrink-0">{c.hash}</code>
                        <span className="flex-1 text-gray-200 break-words">{c.message}</span>
                        <span className="text-gray-500 shrink-0">{c.ago}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* 최근 응답 */}
              <section className="px-4 py-3">
                <div className="text-[11px] uppercase text-gray-500 mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3" />
                  최근 응답 ({data.recent_messages.length})
                </div>
                {data.recent_messages.length === 0 ? (
                  <div className="text-xs text-gray-500">응답 없음</div>
                ) : (
                  <ul className="space-y-2">
                    {data.recent_messages.map((m, i) => (
                      <li key={i} className="text-xs text-gray-300 bg-gray-900/40 rounded px-2 py-1.5 border-l-2 border-sky-600/40">
                        {m.preview}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
