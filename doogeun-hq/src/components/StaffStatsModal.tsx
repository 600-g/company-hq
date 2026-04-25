"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiBase } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

interface StaffStats {
  ok: boolean;
  total_handled: number;
  free_llm_ratio: number;
  claude_fallback_count: number;
  claude_tokens_saved: number;
  by_provider: Record<string, number>;
  by_intent: Record<string, number>;
  by_language: Record<string, number>;
  last_updated: string | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "🌐 Gemini Flash",
  gemma_e4b: "🤖 Gemma 4 E4B (로컬)",
  gemma_main: "🧠 Gemma 4 26B (로컬)",
  claude_fallback: "🔮 Claude (폴백)",
};

const INTENT_LABELS: Record<string, string> = {
  chat: "💬 잡담",
  status: "📊 상태조회",
  lookup: "🔍 회상",
  calc: "🧮 계산",
  summarize: "📝 요약",
  escalate: "🔔 CPO 위임",
};

const LANG_LABELS: Record<string, string> = {
  ko: "🇰🇷 한국어",
  en: "🇺🇸 English",
  ja: "🇯🇵 日本語",
  zh: "🇨🇳 中文",
  other: "🌍 기타",
};

export default function StaffStatsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stats, setStats] = useState<StaffStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`${apiBase()}/api/staff/stats`)
      .then((r) => r.json())
      .then((d) => setStats(d as StaffStats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const renderBar = (entries: [string, number][], total: number, labels: Record<string, string>) => {
    if (total === 0) return <div className="text-[12px] text-gray-500">아직 처리 건수 없음</div>;
    return (
      <div className="space-y-1.5">
        {entries.sort((a, b) => b[1] - a[1]).map(([k, v]) => {
          const pct = total > 0 ? (v / total * 100) : 0;
          return (
            <div key={k} className="text-[12px]">
              <div className="flex justify-between mb-0.5">
                <span className="text-gray-300">{labels[k] || k}</span>
                <span className="text-gray-400">{v} ({pct.toFixed(0)}%)</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-sky-500 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const total = stats?.total_handled ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <Card className="max-h-[90vh] flex flex-col overflow-hidden">
          <CardHeader className="flex-row items-start justify-between shrink-0 border-b border-gray-800/60">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span className="text-2xl">🧑‍💼</span>
                <span>스태프 활동 통계</span>
              </CardTitle>
              <CardDescription>무료 LLM 처리 건수 + Claude 토큰 절감 추정</CardDescription>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-200">
              <X size={20} />
            </button>
          </CardHeader>
          <CardContent className="space-y-4 overflow-y-auto p-5">
            {loading ? (
              <div className="text-[13px] text-gray-400">로딩 중...</div>
            ) : !stats || !stats.ok ? (
              <div className="text-[13px] text-amber-400">통계 불러오기 실패</div>
            ) : (
              <>
                {/* 종합 카드 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="rounded-md bg-gray-800/60 p-3">
                    <div className="text-[11px] text-gray-500">총 처리</div>
                    <div className="text-2xl font-bold text-sky-300">{total.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-500">건</div>
                  </div>
                  <div className="rounded-md bg-gray-800/60 p-3">
                    <div className="text-[11px] text-gray-500">무료 LLM 비율</div>
                    <div className="text-2xl font-bold text-emerald-300">{stats.free_llm_ratio}%</div>
                    <div className="text-[10px] text-gray-500">Claude 미사용</div>
                  </div>
                  <div className="rounded-md bg-gray-800/60 p-3">
                    <div className="text-[11px] text-gray-500">Claude 절감 추정</div>
                    <div className="text-2xl font-bold text-amber-300">
                      {(stats.claude_tokens_saved / 1000).toFixed(0)}K
                    </div>
                    <div className="text-[10px] text-gray-500">토큰 (5K/건)</div>
                  </div>
                </div>

                {/* 의도별 */}
                <div>
                  <div className="text-[12px] font-bold text-gray-200 mb-1.5">의도별</div>
                  {renderBar(Object.entries(stats.by_intent || {}), total, INTENT_LABELS)}
                </div>

                {/* Provider별 */}
                <div>
                  <div className="text-[12px] font-bold text-gray-200 mb-1.5">처리 LLM 별</div>
                  {renderBar(Object.entries(stats.by_provider || {}), total, PROVIDER_LABELS)}
                </div>

                {/* 언어별 */}
                <div>
                  <div className="text-[12px] font-bold text-gray-200 mb-1.5">언어별</div>
                  {renderBar(Object.entries(stats.by_language || {}).filter(([, v]) => v > 0), total, LANG_LABELS)}
                </div>

                {stats.last_updated && (
                  <div className="text-[10px] text-gray-500 text-right">
                    업데이트: {new Date(stats.last_updated).toLocaleString("ko-KR")}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
