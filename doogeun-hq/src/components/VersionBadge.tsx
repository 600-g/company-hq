"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { apiBase } from "@/lib/utils";
import { useVersionStore } from "@/stores/versionStore";

interface VInfo {
  build: string;
  version: string;
}

interface GitInfo {
  commit?: string;
  next_version?: string;
}

/** 사이드바 하단 오너 정보 위에 인라인 박는 작은 버전 라벨.
 *  미반영 변경이 있으면 우측에 앰버 점. 클릭 시 모달 (VersionBanner) 호출.
 *
 *  Note: VersionBanner 가 자기 fetch 도 하지만, 여기 60초 polling 도 가벼우니 별도로 진행.
 *        sideCollapsed 면 점만 표시.
 */
export default function VersionBadge({ collapsed }: { collapsed?: boolean }) {
  const [latest, setLatest] = useState<VInfo | null>(null);
  const [git, setGit] = useState<GitInfo | null>(null);
  const setDismissed = useVersionStore((s) => s.setDismissed);

  // 클릭 시 모달 다시 열림 (dismissed=false)
  const reopenModal = () => setDismissed(false);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const r = await fetch("/version.json", { cache: "no-store" });
        if (r.ok && mounted) {
          const d = await r.json();
          if (typeof d?.build === "string") {
            setLatest({ build: d.build, version: d.version || "?" });
          }
        }
      } catch { /* ignore */ }
      try {
        const r = await fetch(`${apiBase()}/api/admin/git-head`, { cache: "no-store" });
        if (r.ok && mounted) {
          const d = await r.json();
          if (d?.ok) setGit({ commit: d.commit, next_version: d.next_version });
        }
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  if (!latest) return null;
  const productionCommit = latest.build.split("-")[0] || "";
  // VersionBanner 와 동일한 영구 마킹 — 적용한 build 의 commit 이 git HEAD 와 일치하면 차단
  const appliedCommit = (() => {
    try { return (sessionStorage.getItem("doogeun-hq-applied-build") || "").split("-")[0]; } catch { return ""; }
  })();
  const userAppliedAlready = !!(appliedCommit && git?.commit && appliedCommit === git.commit);
  const cooldownActive = (() => {
    try {
      const expiry = Number(sessionStorage.getItem("doogeun-hq-reload-cooldown") || "0");
      return Date.now() < expiry;
    } catch { return false; }
  })();
  const hasPending = !userAppliedAlready && !cooldownActive &&
    !!(git?.commit && productionCommit && productionCommit !== git.commit);

  // 좁은 사이드바 — 점만, 미반영 시 클릭 가능 버튼
  if (collapsed) {
    if (hasPending) {
      return (
        <button
          onClick={reopenModal}
          className="w-full px-2 py-2 border-t border-gray-800/40 flex items-center justify-center hover:bg-amber-500/10 transition-colors group"
          title={`업데이트 v${latest.version} → v${git?.next_version} — 클릭해 모달 열기`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.7)] group-hover:scale-125 transition-transform" />
        </button>
      );
    }
    return (
      <div
        className="px-3 py-1.5 border-t border-gray-800/40 flex items-center justify-center"
        title={`v${latest.version}`}
      >
        <span className="w-1 h-1 rounded-full bg-gray-700" />
      </div>
    );
  }

  // 확장 사이드바 — 미반영 변경 있으면 전체가 강조 버튼
  if (hasPending) {
    return (
      <button
        onClick={reopenModal}
        className="w-full px-3 py-2 border-t border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 flex items-center gap-2 text-[11px] transition-colors group"
        title="클릭해 업데이트 모달 다시 열기"
      >
        <Sparkles className="w-3.5 h-3.5 text-amber-300 group-hover:scale-110 transition-transform shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[11px] font-bold text-amber-200">
            새 버전 v{git?.next_version} 사용 가능
          </div>
          <div className="text-[9px] font-mono text-amber-400/70">
            현재 v{latest.version} · 클릭해 업데이트
          </div>
        </div>
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.6)] shrink-0" />
      </button>
    );
  }

  return (
    <div
      className="px-3 py-1.5 border-t border-gray-800/40 flex items-center gap-1.5 text-[10px] font-mono text-gray-500"
      title={`라이브 v${latest.version}`}
    >
      <span>v{latest.version}</span>
      <span className="text-gray-700">·</span>
      <span className="text-[9px] opacity-70 truncate">{productionCommit.slice(0, 8)}</span>
    </div>
  );
}
