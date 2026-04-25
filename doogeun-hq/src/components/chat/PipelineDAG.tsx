"use client";

import { usePipelineStore } from "@/stores/pipelineStore";
import { Check, Circle, AlertTriangle, RefreshCw, ChevronRight } from "lucide-react";

/** 디스패치 파이프라인 시각화 — 순차 스텝 + 현재/재시도/완료 상태 */
export default function PipelineDAG() {
  const active = usePipelineStore((s) => s.active);
  const clear = usePipelineStore((s) => s.clear);

  if (!active) return null;

  return (
    <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-bold text-purple-200">🔀 파이프라인</span>
        <span className="text-[10px] text-gray-400">· {active.steps.length}단계</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
          active.status === "completed" ? "bg-green-500/20 text-green-300" :
          active.status === "failed" ? "bg-red-500/20 text-red-300" :
          "bg-amber-500/20 text-amber-300"
        }`}>
          {active.status === "completed" ? "완료" :
           active.status === "failed" ? "실패" :
           active.status === "running" ? "진행 중" : "대기"}
        </span>
        <button
          onClick={clear}
          className="ml-auto text-[10px] text-gray-500 hover:text-gray-300"
        >
          지우기
        </button>
      </div>

      <div className="space-y-1">
        {active.steps.map((step, i) => {
          const icon = step.status === "completed" ? <Check className="w-3.5 h-3.5 text-green-400" />
            : step.status === "running" ? <RefreshCw className="w-3.5 h-3.5 text-purple-300 animate-spin" />
            : step.status === "failed" ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            : <Circle className="w-3.5 h-3.5 text-gray-600" />;
          return (
            <div key={step.agentId + i} className="flex items-start gap-2 text-[11px] p-1.5 rounded bg-gray-900/30">
              <span className="mt-0.5">{icon}</span>
              {step.agentEmoji && <span className="text-sm leading-none">{step.agentEmoji}</span>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`font-bold ${
                    step.status === "failed" ? "text-red-300" :
                    step.status === "completed" ? "text-gray-300" :
                    step.status === "running" ? "text-purple-200" :
                    "text-gray-400"
                  }`}>
                    {step.agentName}
                  </span>
                  {step.retryCount > 0 && (
                    <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300">
                      재시도 {step.retryCount}
                    </span>
                  )}
                  {i < active.steps.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-gray-600 ml-auto" />
                  )}
                </div>
                {step.prompt && (
                  <div className="text-gray-500 line-clamp-1 mt-0.5">{step.prompt}</div>
                )}
                {step.error && (
                  <div className="text-red-400 mt-0.5 line-clamp-2">⚠ {step.error}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
