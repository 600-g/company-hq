"use client";

import { useEffect, useState, useMemo } from "react";
import { X, RefreshCw, FileText, Hash, Clock } from "lucide-react";
import { apiBase } from "@/lib/utils";
import { useThemeStore } from "@/stores/themeStore";

interface PatchRow {
  ts: string;
  sha: string;
  short_sha: string;
  author: string;
  subject: string;
  body?: string;
  type: string;
  scope: string;
  files: string[];
  insertions: number;
  deletions: number;
  full_text?: string;
}

type GroupKey = "debug" | "improve" | "revert" | "maintain";

const GROUP_META: Record<GroupKey, { emoji: string; label: string; types: string[] }> = {
  debug:    { emoji: "🐛", label: "디버깅", types: ["fix", "security"] },
  improve:  { emoji: "✨", label: "개선",   types: ["feat", "perf", "refactor", "ux", "style"] },
  revert:   { emoji: "⏪", label: "롤백",   types: ["revert"] },
  maintain: { emoji: "🧹", label: "정비",   types: ["docs", "chore", "ci", "build", "test"] },
};

const TYPE_TO_GROUP: Record<string, GroupKey> = (() => {
  const m: Record<string, GroupKey> = {};
  for (const [g, meta] of Object.entries(GROUP_META) as [GroupKey, typeof GROUP_META[GroupKey]][]) {
    for (const t of meta.types) m[t] = g;
  }
  return m;
})();

const TYPE_EMOJI: Record<string, string> = {
  fix: "🐛", feat: "✨", perf: "⚡", refactor: "🔧", ux: "🎨",
  docs: "📝", chore: "🧹", style: "💄", test: "🧪", build: "📦",
  ci: "🤖", security: "🔒", revert: "⏪",
};

function relTime(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    const diff = Date.now() - t;
    const min = Math.floor(diff / 60_000);
    if (min < 1) return "방금";
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}시간 전`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}일 전`;
    const wk = Math.floor(day / 7);
    if (wk < 5) return `${wk}주 전`;
    const mo = Math.floor(day / 30);
    return `${mo}개월 전`;
  } catch {
    return iso.slice(0, 10);
  }
}

export default function TimelineModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const isLight = theme === "light";
  const [rows, setRows] = useState<PatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<GroupKey | "">("");
  const [detail, setDetail] = useState<PatchRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 모바일 첫 로딩 부담 줄이기 — 100개씩 페이지네이션 (사용자가 [더 보기] 누르면 +100)
  const [pageLimit, setPageLimit] = useState(100);
  const load = async (limit: number = pageLimit) => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/api/admin/patch-log?limit=${limit}`);
      const d = await r.json();
      setRows(d.rows || []);
    } catch (e) {
      console.error("[timeline]", e);
    } finally {
      setLoading(false);
    }
  };

  // 모달 열릴 때만 fetch — 닫혀있을 땐 idle
  useEffect(() => {
    if (open && rows.length === 0) load();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDetail = async (sha: string) => {
    setDetailLoading(true);
    try {
      const r = await fetch(`${apiBase()}/api/admin/patch-log/${encodeURIComponent(sha)}`);
      const d = await r.json();
      if (d.ok) setDetail(d.row);
    } catch {/* ignore */}
    finally { setDetailLoading(false); }
  };

  const groupOf = (r: PatchRow): GroupKey => TYPE_TO_GROUP[(r.type || "").toLowerCase()] || "maintain";

  const filtered = useMemo(() => {
    if (!filter) return rows;
    return rows.filter((r) => groupOf(r) === filter);
  }, [rows, filter]);

  const grouped = useMemo(() => {
    const out: Record<string, PatchRow[]> = {};
    for (const r of filtered) {
      const day = (r.ts || "").slice(0, 10);
      out[day] = out[day] || [];
      out[day].push(r);
    }
    return out;
  }, [filtered]);

  const groupCounts = useMemo(() => {
    const c: Record<GroupKey, number> = { debug: 0, improve: 0, revert: 0, maintain: 0 };
    for (const r of rows) c[groupOf(r)] += 1;
    return c;
  }, [rows]);

  const groupColor = (g: GroupKey): string => {
    if (isLight) {
      return g === "debug"   ? "text-rose-700"
           : g === "improve" ? "text-emerald-700"
           : g === "revert"  ? "text-amber-700"
                             : "text-slate-600";
    }
    return g === "debug"   ? "text-rose-300"
         : g === "improve" ? "text-emerald-300"
         : g === "revert"  ? "text-amber-300"
                           : "text-slate-300";
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[88vh] bg-gray-950 border border-gray-800 sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-transform duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-3 py-2.5 border-b border-gray-800 flex items-center gap-2 shrink-0">
          <div className="text-[20px] shrink-0">📚</div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-gray-100">두근컴퍼니 책장</div>
            <div className="text-[10px] text-gray-500 font-mono">
              전체 {rows.length}개 패치 · 카드 누르면 상세
            </div>
          </div>
          <button
            onClick={() => load()}
            className="p-1.5 rounded hover:bg-gray-800/60 text-gray-400 transition-colors"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-800/60 text-gray-400 transition-colors"
            title="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* 4 그룹 칩 */}
        <div className="px-3 py-2.5 grid grid-cols-5 gap-1.5 border-b border-gray-800 shrink-0">
          <button
            onClick={() => setFilter("")}
            className={`text-[11px] py-1.5 rounded-md border font-bold transition-colors ${
              filter === "" ? "bg-sky-500/20 border-sky-400/60 text-sky-100" : "border-gray-800 text-gray-400 hover:text-gray-100 bg-gray-900/30"
            }`}
          >
            전체 {rows.length}
          </button>
          {(Object.keys(GROUP_META) as GroupKey[]).map((g) => {
            const meta = GROUP_META[g];
            const active = filter === g;
            return (
              <button
                key={g}
                onClick={() => setFilter(active ? "" : g)}
                className={`text-[11px] py-1.5 rounded-md border font-bold flex items-center justify-center gap-0.5 transition-colors ${
                  active
                    ? "bg-sky-500/20 border-sky-400/60 text-sky-100"
                    : "border-gray-800 text-gray-300 hover:text-gray-100 bg-gray-900/30"
                }`}
              >
                <span>{meta.emoji}</span>
                <span>{meta.label}</span>
                <span className="text-[9px] opacity-70 font-mono">{groupCounts[g]}</span>
              </button>
            );
          })}
        </div>

        <main className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {loading && rows.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-gray-500">로딩 중...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="py-10 text-center text-[12px] text-gray-500">기록 없음</div>
          ) : (
            <>
            {Object.entries(grouped).map(([day, items]) => (
              <section key={day}>
                <div className="text-[11px] text-gray-500 font-mono mb-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {day} <span className="text-gray-600">· {items.length}개</span>
                </div>
                <div className="space-y-1.5">
                  {items.map((r) => {
                    const g = groupOf(r);
                    const meta = GROUP_META[g];
                    const t = (r.type || "").toLowerCase();
                    const subEmoji = TYPE_EMOJI[t] || meta.emoji;
                    return (
                      <button
                        key={r.sha}
                        onClick={() => openDetail(r.short_sha || r.sha)}
                        className="w-full text-left rounded-lg border border-gray-800 bg-gray-900/40 hover:bg-gray-900/70 hover:border-gray-700 transition-colors p-2.5"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-[18px] shrink-0 leading-none mt-0.5">{subEmoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className={`text-[12.5px] leading-snug font-medium ${groupColor(g)}`}>
                              {r.subject.replace(/^([a-z]+)(\([^)]+\))?:\s/, "")}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500 font-mono flex-wrap">
                              <span className="flex items-center gap-0.5"><Hash className="w-2.5 h-2.5" />{r.short_sha}</span>
                              <span className="text-gray-500">[{meta.label}]</span>
                              {r.scope && <span className="text-sky-400/80">[{r.scope}]</span>}
                              {r.files && r.files.length > 0 && (
                                <span className="flex items-center gap-0.5"><FileText className="w-2.5 h-2.5" />{r.files.length}개</span>
                              )}
                              <span className="text-gray-600">· {relTime(r.ts)}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {rows.length >= pageLimit && (
              <div className="pt-2">
                <button
                  onClick={() => { const next = pageLimit + 100; setPageLimit(next); load(next); }}
                  disabled={loading}
                  className="w-full py-2 rounded-md border border-gray-700 text-[12px] text-gray-300 hover:bg-gray-800/50 hover:text-gray-100 transition-colors disabled:opacity-50"
                >
                  {loading ? "로딩 중..." : `더 보기 (+100)`}
                </button>
              </div>
            )}
            </>
          )}
        </main>
      </div>

      {/* 상세 모달 (책장 위에 띄움) */}
      {detail && (
        <div
          className="fixed inset-0 z-[350] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 transition-opacity duration-200"
          onClick={(e) => { e.stopPropagation(); setDetail(null); }}
        >
          <div
            className="w-full sm:max-w-lg max-h-[88vh] bg-gray-950 border border-gray-800 sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-800 flex items-start gap-2 shrink-0">
              <div className="text-[22px] shrink-0">
                {TYPE_EMOJI[(detail.type || "").toLowerCase()] || "📌"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-gray-100 leading-snug">
                  {detail.subject.replace(/^([a-z]+)(\([^)]+\))?:\s/, "")}
                </div>
                <div className="text-[10px] text-gray-500 font-mono mt-1">
                  {detail.short_sha} · {detail.ts.replace("T", " ").slice(0, 19)} · {detail.author}
                </div>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="text-gray-500 hover:text-gray-200 px-2 py-1 text-[18px] leading-none transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {detailLoading && <div className="text-[12px] text-gray-500">상세 로딩 중...</div>}
              {detail.scope && (
                <div className="text-[11px]">
                  <span className="text-gray-500">영역:</span>{" "}
                  <span className="text-sky-400/90 font-mono">[{detail.scope}]</span>
                </div>
              )}
              {detail.files && detail.files.length > 0 && (
                <div>
                  <div className="text-[11px] text-gray-500 mb-1">변경 파일 ({detail.files.length}개)</div>
                  <div className="space-y-0.5 max-h-40 overflow-y-auto rounded bg-gray-900/60 border border-gray-800 p-2">
                    {detail.files.map((f, i) => (
                      <div key={i} className="text-[10.5px] font-mono text-gray-300 truncate">{f}</div>
                    ))}
                  </div>
                </div>
              )}
              {detail.full_text && (
                <div>
                  <div className="text-[11px] text-gray-500 mb-1">상세</div>
                  <pre className="text-[10.5px] font-mono text-gray-300 bg-gray-900/60 border border-gray-800 rounded p-2 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                    {detail.full_text}
                  </pre>
                </div>
              )}
              {(detail.insertions > 0 || detail.deletions > 0) && (
                <div className="text-[11px] font-mono flex gap-3">
                  <span className={isLight ? "text-emerald-700 font-bold" : "text-emerald-400"}>+{detail.insertions}</span>
                  <span className={isLight ? "text-rose-700 font-bold" : "text-rose-400"}>-{detail.deletions}</span>
                </div>
              )}
            </div>

            <div className="border-t border-gray-800 p-3 shrink-0">
              <a
                href={`https://github.com/600-g/company-hq/commit/${detail.sha}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`block w-full text-center text-[11px] font-mono ${isLight ? "text-blue-700 hover:text-blue-900 font-bold" : "text-cyan-300 hover:text-cyan-200"}`}
              >
                GitHub 에서 diff 보기 →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
