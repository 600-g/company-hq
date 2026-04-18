"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { apiBase } from "@/lib/utils";

interface HandoffStep { team: string; team_name: string; emoji: string; prompt: string }

interface Props {
  dispatchId: string;
  steps: HandoffStep[];
  onApproved?: () => void;
  onCancelled?: () => void;
}

export default function AgentHandoffCard({ dispatchId, steps, onApproved, onCancelled }: Props) {
  const [feedback, setFeedback] = useState("");
  const [status, setStatus] = useState<"pending" | "approved" | "cancelled">("pending");
  const [submitting, setSubmitting] = useState(false);

  const decide = async (approve: boolean) => {
    setSubmitting(true);
    try {
      await fetch(`${apiBase()}/api/dispatch/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dispatch_id: dispatchId, decision: approve ? "approve" : "cancel", feedback }),
      });
      setStatus(approve ? "approved" : "cancelled");
      if (approve) onApproved?.(); else onCancelled?.();
    } finally { setSubmitting(false); }
  };

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <ArrowRight className="w-4 h-4 text-amber-300" />
        <span className="text-[12px] font-bold text-amber-200">핸드오프 승인 필요</span>
        <Badge variant="warning">{steps.length}팀</Badge>
        {status !== "pending" && (
          <Badge variant={status === "approved" ? "success" : "secondary"}>
            {status === "approved" ? "승인됨" : "취소됨"}
          </Badge>
        )}
      </div>
      <div className="space-y-1">
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-2 text-[11px] p-2 rounded bg-gray-900/40 border border-gray-800/60">
            <span className="text-base shrink-0">{s.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-gray-200 font-bold">{s.team_name}</div>
              <div className="text-gray-400 line-clamp-2">{s.prompt}</div>
            </div>
          </div>
        ))}
      </div>
      {status === "pending" && (
        <>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={2}
            placeholder="피드백 추가 (선택) — 각 팀 prompt 앞에 [유저 피드백] 으로 주입됨"
            className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-2 py-1.5 text-[11px] text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => decide(false)} disabled={submitting}>
              취소
            </Button>
            <Button size="sm" onClick={() => decide(true)} disabled={submitting}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              {submitting ? "전송 중..." : "승인 · 진행"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
