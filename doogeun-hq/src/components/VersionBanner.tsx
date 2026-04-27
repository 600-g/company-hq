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
  next_version?: string;
  total_commits?: number;
}

interface DeployStatus {
  ok: boolean;
  running: boolean;
  started_at?: number;
  log_tail: string[];
  last_result?: VersionInfo;
  error?: string | null;
}

/** 진행률 추론 — deploy.sh 의 log_tail 키워드로 stage 매핑.
 *  단조 증가: 이전 pct 보다 작아지지 않게 호출자가 보장.
 */
function inferProgress(logTail: string[]): { pct: number; stage: string } {
  const text = logTail.join("\n");
  if (text.includes("FastAPI 재시작")) return { pct: 96, stage: "백엔드 재시작 중..." };
  if (text.includes("✅ Done")) return { pct: 92, stage: "배포 완료, 마무리..." };
  if (text.includes("Deployment complete")) return { pct: 88, stage: "Cloudflare 배포 완료" };
  if (text.includes("Uploading _headers")) return { pct: 80, stage: "헤더 업로드..." };
  if (/Uploaded \d+ files/.test(text)) return { pct: 75, stage: "파일 업로드 완료" };
  if (text.includes("Uploading...")) return { pct: 60, stage: "Cloudflare Pages 업로드 중..." };
  if (text.includes("🚀 Cloudflare")) return { pct: 55, stage: "배포 시작..." };
  if (text.includes("파일 수:")) return { pct: 50, stage: "빌드 산출물 정리..." };
  if (/\(Static\)|prerendered as static/.test(text)) return { pct: 45, stage: "Next.js 빌드 완료" };
  if (/Compiled successfully|✓ Compiled/.test(text)) return { pct: 40, stage: "컴파일 완료" };
  if (text.includes("Generating static pages")) return { pct: 30, stage: "정적 페이지 생성 중..." };
  if (text.includes("Collecting page data")) return { pct: 25, stage: "페이지 데이터 수집..." };
  if (text.includes("Linting")) return { pct: 20, stage: "코드 검사 중..." };
  if (/🔨|Building/.test(text)) return { pct: 12, stage: "Next.js 빌드 시작..." };
  if (text.includes("📦")) return { pct: 6, stage: "초기화..." };
  return { pct: 3, stage: "시작 중..." };
}

/** 버전 표시 + git HEAD 비교 + 사용자 클릭 시 무중단 배포.
 *
 * 흐름:
 *   1. 현재 로드된 build (window.__DOOGEUN_LOADED_BUILD__) vs server git HEAD commit
 *      → 다르면 "미반영 변경" 알림
 *   2. [적용] 클릭 → POST /api/admin/deploy → 백그라운드 deploy.sh
 *      · 진행 중 화면 정중앙 큰 팝업 + 진행률 게이지 + stage 텍스트 + log tail
 *      · 완료 시 자동 reload
 */
export default function VersionBanner() {
  const [loaded, setLoaded] = useState<VersionInfo | null>(null);
  const [latestBuild, setLatestBuild] = useState<VersionInfo | null>(null);
  const [gitHead, setGitHead] = useState<GitHead | null>(null);
  const [deploy, setDeploy] = useState<DeployStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [progressPct, setProgressPct] = useState(0); // 단조 증가
  const [progressStage, setProgressStage] = useState<string>("");
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
      setProgressPct(0);
      setProgressStage("시작 중...");
      const r = await fetch(`${apiBase()}/api/admin/deploy`, { method: "POST" });
      const d = await r.json();
      if (!d.ok) {
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
        if (d.log_tail && d.log_tail.length > 0) {
          const inferred = inferProgress(d.log_tail);
          setProgressPct((prev) => Math.max(prev, inferred.pct));
          setProgressStage(inferred.stage);
        }
        if (!d.running && d.last_result) {
          setProgressPct(100);
          setProgressStage("완료 — 새로고침 중...");
          if (deployPollTimer.current) clearInterval(deployPollTimer.current);
          setTimeout(() => location.reload(), 1500);
        }
        if (!d.running && d.error) {
          if (deployPollTimer.current) clearInterval(deployPollTimer.current);
        }
      } catch { /* ignore */ }
    };
    tick();
    deployPollTimer.current = setInterval(tick, 1200);
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

      {/* (1) 진행 중 — 화면 정중앙 큰 모달 + 진행률 게이지 (사용자가 닫을 수 없음) */}
      {deploy?.running && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-sky-400/50 bg-gray-950/98 shadow-2xl overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-sky-500/20 border border-sky-400/50 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-sky-300 animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-bold text-sky-100">업데이트 적용 중</div>
                  <div className="text-[11px] text-gray-400">{progressStage || "준비 중..."}</div>
                </div>
                <div className="text-[20px] font-bold font-mono text-sky-200 tabular-nums">{progressPct}%</div>
              </div>

              {/* 진행률 게이지 — sky 그라디언트 */}
              <div className="h-3 rounded-full bg-gray-800/80 border border-gray-700/50 overflow-hidden mb-3">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 via-blue-400 to-cyan-300 transition-all duration-700 ease-out shadow-[0_0_12px_rgba(56,189,248,0.6)]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              <div className="text-[11px] text-gray-400 leading-relaxed mb-3">
                약 1~2분 소요. 채팅 계속 가능 — 완료 시 자동 새로고침됩니다.
              </div>

              {/* 로그 tail */}
              {deploy.log_tail && deploy.log_tail.length > 0 && (
                <details className="text-[10px]">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-300">상세 로그</summary>
                  <pre className="mt-2 p-2 rounded bg-black/60 border border-gray-800 text-[9.5px] text-gray-400 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto leading-snug">
                    {deploy.log_tail.slice(-10).join("\n")}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {/* (2) 에러 / (3) 미반영 알림 — 우하단 카드 */}
      {!deploy?.running && (deploy?.error || (hasPending && !dismissed)) && (
        <div className="fixed bottom-4 right-4 z-[300] max-w-sm">
          <div className="rounded-lg border border-sky-400/50 bg-gray-950/95 backdrop-blur shadow-2xl overflow-hidden">
            <div className="flex items-start gap-2 p-3">
              <div className="shrink-0 w-7 h-7 rounded-full bg-sky-500/20 border border-sky-400/40 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-sky-300" />
              </div>
              <div className="flex-1 min-w-0">
                {deploy?.error ? (
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
                ) : (
                  <>
                    {/* 새 버전 숫자 강조 */}
                    <div className="text-[13px] flex items-center gap-1.5">
                      <span className="text-gray-400 font-mono">v{latestBuild?.version || "?"}</span>
                      <span className="text-gray-600">→</span>
                      <span className="text-sky-100 font-bold font-mono text-[16px]">v{gitHead?.next_version || "?"}</span>
                    </div>
                    <div className="text-[13px] font-bold text-sky-100 mt-1">업데이트 하세요 ✨</div>
                    {gitHead?.subject && (
                      <div className="text-[10px] text-gray-400 mt-1 italic break-words leading-relaxed">
                        “{gitHead.subject.slice(0, 90)}”
                      </div>
                    )}
                    <div className="text-[9px] text-gray-500 mt-1 font-mono">
                      {productionCommit.slice(0, 8)} → {gitCommit.slice(0, 8)}
                    </div>
                    <div className="flex gap-1.5 mt-2.5">
                      <button
                        onClick={startDeploy}
                        className="flex-1 h-8 rounded-md text-[12px] font-bold bg-sky-500/25 border border-sky-400/70 text-sky-50 hover:bg-sky-500/40 transition-colors flex items-center justify-center gap-1.5 shadow-[0_0_10px_rgba(56,189,248,0.3)]"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        지금 업데이트
                      </button>
                      <button
                        onClick={() => setDismissed(true)}
                        className="px-2.5 h-8 rounded-md text-[11px] border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
                      >
                        나중에
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => { setDismissed(true); setDeploy(null); }}
                className="shrink-0 text-gray-500 hover:text-gray-200"
                title="닫기"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
