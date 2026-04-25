"use client";

import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { apiBase } from "@/lib/utils";

interface Budget {
  max_plan_rate_limit?: { status?: string; type?: string; resets_at?: number } | null;
}

/** 상단바 뱃지 — Max 플랜 한도 도달했을 때만 노출. 모호한 "컨텍스트 %" 제거됨. */
export default function BudgetBadge() {
  const [budget, setBudget] = useState<Budget | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${apiBase()}/api/budget`);
        setBudget(await r.json());
      } catch {}
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const rl = budget?.max_plan_rate_limit;
  const resetsAt = rl?.resets_at;
  const isLimited = rl?.status && rl.status !== "allowed";

  if (!isLimited) return null;

  let resetStr = "";
  if (resetsAt) {
    const diffMs = resetsAt * 1000 - Date.now();
    if (diffMs > 0 && diffMs < 6 * 60 * 60 * 1000) {
      const m = Math.ceil(diffMs / 60000);
      if (m < 60) resetStr = `${m}분 후`;
      else resetStr = `${Math.floor(m / 60)}h ${m % 60}m 후`;
    }
  }

  const t = (rl?.type || "").toLowerCase();
  const typeKo = t === "session" || t === "five_hour" ? "5시간"
    : t.includes("seven_day") || t === "weekly" ? "주간"
    : t.includes("opus") ? "Opus"
    : t === "spike" ? "10분"
    : rl?.type || "";
  const tooltip = [
    `⚠️ Max 플랜 ${typeKo} 한도 ${rl?.status}`,
    resetStr ? `리셋 ${resetStr}` : "",
  ].filter(Boolean).join("\n");

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-mono text-red-400 border-red-400/50 bg-red-500/10"
      title={tooltip}
    >
      <Gauge className="w-3 h-3" />
      <span>{typeKo}⚠{resetStr ? ` ${resetStr}` : ""}</span>
    </div>
  );
}
