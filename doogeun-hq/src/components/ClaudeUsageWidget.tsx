"use client";

import { useCallback, useEffect, useState } from "react";
import { BatteryFull, ChevronDown, ChevronRight } from "lucide-react";
import { authFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

/** Claude Max 플랜 잔량 배터리 — admin(관리자) 이상만 노출.
 *
 * 게이지 개수·라벨은 백엔드가 Anthropic `limits[]` 에서 그대로 뽑아 내려준다.
 * (5시간 세션 / 주간 전체 / 주간 Fable — 모델별 한도는 이름이 바뀔 수 있어 하드코딩하지 않음)
 */

const POLL_MS = 120_000; // 2분 — 백엔드 캐시 TTL 과 동일

interface Gauge {
  key: string;
  label: string;
  model: string | null;
  used_percent: number;
  remaining_percent: number;
  severity: string;
  resets_at: string | null;
  is_active: boolean;
}

interface UsageResponse {
  ok: boolean;
  gauges: Gauge[];
  error?: string;
  cached?: boolean;
  stale?: boolean;
  age_sec?: number;
}

/** 잔량 기준 색상 — 50%+ 초록 / 20%+ 노랑 / 그 미만 빨강 */
function remainingColor(remaining: number): { bar: string; text: string } {
  if (remaining >= 50) return { bar: "bg-green-500", text: "text-green-400" };
  if (remaining >= 20) return { bar: "bg-yellow-500", text: "text-yellow-400" };
  return { bar: "bg-red-500", text: "text-red-400" };
}

/** "2시간 14분 후" — 리셋까지 남은 시간. 이미 지났으면 "곧 리셋" */
function resetLabel(resetsAt: string | null): string {
  if (!resetsAt) return "";
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "곧 리셋";
  const totalMin = Math.ceil(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}일 ${hours}시간 후 리셋`;
  if (hours > 0) return `${hours}시간 ${mins}분 후 리셋`;
  return `${mins}분 후 리셋`;
}

export default function ClaudeUsageWidget() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === "owner" || role === "admin";

  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      // silent — 비관리자가 어쩌다 호출해도 토스트 띄우지 않음 (위젯 자체가 숨겨짐)
      const r = await authFetch("/api/claude-usage", { silent: true });
      if (!r.ok) throw new Error(String(r.status));
      setData((await r.json()) as UsageResponse);
    } catch {
      setData({ ok: false, gauges: [], error: "사용량을 불러오지 못했어요." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [isAdmin, load]);

  if (!isAdmin) return null;

  const gauges = data?.gauges ?? [];
  // ok:true 인데 게이지가 비는 경우(플랜 변경 등)도 실패로 취급 — 빈 상자 노출 방지
  const failed = !!data && (!data.ok || gauges.length === 0);
  const failMessage = data?.error ?? "사용량 정보가 비어 있어요.";

  return (
    <section>
      <div className="text-[12px] text-gray-400 font-bold mb-1.5 flex items-center gap-1">
        <BatteryFull className="w-3.5 h-3.5" />
        <span>Claude 잔량</span>
        {data?.stale && (
          <span className="text-[10px] font-normal text-amber-400/80" title={data.error}>
            (갱신 실패 · 이전 값)
          </span>
        )}
      </div>

      {loading && !data ? (
        <div className="text-[11px] text-gray-500 px-2 py-1.5">불러오는 중…</div>
      ) : failed ? (
        <div className="text-[11px] text-amber-400/90 px-2 py-1.5 rounded border border-amber-500/30 bg-amber-500/5">
          {failMessage}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full text-left rounded border border-gray-800/60 bg-gray-900/30 hover:bg-gray-900/50 transition-colors p-2 space-y-2"
        >
          {gauges.map((g) => {
            const c = remainingColor(g.remaining_percent);
            return (
              <div key={g.key}>
                <div className="flex items-baseline justify-between text-[11px] mb-1">
                  <span className="text-gray-300 truncate">{g.label}</span>
                  <span className={`font-mono font-bold ${c.text}`}>{g.remaining_percent}%</span>
                </div>
                {/* 배터리 — 본체 + 우측 단자 */}
                <div className="flex items-center gap-0.5">
                  <div className="flex-1 h-2.5 rounded-sm border border-gray-700 bg-gray-950/60 p-[1px]">
                    <div
                      className={`h-full rounded-[1px] ${c.bar} transition-all duration-500`}
                      style={{ width: `${Math.max(g.remaining_percent, 1.5)}%` }}
                    />
                  </div>
                  <div className="w-[2px] h-1.5 rounded-r-sm bg-gray-700" />
                </div>

                {open && (
                  <div className="mt-1 pl-0.5 text-[10px] text-gray-500 font-mono flex flex-wrap gap-x-3">
                    <span>{g.used_percent}% 사용</span>
                    {g.resets_at && <span>{resetLabel(g.resets_at)}</span>}
                    {g.severity !== "normal" && <span className="text-amber-400">{g.severity}</span>}
                    {g.is_active && <span className="text-sky-400">활성</span>}
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center gap-1 text-[10px] text-gray-600 pt-0.5">
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <span>{open ? "접기" : "상세"}</span>
            {open && data?.cached && <span className="ml-auto">캐시 {Math.round(data.age_sec ?? 0)}초 전</span>}
          </div>
        </button>
      )}
    </section>
  );
}
