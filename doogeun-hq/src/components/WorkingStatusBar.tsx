"use client";

import { usePipelineStore } from "@/stores/pipelineStore";
import { useHandoffStore } from "@/stores/handoffStore";

/**
 * 오피스 상단 플로팅 상태바.
 *   - 파이프라인 활성 시: 현재 진행 단계 요약
 *   - 걷는 캐릭 있으면: 🚶 표시
 */
export default function WorkingStatusBar() {
  const active = usePipelineStore((s) => s.active);
  const walk = useHandoffStore((s) => s.activeWalk);

  if (!active && !walk) return null;

  const currentStep = active?.steps.find((s) => s.status === "running");
  const done = active ? active.steps.filter((s) => s.status === "completed").length : 0;
  const total = active?.steps.length ?? 0;

  return (
    <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-950/85 border border-purple-500/40 backdrop-blur-sm text-[11px] shadow-lg">
      {active && (
        <>
          <span className="text-purple-300 font-bold">🔀 파이프라인</span>
          <span className="text-gray-400">{done}/{total}</span>
          {currentStep && (
            <>
              <span className="text-gray-600">·</span>
              {currentStep.agentEmoji && <span>{currentStep.agentEmoji}</span>}
              <span className="text-gray-200 font-bold">{currentStep.agentName}</span>
              <span className="text-amber-300 animate-pulse">작업 중</span>
              {currentStep.retryCount > 0 && (
                <span className="text-amber-400">↻{currentStep.retryCount}</span>
              )}
            </>
          )}
        </>
      )}
      {walk && (
        <>
          {active && <span className="text-gray-600">·</span>}
          <span className="text-sky-300">🚶 이동 중</span>
        </>
      )}
    </div>
  );
}
