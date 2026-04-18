"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bug, RefreshCw, Upload } from "lucide-react";
import { apiBase } from "@/lib/utils";

interface BugRow {
  ts: string;
  title: string;
  note: string;
  issue_number?: number;
  status?: string;
  urgent?: boolean;
  images?: unknown[];
}

export default function BugsPage() {
  const [rows, setRows] = useState<BugRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [showReport, setShowReport] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/api/diag/reports?status=${filter}`);
      const d = await r.json();
      setRows((d.rows || []).reverse());
    } catch { setRows([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter]);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="두근컴퍼니 HQ — 버그 리포트" />
      <main className="flex-1 p-6 max-w-4xl w-full mx-auto">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bug className="w-4 h-4" /> 버그 리포트
              </CardTitle>
              <CardDescription>이미지/로그와 함께 자동 GH 이슈화. 해결되면 자동 정리.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={load}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" onClick={() => setShowReport(true)}>
                <Upload className="w-3.5 h-3.5 mr-1" />
                리포트 작성
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-1 mb-3 p-1 bg-gray-900/60 rounded border border-gray-800">
              {(["open", "resolved", "all"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`flex-1 text-[12px] py-1.5 rounded transition-colors ${
                    filter === s
                      ? "bg-yellow-400/20 text-yellow-300 font-bold"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {s === "open" ? "열림" : s === "resolved" ? "해결됨" : "전체"}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="py-8 text-center text-[12px] text-gray-500">로딩...</div>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-gray-500">버그 없음</div>
            ) : (
              <div className="space-y-2">
                {rows.slice(0, 30).map((r, i) => (
                  <div key={i} className="p-3 rounded-lg border border-gray-800/60 bg-gray-900/20">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-[13px] text-gray-200 truncate">{r.title}</div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.urgent && <Badge variant="destructive">긴급</Badge>}
                        {r.issue_number != null && (
                          <a
                            href={`https://github.com/600-g/company-hq/issues/${r.issue_number}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-cyan-400 hover:underline"
                          >
                            #{r.issue_number}
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-500 font-mono">{r.ts}</div>
                  </div>
                ))}
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

/** 버그 리포트 간이 모달 (이미지 업로드 다음 세션 추가) */
function BugReportDialog({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!note.trim()) return;
    setSending(true);
    try {
      await fetch(`${apiBase()}/api/diag/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, logs: [], images: [] }),
      });
      onSent();
    } catch {} finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardHeader>
            <CardTitle>버그 리포트</CardTitle>
            <CardDescription>무슨 일 있었는지 간단히 써주세요</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              placeholder="예: 채팅 입력 후 응답이 오지 않음..."
              className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-yellow-400/50"
            />
            <div className="text-[11px] text-gray-500">
              이미지 업로드(⌘+V) 는 다음 세션에 추가 예정
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>취소</Button>
              <Button onClick={send} disabled={sending || !note.trim()}>
                {sending ? "전송 중..." : "전송"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
