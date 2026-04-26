"use client";

import { useState } from "react";
import { UserPlus, CheckCircle2, X, Loader2 } from "lucide-react";
import type { HireProposal } from "@/lib/parseArtifacts";

interface Props {
  proposal: HireProposal;
  onHire: (p: HireProposal) => Promise<{ ok: boolean; error?: string }>;
}

/** CPO가 제안한 새 에이전트 채용 카드 — [채용하기] / [거절] 버튼 */
export default function HireProposalCard({ proposal, onHire }: Props) {
  const [state, setState] = useState<"idle" | "hiring" | "hired" | "rejected" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const hire = async () => {
    if (state !== "idle") return;
    setState("hiring");
    setError(null);
    try {
      const r = await onHire(proposal);
      if (r.ok) {
        setState("hired");
      } else {
        setState("error");
        setError(r.error || "채용 실패");
      }
    } catch (e: unknown) {
      setState("error");
      setError(e instanceof Error ? e.message : "채용 실패");
    }
  };

  const reject = () => {
    if (state !== "idle") return;
    setState("rejected");
  };

  return (
    <div className="mt-2 rounded-lg border border-amber-400/50 bg-amber-500/10 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[12px] text-amber-200 font-bold">
        <UserPlus className="w-3.5 h-3.5" />
        🎯 새 팀원 채용 제안 — CPO
      </div>

      <div className="rounded-md border border-gray-700 bg-gray-950/60 p-2.5 space-y-1.5 text-[12px]">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{proposal.emoji}</span>
          <span className="text-gray-100 font-bold text-[14px]">{proposal.name}</span>
          <span className="text-gray-500">·</span>
          <span className="text-sky-300 text-[11px]">{proposal.role}</span>
        </div>
        {proposal.description && (
          <div><span className="text-gray-500">담당:</span> <span className="text-gray-200">{proposal.description}</span></div>
        )}
        {proposal.reason && (
          <div><span className="text-gray-500">채용 이유:</span> <span className="text-gray-300 italic">{proposal.reason}</span></div>
        )}
      </div>

      {state === "idle" && (
        <div className="flex gap-1.5">
          <button
            onClick={hire}
            className="flex-1 h-9 rounded-md border border-amber-400/60 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 hover:text-white text-[12px] font-bold transition-colors flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            채용하기
          </button>
          <button
            onClick={reject}
            className="px-3 h-9 rounded-md border border-gray-700 text-gray-400 hover:text-red-300 hover:border-red-500/50 text-[12px] transition-colors flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            거절
          </button>
        </div>
      )}

      {state === "hiring" && (
        <div className="flex items-center gap-2 text-[12px] text-amber-200">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          시스템 프롬프트 생성 + 서버 등록 중...
        </div>
      )}

      {state === "hired" && (
        <div className="rounded-md border border-emerald-400/50 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] text-emerald-200 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          ✨ {proposal.name} 채용 완료 — 우측 채팅 목록에서 바로 이용 가능
        </div>
      )}

      {state === "rejected" && (
        <div className="rounded-md border border-gray-700 bg-gray-900/60 px-2.5 py-1.5 text-[11px] text-gray-500 flex items-center gap-1.5">
          <X className="w-3.5 h-3.5" />
          채용 거절됨 — CPO 에 다른 안 요청
        </div>
      )}

      {state === "error" && (
        <div className="rounded-md border border-red-400/50 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-200">
          ❌ {error || "실패"} — 다시 시도해주세요
          <button
            onClick={() => setState("idle")}
            className="ml-2 underline hover:text-red-100"
          >
            재시도
          </button>
        </div>
      )}
    </div>
  );
}
