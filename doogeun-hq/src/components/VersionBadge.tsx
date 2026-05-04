"use client";

import { Sparkles } from "lucide-react";
import { useVersionStore } from "@/stores/versionStore";

/** 사이드바 하단 오너 정보 위에 인라인 박는 작은 버전 라벨.
 *  미반영 변경이 있으면 우측에 앰버 점. 클릭 시 모달 (VersionBanner) 호출.
 *
 *  최적화: 자체 fetch 제거 — VersionBanner 가 60초 polling 으로 versionStore.cache 에
 *  set 한 데이터만 read. 매분 fetch 2 → 1 (50% 절감). collapsed 면 점만 표시.
 */
export default function VersionBadge({ collapsed }: { collapsed?: boolean }) {
  const cache = useVersionStore((s) => s.cache);
  const isDismissedFor = useVersionStore((s) => s.isDismissedFor);
  const reopen = useVersionStore((s) => s.reopen);
  const reopenModal = () => reopen();

  if (!cache) return null;

  const productionCommit = (cache.build.split("-")[0] || "");
  const userAppliedAlready = isDismissedFor(cache.commit);
  const hasPending = !userAppliedAlready &&
    !!(cache.commit && productionCommit && productionCommit !== cache.commit);

  // 좁은 사이드바 — 점만, 미반영 시 클릭 가능 버튼
  if (collapsed) {
    if (hasPending) {
      return (
        <button
          onClick={reopenModal}
          className="w-full px-2 py-2 border-t border-gray-800/40 flex items-center justify-center hover:bg-amber-500/10 transition-colors group"
          title={`업데이트 v${cache.version} → v${cache.nextVersion} — 클릭해 모달 열기`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.7)] group-hover:scale-125 transition-transform" />
        </button>
      );
    }
    return (
      <div
        className="px-3 py-1.5 border-t border-gray-800/40 flex items-center justify-center"
        title={`v${cache.version}`}
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
            새 버전 v{cache.nextVersion} 사용 가능
          </div>
          <div className="text-[9px] font-mono text-amber-400/70">
            현재 v{cache.version} · 클릭해 업데이트
          </div>
        </div>
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.6)] shrink-0" />
      </button>
    );
  }

  return (
    <div
      className="px-3 py-1.5 border-t border-gray-800/40 flex items-center gap-1.5 text-[10px] font-mono text-gray-500"
      title={`라이브 v${cache.version}`}
    >
      <span>v{cache.version}</span>
      <span className="text-gray-700">·</span>
      <span className="text-[9px] opacity-70 truncate">{productionCommit.slice(0, 8)}</span>
    </div>
  );
}
