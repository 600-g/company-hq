"use client";

import { useState, useEffect, useCallback } from "react";

interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  model: string;
  working: boolean;
  tool: string | null;
  last_active: string | null;
  last_prompt: string;
  session: string | null;
}

interface DashboardData {
  agents: AgentInfo[];
  system: { cpu: number; memory: number; disk: number };
  activity: { time: string; team: string; content: string }[];
  version: { server: string; python: string };
}

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h.startsWith("192.168.");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

// ── 진행바 ─────────────────────────────────────────────
function ProgressBar({ value, color = "bg-green-500" }: { value: number; color?: string }) {
  return (
    <div className="w-full h-1.5 bg-[#2a2a3a] rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

// ── 메트릭 색상 ────────────────────────────────────────
function metricColor(v: number) {
  if (v >= 85) return "bg-red-500";
  if (v >= 65) return "bg-yellow-500";
  return "bg-green-500";
}

// ── 에이전트 카드 ──────────────────────────────────────
function AgentCard({ agent }: { agent: AgentInfo }) {
  return (
    <div className={`p-2 rounded border transition-colors ${
      agent.working
        ? "bg-yellow-500/5 border-yellow-500/30"
        : "bg-[#1a1a2e] border-[#2a2a4a]"
    }`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{agent.emoji}</span>
          <span className="text-[10px] font-semibold text-gray-300">{agent.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[8px] text-gray-600 bg-[#2a2a3a] px-1 rounded">{agent.model}</span>
          {agent.working ? (
            <span className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
              <span className="text-[8px] text-yellow-400">작업중</span>
            </span>
          ) : (
            <span className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 bg-green-400/60 rounded-full" />
              <span className="text-[8px] text-gray-500">대기</span>
            </span>
          )}
        </div>
      </div>

      {/* 툴 상태 / 최근 프롬프트 */}
      {agent.working && agent.tool ? (
        <div className="text-[9px] text-yellow-300/80 truncate mt-0.5">{agent.tool}</div>
      ) : agent.last_prompt ? (
        <div className="text-[8px] text-gray-600 truncate mt-0.5">↩ {agent.last_prompt}</div>
      ) : null}

      {/* 작업중 로딩바 */}
      {agent.working && (
        <div className="mt-1.5 w-full h-0.5 bg-[#2a2a3a] rounded overflow-hidden">
          <div className="h-full bg-yellow-400 rounded animate-[loading_1.5s_ease-in-out_infinite]"
            style={{ width: "40%", animation: "pulse 1s ease-in-out infinite" }} />
        </div>
      )}

      {agent.last_active && (
        <div className="text-[7px] text-gray-700 mt-1">{agent.last_active} · {agent.session ?? "no session"}</div>
      )}
    </div>
  );
}

// ── 메인 대시보드 ──────────────────────────────────────
interface Props {
  onClose: () => void;
}

export default function ServerDashboard({ onClose }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/dashboard`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json);
      setError(false);
      setLastUpdated(new Date().toLocaleTimeString("ko-KR"));
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 2000);
    return () => clearInterval(id);
  }, [fetchData]);

  const workingCount = data?.agents.filter(a => a.working).length ?? 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 text-[10px]">
      {/* 헤더 상태 */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${error ? "bg-red-500" : "bg-green-400 animate-pulse"}`} />
          <span className="text-gray-500">{error ? "연결 오류" : `갱신 ${lastUpdated}`}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {workingCount > 0 && (
            <span className="text-[8px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded">
              {workingCount}개 작업중
            </span>
          )}
          <button
            onClick={() => { fetchData(); window.location.reload(); }}
            className="text-[8px] px-1.5 py-0.5 bg-[#1a1a3a] border border-[#2a2a5a] text-gray-400 rounded hover:text-yellow-400 hover:border-yellow-400/40 transition-colors"
            title="강제 새로고침"
          >
            ↺ 새로고침
          </button>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xs px-1">✕</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 min-h-0">

        {/* ── 시스템 리소스 ── */}
        {data && (
          <section>
            <h3 className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">시스템 리소스</h3>
            <div className="space-y-1.5 bg-[#1a1a2e] border border-[#2a2a4a] rounded p-2">
              {[
                { label: "CPU", value: data.system.cpu },
                { label: "메모리", value: data.system.memory },
                { label: "디스크", value: data.system.disk },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-8 text-gray-500 shrink-0">{label}</span>
                  <div className="flex-1">
                    <ProgressBar value={value} color={metricColor(value)} />
                  </div>
                  <span className={`w-8 text-right font-mono shrink-0 ${
                    value >= 85 ? "text-red-400" : value >= 65 ? "text-yellow-400" : "text-green-400"
                  }`}>{value}%</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 에이전트 현황 ── */}
        {data && (
          <section>
            <h3 className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">에이전트 현황</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {data.agents.map(agent => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          </section>
        )}

        {/* ── 최근 활동 ── */}
        {data && data.activity.length > 0 && (
          <section>
            <h3 className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">최근 활동</h3>
            <div className="bg-[#0a0a1a] border border-[#1a1a3a] rounded p-2 space-y-1 max-h-32 overflow-y-auto">
              {data.activity.map((act, i) => (
                <div key={i} className="flex gap-2 text-[8px]">
                  <span className="text-gray-700 shrink-0 font-mono">{act.time}</span>
                  <span className="text-gray-600 shrink-0">[{act.team}]</span>
                  <span className="text-gray-400 truncate">{act.content}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 버전 정보 ── */}
        {data && (
          <section>
            <h3 className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">버전 정보</h3>
            <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded p-2 grid grid-cols-2 gap-1">
              {[
                ["서버", `v${data.version.server}`],
                ["Python", data.version.python],
                ["에이전트", `${data.agents.length}개`],
                ["사이트", "600g.net"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-600">{k}</span>
                  <span className="text-gray-400 font-mono">{v}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {!data && !error && (
          <div className="flex items-center justify-center py-10 text-gray-600">로딩중...</div>
        )}
        {error && (
          <div className="flex items-center justify-center py-10 text-red-500/70">서버 연결 실패</div>
        )}
      </div>
    </div>
  );
}
