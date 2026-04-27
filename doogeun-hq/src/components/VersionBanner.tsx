"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, RefreshCw, X, Loader2, GitCommit } from "lucide-react";
import { apiBase } from "@/lib/utils";

declare global {
  interface Window {
    __DOOGEUN_LOADED_BUILD__?: string;
  }
}

interface VersionInfo {
  build: string;
  version: string;
  ts: number;
}

interface GitHead {
  ok: boolean;
  commit?: string;
  subject?: string;
  commit_ts?: number;
}

interface DeployStatus {
  ok: boolean;
  running: boolean;
  started_at?: number;
  log_tail: string[];
  last_result?: VersionInfo;
  error?: string | null;
}

/** 버전 표시 + git HEAD 비교 + 사용자 클릭 시 무중단 배포.
 *
 * 흐름:
 *   1. 현재 로드된 build (window.__DOOGEUN_LOADED_BUILD__) vs server git HEAD commit
 *      → 다르면 "미반영 변경" 알림
 *   2. [적용] 클릭 → POST /api/admin/deploy → 백그라운드 deploy.sh
 *      · 진행 중 spinner + log tail
 *      · 완료 시 자동 reload (사용자가 dismiss 했으면 안 함)
 *   3. 채팅 끊김 0 — deploy 완료 후에만 reload, 사용자 통제
 */
export default function VersionBanner() {
  const [loaded, setLoaded] = useState<VersionInfo | null>(null);
  const [latestBuild, setLatestBuild] = useState<VersionInfo | null>(null);
  const [gitHead, setGitHead] = useState<GitHead | null>(null);
  const [deploy, setDeploy] = useState<DeployStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const deployPollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 마운트 1회 + 60초 polling
  useEffect(() => {
    let mounted = true;

    const fetchAll = async () => {
      // /version.json — production build (CF Pages)
      try {
        const r = await fetch("/version.json", { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          if (typeof d?.build === "string") {
            const v = { build: d.build, version: d.version || "?", ts: d.ts || 0 };
            if (!window.__DOOGEUN_LOADED_BUILD__) window.__DOOGEUN_LOADED_BUILD__ = v.build;
            if (mounted) setLatestBuild(v);
          }
        }
      } catch { /* ignore */ }

      // git HEAD — 미반영 commit 감지
      try {
        const r = await fetch(`${apiBase()}/api/admin/git-head`, { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          if (mounted) setGitHead(d);
        }
      } catch { /* ignore */ }
    };

    (async () => {
      await fetchAll();
      if (mounted && window.__DOOGEUN_LOADED_BUILD__) {
        setLoaded({ build: window.__DOOGEUN_LOADED_BUILD__, version: "loaded", ts: 0 });
      }
    })();

    pollTimer.current = setInterval(fetchAll, 60_000);
    return () => {
      mounted = false;
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (deployPollTimer.current) clearInterval(deployPollTimer.current);
    };
  }, []);

  // 미반영 변경 감지 — production build hash 가 git HEAD commit 과 다른지
  // build 형식: "{commit}-{timestamp}" → 앞부분이 commit hash
  const productionCommit = latestBuild?.build?.split("-")[0] || "";
  const gitCommit = gitHead?.commit || "";
  const hasPending = !!(productionCommit && gitCommit && productionCommit !== gitCommit);

  const startDeploy = async () => {
    try {
      const r = await fetch(`${apiBase()}/api/admin/deploy`, { method: "POST" });
      const d = await r.json();
      if (!d.ok) {
        // 이미 진행 중이면 status polling 시작
        if (d.running) startDeployPolling();
        return;
      }
      startDeployPolling();
    } catch (e) {
      console.error("[deploy] 시작 실패", e);
    }
  };

  const startDeployPolling = () => {
    if (deployPollTimer.current) clearInterval(deployPollTimer.current);
    const tick = async () => {
      try {
        const r = await fetch(`${apiBase()}/api/admin/deploy/status`, { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        setDeploy(d);
        if (!d.running && d.last_result) {
          // 배포 완료 — 폴링 중단 + 자동 reload (3초 후)
          if (deployPollTimer.current) clearInterval(deployPollTimer.current);
          setTimeout(() => location.reload(), 3000);
        }
        if (!d.running && d.error) {
          if (deployPollTimer.current) clearInterval(deployPollTimer.current);
        }
      } catch { /* ignore */ }
    };
    tick();
    deployPollTimer.current = setInterval(tick, 1500);
  };

  if (!loaded && !latestBuild) return null;

  const showBuild = loaded?.build || latestBuild?.build || "";
  const showVer = latestBuild?.version || "?";

  const showCard = (hasPending && !dismissed) || deploy?.running || deploy?.error;

  return (
    <>
      {/* 항상 작은 버전 배지 — 좌하단 */}
      <div
        onClick={() => setExpanded((v) => !v)}
        className="fixed bottom-2 left-2 z-[60] flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono bg-gray-900/80 border border-gray-700/60 text-gray-400 backdrop-blur cursor-pointer hover:text-gray-200 hover:border-gray-500 transition-colors select-none"
        title="버전 정보 토글"
      >
        v{showVer}
        <span className="text-gray-600">·</span>
        <span className="text-[9px] opacity-70">{showBuild.slice(0, 9)}</span>
        {hasPending && !dismissed && (
          <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" title="미반영 변경 있음" />
        )}
      </div>

      {/* 확장 — 상세 정보 */}
      {expanded && (
        <div className="fixed bottom-10 left-2 z-[60] max-w-xs rounded-md border border-gray-700/80 bg-gray-950/95 backdrop-blur p-3 text-[11px] text-gray-300 shadow-xl">
          <div className="font-bold text-gray-200 mb-1">현재 라이브 (production)</div>
          <div className="font-mono text-gray-400">v{showVer}</div>
          <div className="font-mono text-[10px] text-gray-500">{showBuild}</div>
          {gitHead?.ok && (
            <>
              <div className="font-bold text-gray-200 mt-2 mb-1 flex items-center gap-1">
                <GitCommit className="w-3 h-3" /> git HEAD (서버 main 브랜치)
              </div>
              <div className="font-mono text-gray-400">{gitHead.commit}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{gitHead.subject}</div>
            </>
          )}
          <button onClick={() => setExpanded(false)} className="mt-2 text-[10px] text-gray-500 hover:text-gray-200">닫기</button>
        </div>
      )}

      {/* 미반영 변경 알림 / 배포 진행 카드 — 우하단 */}
      {showCard && (
        <div className="fixed bottom-4 right-4 z-[300] max-w-sm">
          <div className="rounded-lg border border-sky-400/50 bg-gray-950/95 backdrop-blur shadow-2xl overflow-hidden">
            <div className="flex items-start gap-2 p-3">
              <div className="shrink-0 w-7 h-7 rounded-full bg-sky-500/20 border border-sky-400/40 flex items-center justify-center">
                {deploy?.running ? <Loader2 className="w-3.5 h-3.5 text-sky-300 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-sky-300" />}
              </div>
              <div className="flex-1 min-w-0">
                {/* 진행 중 */}
                {deploy?.running && (
                  <>
                    <div className="text-[12px] font-bold text-sky-100">배포 진행 중...</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      약 1~2분 소요. 채팅 계속 가능 (완료 후 자동 새로고침).
                    </div>
                    {deploy.log_tail && deploy.log_tail.length > 0 && (
                      <pre className="mt-2 p-2 rounded bg-black/40 border border-gray-800 text-[9px] text-gray-400 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {deploy.log_tail.slice(-8).join("\n")}
                      </pre>
                    )}
                  </>
                )}

                {/* 에러 */}
                {!deploy?.running && deploy?.error && (
                  <>
                    <div className="text-[12px] font-bold text-red-200">배포 실패</div>
                    <div className="text-[10px] text-red-300 mt-0.5 break-all">{deploy.error}</div>
                    <button
                      onClick={startDeploy}
                      className="mt-2 h-7 px-2 rounded-md text-[11px] bg-amber-500/20 border border-amber-400/60 text-amber-100 hover:bg-amber-500/30 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> 재시도
                    </button>
                  </>
                )}

                {/* 미반영 변경 알림 */}
                {!deploy?.running && !deploy?.error && hasPending && (
                  <>
                    <div className="text-[12px] font-bold text-sky-100">새 변경 사항</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      라이브 미반영 commit 감지 — 적용 시 사이트 갱신
                    </div>
                    {gitHead?.subject && (
                      <div className="text-[10px] text-gray-300 mt-1.5 italic break-words">
                        “{gitHead.subject.slice(0, 80)}”
                      </div>
                    )}
                    <div className="text-[9px] text-gray-500 mt-1 font-mono">
                      {productionCommit.slice(0, 8)} → {gitCommit.slice(0, 8)}
                    </div>
                    <div className="flex gap-1.5 mt-2">
                      <button
                        onClick={startDeploy}
                        className="flex-1 h-7 rounded-md text-[11px] font-bold bg-sky-500/20 border border-sky-400/60 text-sky-100 hover:bg-sky-500/30 transition-colors flex items-center justify-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        지금 적용 (1~2분)
                      </button>
                      <button
                        onClick={() => setDismissed(true)}
                        className="px-2 h-7 rounded-md text-[11px] border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
                      >
                        나중에
                      </button>
                    </div>
                  </>
                )}
              </div>
              {!deploy?.running && (
                <button
                  onClick={() => { setDismissed(true); setDeploy(null); }}
                  className="shrink-0 text-gray-500 hover:text-gray-200"
                  title="닫기"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
