"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, RefreshCw, X, Loader2 } from "lucide-react";
import { apiBase } from "@/lib/utils";
import { useVersionStore } from "@/stores/versionStore";

declare global {
  interface Window {
    __DOOGEUN_LOADED_BUILD__?: string;
    __DEPLOY_IN_PROGRESS__?: boolean; // 배포 진행 중 플래그 — WS 메시지 억제용
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

interface ReleaseGroup {
  type: string;
  emoji: string;
  label: string;
  items: { hash: string; title: string; scope: string }[];
}
interface ReleaseNotes {
  ok: boolean;
  total_commits?: number;
  groups?: ReleaseGroup[];
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
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNotes | null>(null);
  const isDismissedFor = useVersionStore((s) => s.isDismissedFor);
  const setDismissedCommit = useVersionStore((s) => s.setDismissedCommit);
  const setCache = useVersionStore((s) => s.setCache);
  const [progressPct, setProgressPct] = useState(0); // 단조 증가
  const [progressStage, setProgressStage] = useState<string>("");
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const deployPollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 마운트 1회 + 60초 polling
  useEffect(() => {
    let mounted = true;

    const fetchAll = async () => {
      // /version.json — production build (CF Pages)
      let prodVerNow = "?";
      let prodBuildNow = "";
      try {
        const r = await fetch("/version.json", { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          if (typeof d?.build === "string") {
            const v = { build: d.build, version: d.version || "?", ts: d.ts || 0 };
            if (!window.__DOOGEUN_LOADED_BUILD__) window.__DOOGEUN_LOADED_BUILD__ = v.build;
            if (mounted) setLatestBuild(v);
            prodVerNow = v.version;
            prodBuildNow = v.build;
          }
        }
      } catch { /* ignore */ }

      // git HEAD — 미반영 commit 감지 (release-notes 와 공유 — 중복 fetch 제거)
      let gitCommitNow = "";
      let nextVerNow: string | undefined = undefined;
      try {
        const r = await fetch(`${apiBase()}/api/admin/git-head`, { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          if (mounted) setGitHead(d);
          gitCommitNow = (d.commit || "") as string;
          nextVerNow = d.next_version;
        }
      } catch { /* ignore */ }

      // VersionBadge 가 자체 fetch 없이 읽도록 캐시 갱신 — 매분 fetch 2 → 1 (50% 절감)
      if (mounted && prodBuildNow && gitCommitNow) {
        setCache({
          build: prodBuildNow,
          version: prodVerNow,
          commit: gitCommitNow,
          nextVersion: nextVerNow,
          ts: Date.now(),
        });
      }

      // 릴리즈 노트 — 미반영 변경 있을 때만 fetch (없으면 모달도 안 띄우니 낭비)
      // production commit !== git HEAD 일 때만 호출 → 평소엔 매분 1 fetch 줄임
      const prodBuild = window.__DOOGEUN_LOADED_BUILD__ || "";
      const prodCommit = prodBuild.split("-")[0];
      if (prodCommit && gitCommitNow && prodCommit !== gitCommitNow) {
        try {
          const r = await fetch(`${apiBase()}/api/admin/release-notes?from_commit=${encodeURIComponent(prodCommit)}`, { cache: "no-store" });
          if (r.ok) {
            const d = await r.json();
            if (mounted && d.ok) setReleaseNotes(d);
          }
        } catch { /* ignore */ }
      }
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

  // 🔑 사용자가 마지막으로 적용한 build — localStorage 에 영구 (탭/세션/디바이스 무관)
  //    git HEAD 가 새 commit 으로 바뀔 때까지 알림 차단 — CF edge 지연 무관
  //    (이전 sessionStorage 는 새 탭/시크릿모드에서 사라져 알림 반복 트리거)
  const appliedBuild = (() => {
    try { return localStorage.getItem("doogeun-hq-applied-build") || ""; } catch { return ""; }
  })();
  const appliedCommit = appliedBuild.split("-")[0];
  // 적용한 build 의 commit 이 현재 git HEAD 와 일치 → 이미 최신 적용 완료
  const userAppliedAlready = !!(appliedCommit && gitCommit && appliedCommit === gitCommit);

  // 보조 cooldown (10초 — reload 직후 race window 보호용)
  const cooldownActive = (() => {
    try {
      const expiry = Number(localStorage.getItem("doogeun-hq-reload-cooldown") || "0");
      return Date.now() < expiry;
    } catch { return false; }
  })();

  const hasPending = !userAppliedAlready && !cooldownActive &&
    !!(productionCommit && gitCommit && productionCommit !== gitCommit);

  const startDeploy = async () => {
    try {
      setProgressPct(0);
      setProgressStage("시작 중...");
      // 배포 진행 중 플래그 설정 — WS 메시지 억제
      if (typeof window !== "undefined") {
        (window as any).__DEPLOY_IN_PROGRESS__ = true;
      }
      const r = await fetch(`${apiBase()}/api/admin/deploy`, { method: "POST" });
      const d = await r.json();
      if (!d.ok) {
        if (d.running) startDeployPolling();
        return;
      }
      startDeployPolling();
    } catch (e) {
      console.error("[deploy] 시작 실패", e);
      // 에러 시 플래그 제거
      if (typeof window !== "undefined") {
        (window as any).__DEPLOY_IN_PROGRESS__ = false;
      }
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
          setProgressPct(96);
          setProgressStage("CF edge 동기화 대기 중...");
          if (deployPollTimer.current) clearInterval(deployPollTimer.current);
          // 배포 진행 중 플래그 해제 — CF 동기화는 자동으로 진행
          if (typeof window !== "undefined") {
            (window as any).__DEPLOY_IN_PROGRESS__ = false;
          }
          // CF Pages 의 production alias propagation 시간 — version.json 이 새 build 가리킬 때까지 polling
          const targetBuild = d.last_result.build;
          // 🔑 사용자가 적용한 build 영구 마킹 (localStorage) — 탭/세션/디바이스 무관 영구
          //    cooldown 시간 기반 X → commit 일치 기반 (git HEAD 가 새 commit 으로 바뀔 때까지 영구)
          try { localStorage.setItem("doogeun-hq-applied-build", targetBuild); } catch { /* ignore */ }
          // 임시 cooldown 기다리기 (90초 — CF edge 동기화 대기, 이전 버전 서빙 중 팝업 재표시 방지)
          try { localStorage.setItem("doogeun-hq-reload-cooldown", String(Date.now() + 90_000)); } catch { /* ignore */ }
          const startTs = Date.now();
          const verifyAndReload = async () => {
            const elapsed = Date.now() - startTs;
            try {
              const r = await fetch("/version.json?_t=" + Date.now(), { cache: "no-store" });
              if (r.ok) {
                const v = await r.json();
                if (v.build === targetBuild) {
                  setProgressPct(100);
                  setProgressStage("완료 — 새로고침 중...");
                  setTimeout(() => location.reload(), 800);
                  return;
                }
              }
            } catch { /* ignore */ }
            if (elapsed > 30_000) {
              setProgressStage("CF edge 지연 — 그대로 새로고침 (적용은 정상)");
              setTimeout(() => location.reload(), 800);
              return;
            }
            setTimeout(verifyAndReload, 2000);
          };
          verifyAndReload();
        }
        if (!d.running && d.error) {
          if (deployPollTimer.current) clearInterval(deployPollTimer.current);
          // 배포 실패 시 플래그 해제
          if (typeof window !== "undefined") {
            (window as any).__DEPLOY_IN_PROGRESS__ = false;
          }
        }
      } catch { /* ignore */ }
    };
    tick();
    deployPollTimer.current = setInterval(tick, 1200);
  };

  if (!loaded && !latestBuild) return null;

  // 모달 표시 조건 — 진행 중 / 에러 / 미반영 알림 (단, 같은 commit 에 dismiss 했으면 모달 안 띄움)
  const dismissedForThis = isDismissedFor(gitCommit);
  const showModal = deploy?.running || deploy?.error || (hasPending && !dismissedForThis);
  if (!showModal) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-sky-400/50 bg-gray-950/98 shadow-2xl overflow-hidden">
        {/* (1) 진행 중 — 닫기 불가 */}
        {deploy?.running && (
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

            <div className="h-3 rounded-full bg-gray-800/80 border border-gray-700/50 overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 via-blue-400 to-cyan-300 transition-all duration-700 ease-out shadow-[0_0_12px_rgba(56,189,248,0.6)]"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="text-[11px] text-gray-400 leading-relaxed mb-3">
              약 1~2분 소요. 채팅 계속 가능 — 완료 시 자동 새로고침됩니다.
            </div>

            {deploy.log_tail && deploy.log_tail.length > 0 && (
              <details className="text-[10px]">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-300">상세 로그</summary>
                <pre className="mt-2 p-2 rounded bg-black/60 border border-gray-800 text-[9.5px] text-gray-400 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto leading-snug">
                  {deploy.log_tail.slice(-10).join("\n")}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* (2) 에러 */}
        {!deploy?.running && deploy?.error && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-400/50 flex items-center justify-center text-[18px]">
                ❌
              </div>
              <div className="flex-1">
                <div className="text-[15px] font-bold text-red-200">업데이트 실패</div>
                <div className="text-[11px] text-red-300/80 mt-0.5 break-all">{deploy.error}</div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={startDeploy}
                className="flex-1 h-10 rounded-md text-[13px] font-bold bg-amber-500/20 border border-amber-400/60 text-amber-100 hover:bg-amber-500/30 flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" /> 재시도
              </button>
              <button
                onClick={() => { setDismissedCommit(gitCommit); setDeploy(null); }}
                className="px-4 h-10 rounded-md text-[12px] border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500"
              >
                닫기
              </button>
            </div>
          </div>
        )}

        {/* (3) 미반영 알림 — 새 버전 강조 */}
        {!deploy?.running && !deploy?.error && hasPending && !dismissedForThis && (
          <>
            <div className="p-6 pb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-sky-500/20 border border-sky-400/50 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-sky-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-gray-400 mb-0.5">새 버전 사용 가능</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-mono text-gray-500">v{latestBuild?.version || "?"}</span>
                    <span className="text-gray-600">→</span>
                    <span className="text-[20px] font-bold font-mono text-sky-100">v{gitHead?.next_version || "?"}</span>
                  </div>
                </div>
                <button
                  onClick={() => setDismissedCommit(gitCommit)}
                  className="shrink-0 text-gray-500 hover:text-gray-200 -mt-2 -mr-2 p-2"
                  title="닫기"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-[13px] font-bold text-sky-100 mb-2">업데이트 하세요 ✨</div>

              {/* 패치노트 — 카테고리별 정리 */}
              {releaseNotes?.groups && releaseNotes.groups.length > 0 ? (
                <div className="rounded-md border border-gray-800 bg-gray-900/40 p-3 text-[12px] mb-2 max-h-48 overflow-y-auto">
                  <div className="text-[10px] text-gray-500 mb-2 font-mono">
                    📋 패치노트 ({releaseNotes.total_commits}건)
                  </div>
                  <div className="space-y-2.5">
                    {releaseNotes.groups.map((g) => (
                      <div key={g.type}>
                        <div className="text-[11px] font-bold text-sky-200 mb-0.5 flex items-center gap-1">
                          <span>{g.emoji}</span>
                          <span>{g.label}</span>
                          <span className="text-gray-500 font-mono font-normal">({g.items.length})</span>
                        </div>
                        <ul className="text-[11px] text-gray-300 space-y-0.5 pl-4 leading-relaxed">
                          {g.items.slice(0, 5).map((it) => (
                            <li key={it.hash} className="list-disc">
                              {it.scope && <span className="text-gray-500 font-mono">[{it.scope}]</span>}{" "}
                              {it.title}
                            </li>
                          ))}
                          {g.items.length > 5 && (
                            <li className="text-gray-500 list-none pl-0 text-[10px]">… 외 {g.items.length - 5}건</li>
                          )}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* fallback — release-notes endpoint 응답 전 또는 빈 결과면 commit subject 인용 */
                gitHead?.subject && (
                  <div className="rounded-md border border-gray-800 bg-gray-900/40 p-3 text-[12px] text-gray-300 leading-relaxed italic mb-2">
                    “{gitHead.subject.slice(0, 120)}”
                  </div>
                )
              )}
              <div className="text-[10px] text-gray-500 font-mono mb-4">
                {productionCommit.slice(0, 9)} → {gitCommit.slice(0, 9)}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={startDeploy}
                  className="flex-1 h-11 rounded-md text-[14px] font-bold bg-sky-500/25 border border-sky-400/70 text-sky-50 hover:bg-sky-500/40 transition-colors flex items-center justify-center gap-2 shadow-[0_0_14px_rgba(56,189,248,0.35)]"
                >
                  <RefreshCw className="w-4 h-4" />
                  지금 업데이트
                </button>
                <button
                  onClick={() => setDismissedCommit(gitCommit)}
                  className="px-4 h-11 rounded-md text-[12px] border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
                >
                  나중에
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
