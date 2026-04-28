"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Check, XCircle, AlertTriangle } from "lucide-react";
import { apiBase } from "@/lib/utils";
import MemoryOptimizerModal from "@/components/MemoryOptimizerModal";

interface ToolCheck { installed: boolean; version: string | null; path: string | null }
interface SysCheck { ok: boolean; platform?: string; tools?: Record<string, ToolCheck> }

interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  model_key?: string;
  working?: boolean;
  tool?: string | null;
  pid?: number | null;
  cpu?: number | null;
  memory_mb?: number | null;
  tokens?: { prompts?: number; chars?: number };
}

interface ServiceInfo {
  name: string;
  desc?: string;
  status: "ok" | "warn" | "down";
  code?: number | null;
  error?: string | null;
}

interface DashboardData {
  agents?: AgentInfo[];
  system?: { cpu?: number; memory?: number; disk?: number; network?: { connected?: boolean; type?: string; quality?: string } };
  services?: ServiceInfo[];
  activity?: { time: string; team: string; content: string }[];
  version?: { server?: string; python?: string; claude_cli?: string };
}

/** 실시간 서버실 대시보드 — 3초 폴링 */
export default function ServerDashboard() {
  const [d, setD] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [sys, setSys] = useState<SysCheck | null>(null);
  const [memOpen, setMemOpen] = useState(false);

  const load = async () => {
    try {
      const r = await fetch(`${apiBase()}/api/dashboard`);
      const j = await r.json();
      setD(j || {});
    } catch {} finally {
      setLoading(false);
    }
  };

  const loadSys = async () => {
    try {
      const r = await fetch(`${apiBase()}/api/system/check`);
      setSys(await r.json());
    } catch {}
  };

  useEffect(() => {
    load();
    loadSys();
    const id = setInterval(load, 3000);
    const sysId = setInterval(loadSys, 30_000);
    return () => { clearInterval(id); clearInterval(sysId); };
  }, []);

  const restart = async (agentId: string) => {
    if (restartingId) return;
    setRestartingId(agentId);
    try {
      await fetch(`${apiBase()}/api/agents/${agentId}/restart`, { method: "POST" });
      await load();
    } finally {
      setRestartingId(null);
    }
  };

  const system = d.system || {};
  const agents = d.agents || [];
  const services = d.services || [];
  const activity = d.activity || [];

  return (
    <div className="p-4 space-y-4">
      {/* 시스템 메트릭 */}
      <section>
        <SectionTitle>💻 시스템 상태</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Gauge label="CPU" value={system.cpu ?? null} />
          <Gauge
            label="메모리"
            value={system.memory ?? null}
            onClick={() => setMemOpen(true)}
            hint="클릭해 메모리 정리 모달 열기 — 외부 앱 graceful 종료"
          />
          <Gauge label="디스크" value={system.disk ?? null} />
          <NetworkCard net={system.network} />
        </div>
      </section>

      {/* 에이전트 */}
      <section>
        <SectionTitle>
          🤖 에이전트 <span className="text-gray-500 font-normal">({agents.length})</span>
          {loading && <RefreshCw className="w-3 h-3 animate-spin text-gray-500 inline ml-2" />}
        </SectionTitle>
        {agents.length === 0 ? (
          <div className="text-[11px] text-gray-500 py-3 text-center">에이전트 정보 없음</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {agents.map((a) => (
              <AgentCard key={a.id} agent={a} restarting={restartingId === a.id} onRestart={() => restart(a.id)} />
            ))}
          </div>
        )}
      </section>

      {/* 서비스 상태 */}
      {services.length > 0 && (
        <section>
          <SectionTitle>🌐 서비스</SectionTitle>
          <div className="space-y-0.5">
            {services.map((svc) => (
              <div key={svc.name} className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-900/40 text-[12px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    svc.status === "ok" ? "bg-green-400" :
                    svc.status === "warn" ? "bg-yellow-400" :
                    "bg-red-500 animate-pulse"
                  }`} />
                  <span className="text-gray-300 truncate">{svc.name}</span>
                  {svc.desc && <span className="text-gray-600 text-[10px] truncate">· {svc.desc}</span>}
                </div>
                <span className={`text-[11px] shrink-0 ${
                  svc.status === "ok" ? "text-green-400" :
                  svc.status === "warn" ? "text-yellow-400" :
                  "text-red-400"
                }`}>
                  {svc.status === "ok" ? "정상" : svc.status === "warn" ? `⚠ ${svc.code || "경고"}` : `✕ ${svc.error || "중단"}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 최근 활동 */}
      {activity.length > 0 && (
        <section>
          <SectionTitle>📝 최근 활동 (최근 {Math.min(activity.length, 10)})</SectionTitle>
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {activity.slice(0, 10).map((a, i) => (
              <div key={i} className="text-[11px] text-gray-400 px-2 py-1 rounded hover:bg-gray-900/30 flex gap-2">
                <span className="text-gray-600 font-mono shrink-0">{a.time}</span>
                <span className="text-sky-300 shrink-0">{a.team}</span>
                <span className="truncate flex-1">{a.content}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 환경 체크 통합 */}
      {sys?.tools && (
        <section>
          <SectionTitle>🔧 환경 체크 {sys.platform && <span className="text-[10px] text-gray-500 font-normal ml-1">({sys.platform})</span>}</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {["node", "git", "npm", "claude", "cloudflared"].map((name) => {
              const t = sys.tools?.[name];
              const installed = !!t?.installed;
              return (
                <div key={name} className={`p-2 rounded border text-[11px] ${installed ? "border-gray-800/60 bg-gray-900/30" : "border-amber-500/30 bg-amber-500/5"}`}>
                  <div className="flex items-center gap-1.5">
                    {installed ? <Check className="w-3 h-3 text-green-400" />
                      : name === "cloudflared" ? <AlertTriangle className="w-3 h-3 text-gray-500" />
                      : <XCircle className="w-3 h-3 text-red-400" />}
                    <span className="font-bold text-gray-200">{name}</span>
                  </div>
                  {t?.version && <div className="text-[10px] text-gray-500 font-mono truncate mt-0.5" title={t.version}>{t.version}</div>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 버전 */}
      {d.version && (
        <div className="text-[10px] text-gray-500 font-mono pt-2 border-t border-gray-800/50 flex gap-3">
          {d.version.server && <span>server {d.version.server}</span>}
          {d.version.python && <span>py {d.version.python}</span>}
          {d.version.claude_cli && <span>claude {d.version.claude_cli}</span>}
        </div>
      )}

      {/* 메모리 게이지 클릭 시 정리 모달 */}
      <MemoryOptimizerModal open={memOpen} onClose={() => setMemOpen(false)} />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] text-gray-400 font-bold mb-1.5 flex items-center">{children}</div>;
}

function metricColor(v: number | null): { bar: string; text: string } {
  if (v == null) return { bar: "bg-gray-700", text: "text-gray-500" };
  if (v >= 85) return { bar: "bg-red-500", text: "text-red-400" };
  if (v >= 65) return { bar: "bg-yellow-500", text: "text-yellow-400" };
  return { bar: "bg-green-500", text: "text-green-400" };
}

function Gauge({ label, value, onClick, hint }: { label: string; value: number | null; onClick?: () => void; hint?: string }) {
  const c = metricColor(value);
  // 시각 통일을 위해 항상 div — button 의 user-agent 기본 padding/font/text-align 차이 제거
  return (
    <div
      onClick={onClick}
      title={hint}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`p-2.5 rounded-lg border border-gray-800/60 bg-gray-900/40 ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-gray-500 uppercase font-bold">{label}</span>
        <span className={`text-sm font-bold ${c.text}`}>{value != null ? `${value}%` : "—"}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${c.bar} transition-all duration-500`} style={{ width: `${Math.min(value ?? 0, 100)}%` }} />
      </div>
    </div>
  );
}

function NetworkCard({ net }: { net?: { connected?: boolean; type?: string; quality?: string } }) {
  const connected = net?.connected ?? false;
  return (
    <div className="p-2.5 rounded-lg border border-gray-800/60 bg-gray-900/40">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-gray-500 uppercase font-bold">네트워크</span>
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400" : "bg-red-500 animate-pulse"}`} />
      </div>
      <div className="text-sm text-gray-300">
        {connected ? (net?.quality || "OK") : "오프라인"}
      </div>
      {net?.type && <div className="text-[10px] text-gray-600 mt-0.5">{net.type}</div>}
    </div>
  );
}

function AgentCard({ agent, restarting, onRestart }: { agent: AgentInfo; restarting: boolean; onRestart: () => void }) {
  const working = !!agent.working;
  return (
    <div className={`p-2 rounded border transition-colors ${
      working ? "bg-yellow-500/5 border-yellow-500/30" : "bg-gray-900/30 border-gray-800/60"
    }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm shrink-0">{agent.emoji}</span>
          <span className="text-[12px] font-bold text-gray-200 truncate">{agent.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <StatusPip working={working} pid={agent.pid ?? null} />
          <button
            onClick={onRestart}
            disabled={restarting}
            className="text-[11px] px-1 text-gray-500 hover:text-red-400 disabled:opacity-30"
            title="세션 초기화"
          >
            {restarting ? "…" : "↺"}
          </button>
        </div>
      </div>
      {working && agent.tool && (
        <div className="text-[11px] text-yellow-300/80 truncate mt-0.5">⚡ {agent.tool}</div>
      )}
      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-500">
        {agent.model_key && <span>{agent.model_key}</span>}
        {agent.tokens?.prompts != null && agent.tokens.prompts > 0 && <span>· {agent.tokens.prompts}회</span>}
        {working && agent.cpu != null && <span>· CPU {agent.cpu}%</span>}
        {working && agent.memory_mb != null && <span>· {agent.memory_mb}MB</span>}
      </div>
    </div>
  );
}

function StatusPip({ working, pid }: { working: boolean; pid: number | null }) {
  if (working) return (
    <span className="flex items-center gap-0.5">
      <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
      <span className="text-[11px] text-yellow-400 font-bold">작업중</span>
    </span>
  );
  if (pid) return (
    <span className="flex items-center gap-0.5">
      <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
      <span className="text-[11px] text-green-400">대기</span>
    </span>
  );
  return (
    <span className="flex items-center gap-0.5">
      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full" />
      <span className="text-[11px] text-gray-500">—</span>
    </span>
  );
}
