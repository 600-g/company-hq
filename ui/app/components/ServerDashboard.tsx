"use client";

import { useState, useEffect, useCallback } from "react";

// ── 커스텀 확인 다이얼로그 ─────────────────────────────
function ConfirmDialog({
  message, onConfirm, onCancel,
}: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60"
      onClick={onCancel}>
      <div
        className="bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg p-4 w-64 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-[11px] text-gray-300 mb-4 leading-relaxed">{message}</p>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className="flex-1 bg-red-500/80 hover:bg-red-500 text-white py-1.5 text-[10px] font-bold rounded transition-colors"
          >
            초기화
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-[#2a2a3a] hover:bg-[#3a3a4a] text-gray-400 py-1.5 text-[10px] rounded transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  model_key: string;
  model_id: string;
  working: boolean;
  tool: string | null;
  last_active: string | null;
  last_prompt: string;
  session: string | null;
  pid: number | null;
  cpu: number | null;
  memory_mb: number | null;
  tokens: { prompts: number; chars: number };
}

interface NetworkInfo {
  connected: boolean;
  type: string;
  quality: string;
}

interface ServiceInfo {
  name: string;
  desc: string;
  url: string;
  status: "ok" | "warn" | "down";
  code: number | null;
  error: string | null;
}

interface TokenProject {
  label: string;
  emoji: string;
  input: number;
  output: number;
  cache_read: number;
  cache_create: number;
  total: number;
  context_pct: number;
}

interface TokenUsageData {
  today: string;
  window_label?: string;
  projects: TokenProject[];
  grand: { input: number; output: number; cache_read: number; cache_create: number; total: number };
  daily_total?: { input: number; output: number; cache_read: number; cache_create: number; total: number };
  daily_limit: number;
  usage_pct: number;
  window_pct?: number;
}

interface DashboardData {
  agents: AgentInfo[];
  system: { cpu: number; memory: number; disk: number; network: NetworkInfo };
  services?: ServiceInfo[];
  activity: { time: string; team: string; content: string }[];
  version: { server: string; python: string; claude_cli: string };
}

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h.startsWith("192.168.");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

function ProgressBar({ value, color = "bg-green-500", thin = false }: { value: number; color?: string; thin?: boolean }) {
  return (
    <div className={`w-full ${thin ? "h-1" : "h-1.5"} bg-[#2a2a3a] rounded-full overflow-hidden`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function metricColor(v: number) {
  if (v >= 85) return "bg-red-500";
  if (v >= 65) return "bg-yellow-500";
  return "bg-green-500";
}

function metricText(v: number) {
  if (v >= 85) return "text-red-400";
  if (v >= 65) return "text-yellow-400";
  return "text-green-400";
}

// ── 에이전트 카드 ──────────────────────────────────────
function AgentCard({ agent, onRestart }: { agent: AgentInfo; onRestart: (id: string) => void }) {
  const [restarting, setRestarting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await fetch(`${getApiBase()}/api/agents/${agent.id}/restart`, { method: "POST" });
      onRestart(agent.id);
    } finally {
      setRestarting(false);
    }
  };

  return (
    <>
    {confirming && (
      <ConfirmDialog
        message={`${agent.emoji} ${agent.name} 세션을 초기화할까요?\n진행 중인 작업이 중단됩니다.`}
        onConfirm={() => { setConfirming(false); handleRestart(); }}
        onCancel={() => setConfirming(false)}
      />
    )}
    <div className={`p-2 rounded border transition-colors ${
      agent.working ? "bg-yellow-500/5 border-yellow-500/30" : "bg-[#1a1a2e] border-[#2a2a4a]"
    }`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm shrink-0">{agent.emoji}</span>
          <span className="text-[10px] font-semibold text-gray-300 truncate">{agent.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {agent.working ? (
            <span className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
              <span className="text-[8px] text-yellow-400 font-bold">작업중</span>
            </span>
          ) : agent.pid ? (
            <span className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
              <span className="text-[8px] text-green-400">대기</span>
            </span>
          ) : (
            <span className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 bg-gray-500 rounded-full" />
              <span className="text-[8px] text-gray-500">대기</span>
            </span>
          )}
          <button
            onClick={() => setConfirming(true)}
            disabled={restarting}
            className="text-[8px] px-1.5 py-0.5 bg-[#2a2a3a] border border-[#3a3a5a] text-gray-500 rounded
                       hover:text-red-400 hover:border-red-500/40 disabled:opacity-30 transition-colors ml-1"
            title="세션 초기화"
          >
            {restarting ? "…" : "↺"}
          </button>
        </div>
      </div>

      {/* 현재 작업 상태만 표시 */}
      {agent.working && agent.tool ? (
        <div className="text-[9px] text-yellow-300/80 truncate">⚡ {agent.tool}</div>
      ) : null}

      {/* 작업중 로딩바 */}
      {agent.working && (
        <div className="mt-1.5">
          <ProgressBar value={100} color="bg-yellow-400/60" thin />
        </div>
      )}

      {/* CPU / 메모리 (작업 중일 때만) */}
      {agent.working && (agent.cpu !== null || agent.memory_mb !== null) && (
        <div className="mt-1.5 flex gap-2 text-[8px] text-gray-600">
          {agent.cpu !== null && (
            <span>CPU <span className="text-yellow-400">{agent.cpu}%</span></span>
          )}
          {agent.memory_mb !== null && (
            <span>MEM <span className="text-yellow-400">{agent.memory_mb}MB</span></span>
          )}
        </div>
      )}

      {/* 모델 + 세션 상태 */}
      <div className="mt-1 flex items-center gap-2 text-[8px] text-gray-600">
        <span>{agent.model_key}</span>
        {agent.tokens && agent.tokens.prompts > 0 && (
          <span>· {agent.tokens.prompts}회</span>
        )}
      </div>
    </div>
    </>
  );
}

// ── 서비스 상태 패널 ─────────────────────────────────────
function ServiceStatus({ services }: { services: ServiceInfo[] }) {
  return (
    <div className="space-y-1">
      <div className="text-[9px] text-gray-500 font-bold mb-1">🌐 서비스 상태</div>
      {services.map(svc => (
        <div key={svc.name} className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              svc.status === "ok" ? "bg-green-400" :
              svc.status === "warn" ? "bg-yellow-400" : "bg-red-500 animate-pulse"
            }`} />
            <span className="text-[9px] text-gray-400 truncate">{svc.name}</span>
          </div>
          <span className={`text-[8px] shrink-0 ${
            svc.status === "ok" ? "text-green-400" :
            svc.status === "warn" ? "text-yellow-400" : "text-red-400"
          }`}>
            {svc.status === "ok" ? "정상" :
             svc.status === "warn" ? `⚠ ${svc.code || "경고"}` :
             `✕ ${svc.error || "중단"}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function dangerColor(pct: number) {
  if (pct >= 80) return { bar: "bg-red-500", text: "text-red-400", stroke: "#ef4444" };
  if (pct >= 50) return { bar: "bg-yellow-500", text: "text-yellow-400", stroke: "#eab308" };
  return { bar: "bg-emerald-500", text: "text-emerald-400", stroke: "#10b981" };
}

// ── SVG 원형 게이지 ────────────────────────────────
function CircleGauge({ pct, size = 72 }: { pct: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * circ;
  const { stroke, text } = dangerColor(pct);

  return (
    <svg width={size} height={size} className="shrink-0">
      {/* 배경 트랙 */}
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2a2a3a" strokeWidth="6" />
      {/* 진행 호 */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      {/* 텍스트 */}
      <text
        x={size / 2} y={size / 2 - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        className={`font-bold ${text}`}
        style={{ fontSize: size * 0.22, fill: stroke, fontFamily: "monospace", fontWeight: 700 }}
      >
        {pct.toFixed(0)}%
      </text>
      <text
        x={size / 2} y={size / 2 + 10}
        textAnchor="middle"
        style={{ fontSize: size * 0.13, fill: "#6b7280" }}
      >
        사용
      </text>
    </svg>
  );
}

// ── 토큰 사용량 패널 ─────────────────────────────────
function TokenUsagePanel({ data }: { data: TokenUsageData }) {
  const maxTotal = Math.max(...data.projects.map(p => p.total), 1);
  const daily = data.daily_total ?? data.grand;
  const dailyCacheRatio = daily.total > 0
    ? Math.round((daily.cache_read / (daily.total + daily.cache_read)) * 100)
    : 0;
  const usagePct = data.usage_pct ?? 0;
  const windowPct = data.window_pct ?? 0;

  return (
    <div className="space-y-2">

      {/* ── 오늘 전체 사용량 (메인 게이지) ── */}
      <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded p-2.5">
        <div className="flex items-center gap-3">
          <CircleGauge pct={usagePct} size={72} />
          <div className="flex-1 min-w-0 space-y-1">
            <div className="text-[9px] text-gray-500 font-bold">오늘 사용량</div>
            <div className="flex items-baseline gap-1">
              <span className={`text-[13px] font-mono font-bold ${dangerColor(usagePct).text}`}>
                {fmtTokens(daily.total)}
              </span>
              <span className="text-[8px] text-gray-600">/ {fmtTokens(data.daily_limit)}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 text-[8px]">
              <span className="text-gray-600">입력 <span className="text-blue-400 font-mono">{fmtTokens(daily.input)}</span></span>
              <span className="text-gray-600">출력 <span className="text-green-400 font-mono">{fmtTokens(daily.output)}</span></span>
              <span className="text-gray-600">캐시 <span className="text-yellow-400 font-mono">{fmtTokens(daily.cache_read)}</span></span>
              <span className="text-gray-600">절감 <span className="text-yellow-300 font-mono">{dailyCacheRatio}%</span></span>
            </div>
            <div className="text-[7px] text-gray-700 pt-0.5">
              * Max 추정 한도 (DAILY_TOKEN_LIMIT 환경변수로 조정)
            </div>
          </div>
        </div>
        {/* 전체 프로그레스바 */}
        <div className="mt-2">
          <ProgressBar value={usagePct} color={dangerColor(usagePct).bar} />
        </div>
      </div>

      {/* ── 에이전트별 사용량 랭킹 ── */}
      {data.projects.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[8px] text-gray-600 font-bold">에이전트별 사용량 (많은 순)</div>
          {data.projects.map((p, i) => {
            const barPct = (p.total / maxTotal) * 100;
            const ctxPct = p.context_pct ?? 0;
            const colors = dangerColor(ctxPct);
            return (
              <div key={p.label} className="bg-[#131325] border border-[#1e1e36] rounded p-1.5 space-y-1">
                {/* 에이전트 이름 + 순위 + 총 토큰 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-[9px] text-gray-700 font-mono shrink-0 w-3">{i + 1}</span>
                    <span className="text-[9px] shrink-0">{p.emoji}</span>
                    <span className="text-[9px] text-gray-300 truncate font-medium">{p.label}</span>
                  </div>
                  <span className="text-[9px] font-mono text-purple-400 shrink-0 font-bold">
                    {fmtTokens(p.total)}
                  </span>
                </div>

                {/* 사용량 막대 (입력+출력) */}
                <div className="w-full h-1.5 bg-[#2a2a3a] rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-blue-500/70"
                    style={{ width: `${(p.input / maxTotal) * 100}%`, transition: "width 0.5s ease" }}
                  />
                  <div
                    className="h-full bg-green-500/70"
                    style={{ width: `${(p.output / maxTotal) * 100}%`, transition: "width 0.5s ease" }}
                  />
                </div>

                {/* 컨텍스트 사용률 */}
                <div className="flex items-center justify-between">
                  <span className="text-[7px] text-gray-600">컨텍스트 창</span>
                  <div className="flex items-center gap-1">
                    <div className="w-16 h-1 bg-[#2a2a3a] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${colors.bar}`}
                        style={{ width: `${ctxPct}%`, transition: "width 0.5s ease" }}
                      />
                    </div>
                    <span className={`text-[7px] font-mono ${colors.text}`}>{ctxPct.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex gap-3 text-[7px] text-gray-600">
            <span className="flex items-center gap-0.5"><span className="w-2 h-1 bg-blue-500/70 rounded-sm inline-block"/>입력</span>
            <span className="flex items-center gap-0.5"><span className="w-2 h-1 bg-green-500/70 rounded-sm inline-block"/>출력</span>
            <span className="flex items-center gap-0.5"><span className="w-2 h-1 bg-emerald-500 rounded-sm inline-block"/>컨텍스트 정상</span>
            <span className="flex items-center gap-0.5"><span className="w-2 h-1 bg-red-500 rounded-sm inline-block"/>위험</span>
          </div>
        </div>
      )}

      {data.projects.length === 0 && (
        <div className="text-[8px] text-gray-600 text-center py-2">오늘 사용 기록 없음</div>
      )}
    </div>
  );
}

// ── 메인 대시보드 ──────────────────────────────────────
export default function ServerDashboard({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tokenData, setTokenData] = useState<TokenUsageData | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(`${getApiBase()}/api/dashboard`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError(false);
      setLastUpdated(new Date().toLocaleTimeString("ko-KR"));
    } catch {
      clearTimeout(t);
      setError(true);
    }
  }, []);

  const fetchTokenUsage = useCallback(async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`${getApiBase()}/api/token-usage`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return;
      setTokenData(await res.json());
    } catch {
      // 토큰 데이터 오류는 무시 (대시보드 동작에 영향 없음)
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 2000);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    fetchTokenUsage();
    const id = setInterval(fetchTokenUsage, 30000); // 30초마다 갱신
    return () => clearInterval(id);
  }, [fetchTokenUsage]);

  const workingCount = data?.agents.filter(a => a.working).length ?? 0;

  const handleHardRefresh = () => {
    fetchData();
    fetchTokenUsage();
    window.location.reload();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 text-[10px]">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${error ? "bg-red-500" : "bg-green-400 animate-pulse"}`} />
          <span className="text-gray-500 text-[9px]">{error ? "연결 오류" : `갱신 ${lastUpdated}`}</span>
        </div>
        <div className="flex items-center gap-1">
          {workingCount > 0 && (
            <span className="text-[8px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded">
              {workingCount}개 작업중
            </span>
          )}
          <button
            onClick={handleHardRefresh}
            className="text-[8px] px-1.5 py-0.5 bg-[#1a1a3a] border border-[#2a2a5a] text-gray-400 rounded
                       hover:text-yellow-400 hover:border-yellow-400/40 transition-colors"
            title="강제 새로고침"
          >
            ↺ 새로고침
          </button>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xs px-1">✕</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 min-h-0 pr-0.5">

        {/* ── 시스템 리소스 + 토큰 사용량 ── */}
        {data && (
          <section>
            <h3 className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">시스템 리소스</h3>
            <div className="space-y-2 bg-[#1a1a2e] border border-[#2a2a4a] rounded p-2.5">
              {([
                { label: "CPU",    value: data.system.cpu    },
                { label: "메모리", value: data.system.memory },
                { label: "디스크", value: data.system.disk   },
              ] as { label: string; value: number }[]).map(({ label, value }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-400">{label}</span>
                    <span className={`text-[10px] font-mono font-semibold ${metricText(value)}`}>{value}%</span>
                  </div>
                  <ProgressBar value={value} color={metricColor(value)} />
                </div>
              ))}
              {/* 토큰 사용량 (인라인) */}
              {tokenData && (() => {
                const tPct = tokenData.usage_pct ?? 0;
                return (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-gray-400">🔢 토큰 (오늘)</span>
                      <span className={`text-[10px] font-mono font-semibold ${metricText(tPct)}`}>{tPct.toFixed(1)}%</span>
                    </div>
                    <ProgressBar value={tPct} color={metricColor(tPct)} />
                  </div>
                );
              })()}
              {/* 네트워크 상태 */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">네트워크</span>
                <span className={`text-[10px] font-mono font-semibold ${
                  data.system.network?.quality === "안정" ? "text-green-400" :
                  data.system.network?.quality === "보통" ? "text-yellow-400" :
                  data.system.network?.quality === "불안" ? "text-red-400" :
                  "text-red-500"
                }`}>
                  {data.system.network?.connected
                    ? `${data.system.network.type === "ethernet" ? "유선" : "WiFi"} · ${data.system.network.quality}`
                    : "끊김"}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* ── 에이전트 현황 ── */}
        {data && (
          <section>
            <h3 className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">
              에이전트 현황 <span className="text-gray-700 normal-case">({data.agents.length}개)</span>
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {data.agents.map(agent => (
                <AgentCard key={agent.id} agent={agent} onRestart={fetchData} />
              ))}
            </div>
          </section>
        )}

        {/* ── 토큰 사용량 상세 ── */}
        {tokenData && (
          <section>
            <h3 className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">
              🔢 토큰 사용량
              <span className="text-gray-700 normal-case ml-1 text-[8px]">
                최근 5시간 {tokenData.window_label ? `(${tokenData.window_label})` : ""}
              </span>
            </h3>
            <TokenUsagePanel data={tokenData} />
          </section>
        )}

        {/* ── 서비스 상태 ── */}
        {data?.services && data.services.length > 0 && (
          <section>
            <h3 className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">
              서비스 상태
              {data.services.some(s => s.status === "down") && (
                <span className="text-red-400 ml-1 normal-case">⚠ 장애 감지</span>
              )}
            </h3>
            <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded p-2">
              <ServiceStatus services={data.services} />
            </div>
          </section>
        )}

        {/* ── 최근 활동 ── */}
        {data && data.activity.length > 0 && (
          <section>
            <h3 className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">최근 활동</h3>
            <div className="bg-[#0a0a1a] border border-[#1a1a3a] rounded p-2 space-y-1 max-h-28 overflow-y-auto">
              {data.activity.map((act, i) => (
                <div key={i} className="flex gap-1.5 text-[8px]">
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
            <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded p-2 space-y-1">
              {([
                ["서버",       `v${data.version.server}`],
                ["Python",     data.version.python],
                ["Claude CLI", data.version.claude_cli],
                ["사이트",     "600g.net"],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-600">{k}</span>
                  <span className="text-gray-400 font-mono text-[9px]">{v}</span>
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
