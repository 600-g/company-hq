"use client";

import { useEffect, useState } from "react";
import { apiBase } from "@/lib/utils";

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
  const hasPending = !!(git?.commit && productionCommit && productionCommit !== git.commit);

  // 좁은 사이드바 — 점 또는 짧은 표시만
  if (collapsed) {
    return (
      <div
        className="px-3 py-1.5 border-t border-gray-800/40 flex items-center justify-center"
        title={hasPending ? `업데이트 대기 → v${git?.next_version}` : `v${latest.version}`}
      >
        {hasPending ? (
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        ) : (
          <span className="w-1 h-1 rounded-full bg-gray-700" />
        )}
      </div>
    );
  }

  return (
    <div
      className="px-3 py-1.5 border-t border-gray-800/40 flex items-center gap-1.5 text-[10px] font-mono text-gray-500"
      title={hasPending ? `라이브 v${latest.version} · 다음 v${git?.next_version} 적용 대기` : `라이브 v${latest.version}`}
    >
      <span>v{latest.version}</span>
      <span className="text-gray-700">·</span>
      <span className="text-[9px] opacity-70 truncate">{productionCommit.slice(0, 8)}</span>
      {hasPending && (
        <span className="ml-auto flex items-center gap-1 text-[9px] text-amber-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          업데이트
        </span>
      )}
    </div>
  );
}
