"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bug, RefreshCw, Upload, ChevronRight, ChevronDown } from "lucide-react";
import { apiBase } from "@/lib/utils";
import BugReportDialog from "@/components/BugReportDialog";

interface BugRow {
  ts: string;
  title: string;
  note: string;
  issue_number?: number;
  status?: string;
  urgent?: boolean;
  priority?: string;
  images?: string[];
  source?: string; // "auto_recovery" | undefined (사용자 신고)
  team_id?: string;
}

async function setBugStatus(ts: string, status: "open" | "resolved") {
  try {
    const r = await fetch(`${apiBase()}/api/diag/report/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ts, status }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function autoFix(ts: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${apiBase()}/api/diag/auto-fix/${encodeURIComponent(ts)}`, {
      method: "POST",
    });
    const d = await r.json();
    return { ok: !!d.ok, error: d.error };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

type Filter = "open" | "in_progress" | "resolved" | "all";

export default function BugsPage() {
  const [rows, setRows] = useState<BugRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("open");
  const [showReport, setShowReport] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/api/diag/reports?status=${filter === "all" ? "" : filter}`);
      const d = await r.json();
      setRows((d.rows || []).reverse());
    } catch { setRows([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter]);

  const counts = rows.reduce(
    (acc, r) => {
      const s = (r.status || "open") as keyof typeof acc;
      if (s in acc) acc[s]++;
      return acc;
    },
    { open: 0, in_progress: 0, resolved: 0 } as Record<string, number>,
  );

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="두근컴퍼니 · 버그 리포트" />
      <main className="flex-1 p-6 max-w-4xl w-full mx-auto">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bug className="w-4 h-4" /> 버그 티켓
              </CardTitle>
              <CardDescription>
                ⌘+V 이미지 붙여넣기 · 드래그드롭 · 로그 자동 첨부 · GitHub 이슈 연동
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" onClick={() => setShowReport(true)}>
                <Upload className="w-3.5 h-3.5 mr-1" />
                리포트 작성
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-1 mb-3 p-1 bg-gray-900/60 rounded border border-gray-800">
              {(["open", "in_progress", "resolved", "all"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`flex-1 text-[12px] py-1.5 rounded transition-colors ${
                    filter === s
                      ? "bg-sky-400/15 text-sky-300 font-bold"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {s === "open" ? "열림" : s === "in_progress" ? "진행 중" : s === "resolved" ? "해결됨" : "전체"}
                  {s !== "all" && counts[s] > 0 && (
                    <span className="ml-1 text-[10px] text-gray-500">({counts[s]})</span>
                  )}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="py-8 text-center text-[12px] text-gray-500">로딩...</div>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-gray-500">버그 없음 🎉</div>
            ) : (
              <div className="space-y-2">
                {rows.slice(0, 50).map((r, i) => {
                  const isOpen = expanded === i;
                  const status = r.status || "open";
                  const priority = r.priority || (r.urgent ? "urgent" : "normal");
                  const checked = status === "resolved";
                  return (
                    <div key={i} className="rounded-lg border border-gray-800/60 bg-gray-900/20 overflow-hidden">
                      <div className="w-full p-3 hover:bg-gray-900/40 transition-colors flex gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={async (e) => {
                            e.stopPropagation();
                            const ok = await setBugStatus(r.ts, checked ? "open" : "resolved");
                            if (ok) load();
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 w-4 h-4 cursor-pointer accent-emerald-500"
                          title={checked ? "해결 해제 (다시 열림)" : "해결 완료로 이동"}
                        />
                        <button
                          onClick={() => setExpanded(isOpen ? null : i)}
                          className="flex-1 text-left min-w-0"
                        >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {isOpen ? <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />}
                            <div className={`text-[13px] truncate ${checked ? "text-gray-500 line-through" : "text-gray-200"}`}>{r.title}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {r.source === "auto_recovery" && (
                              <Badge variant="secondary" className="text-[10px]">🤖 AI</Badge>
                            )}
                            <StatusBadge status={status} />
                            <PriorityBadge priority={priority} />
                            {r.issue_number != null && (
                              <a
                                href={`https://github.com/600-g/company-hq/issues/${r.issue_number}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-cyan-400 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                #{r.issue_number}
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="text-[11px] text-gray-500 font-mono mt-0.5 ml-4">{r.ts}</div>
                        </button>
                      </div>

                      {isOpen && (
                        <div className="px-4 pb-3 pt-1 space-y-2 border-t border-gray-800/50">
                          {r.note && (
                            <div className="text-[12px] text-gray-300 whitespace-pre-wrap">{r.note}</div>
                          )}
                          {r.images && r.images.length > 0 && (
                            <div className="flex gap-1.5 flex-wrap">
                              {r.images.slice(0, 6).map((src, j) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={j} src={src} alt="" className="h-20 rounded border border-gray-700" />
                              ))}
                            </div>
                          )}
                          {/* 사용자 신고 버그 (auto_recovery 아님) + 미해결 → AI 수정 위임 버튼 */}
                          {r.source !== "auto_recovery" && status !== "resolved" && status !== "in_progress" && (
                            <div className="pt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const res = await autoFix(r.ts);
                                  if (res.ok) {
                                    load();
                                  } else {
                                    alert(`AI 수정 위임 실패: ${res.error || "알 수 없는 오류"}`);
                                  }
                                }}
                                className="text-[11px] h-7 border-sky-700/50 text-sky-300 hover:bg-sky-500/10"
                                title="CPO 에 자동 수정 위임 — 진단/수정/재시도까지"
                              >
                                🤖 AI 수정 위임
                              </Button>
                            </div>
                          )}
                          {status === "in_progress" && (
                            <div className="pt-2 text-[11px] text-amber-300 flex items-center gap-1.5">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              CPO 가 자동 수정 진행 중...
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {showReport && (
        <BugReportDialog onClose={() => setShowReport(false)} onSent={() => { setShowReport(false); load(); }} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "resolved") return <Badge variant="success">해결</Badge>;
  if (status === "in_progress") return <Badge variant="warning">진행</Badge>;
  if (status === "closed") return <Badge variant="secondary">닫힘</Badge>;
  if (status === "critical") return <Badge variant="destructive">🚨 심각</Badge>;
  return <Badge variant="default">열림</Badge>;
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "urgent") return <Badge variant="destructive">🔥 긴급</Badge>;
  if (priority === "high") return <Badge variant="warning">높음</Badge>;
  if (priority === "low") return <Badge variant="secondary">낮음</Badge>;
  return null;
}
