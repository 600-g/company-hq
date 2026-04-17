"use client";

import { useEffect, useState } from "react";

interface ReportRow {
  ts: string;
  title: string;
  note: string;
  user?: string;
  priority?: "normal" | "urgent";
  status?: "open" | "resolved";
  issue_url?: string;
  issue_number?: number;
  attachments?: string[];
  meta?: { ua?: string; url?: string; build?: string };
}

function apiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h === "127.0.0.1" || h.endsWith(".local") || h.startsWith("192.168.");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function BugReportsList({ open, onClose }: Props) {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [filter, setFilter] = useState<"all" | "open" | "resolved" | "urgent">("open");
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      try {
        const r = await fetch(`${apiBase()}/api/diag/reports?limit=200`, { cache: "no-store" });
        const d = await r.json();
        if (d.ok) setRows((d.rows || []).slice().reverse());
      } catch {}
    };
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [open]);

  const runCleanup = async () => {
    setCleaning(true);
    try {
      const r = await fetch(`${apiBase()}/api/diag/cleanup`, { method: "POST" });
      const d = await r.json();
      window.dispatchEvent(new CustomEvent("hq:toast", {
        detail: {
          text: d.ok ? `✅ ${d.resolved || 0}개 해결 처리 · ${d.deleted_images || 0}개 이미지 삭제` : "❌ cleanup 실패",
          variant: d.ok ? "success" : "error", center: true, ms: 2500,
        },
      }));
    } catch {
      window.dispatchEvent(new CustomEvent("hq:toast", { detail: { text: "❌ cleanup 실패", variant: "error", center: true, ms: 2000 } }));
    } finally {
      setCleaning(false);
      // 새로고침
      try {
        const r = await fetch(`${apiBase()}/api/diag/reports?limit=200`, { cache: "no-store" });
        const d = await r.json();
        if (d.ok) setRows((d.rows || []).slice().reverse());
      } catch {}
    }
  };

  if (!open) return null;

  const filtered = rows.filter(r => {
    if (filter === "all") return true;
    if (filter === "urgent") return r.priority === "urgent";
    return (r.status || "open") === filter;
  });

  const openCount = rows.filter(r => (r.status || "open") === "open").length;
  const resolvedCount = rows.filter(r => r.status === "resolved").length;
  const urgentCount = rows.filter(r => r.priority === "urgent" && (r.status || "open") === "open").length;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl h-[80vh] bg-[#0f0f1f] border border-[#3a3a5a] rounded-xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-4 py-3 bg-[#1a1a3a] border-b border-[#2a2a5a] flex items-center gap-3">
          <span className="text-xl">🐛</span>
          <div className="flex-1">
            <div className="text-sm font-bold text-yellow-400">버그 리포트 목록</div>
            <div className="text-[10px] text-gray-500">총 {rows.length}개 · open {openCount} · resolved {resolvedCount}{urgentCount > 0 ? ` · 🔥 긴급 ${urgentCount}` : ""}</div>
          </div>
          <button
            onClick={runCleanup}
            disabled={cleaning}
            className="text-[11px] px-3 py-1.5 rounded bg-[#1a1a2e] border border-[#3a3a5a] text-gray-300 hover:border-yellow-400/40 disabled:opacity-40"
            title="GH에서 close된 이슈 → 로컬 resolved + 이미지 삭제"
          >{cleaning ? "⏳ 정리 중…" : "🧹 자동 정리"}</button>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
        </div>

        {/* 필터 */}
        <div className="px-3 py-2 border-b border-[#2a2a5a] flex items-center gap-1">
          {(["open", "urgent", "resolved", "all"] as const).map(f => {
            const labels = { open: `open (${openCount})`, urgent: `🔥 긴급 (${urgentCount})`, resolved: `resolved (${resolvedCount})`, all: `전체 (${rows.length})` };
            const active = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-[11px] px-2.5 py-1 rounded transition-colors ${
                  active ? "bg-yellow-500/25 text-yellow-200 border border-yellow-400/50"
                  : "bg-[#1a1a2e] text-gray-500 border border-[#3a3a5a] hover:text-gray-300"
                }`}>{labels[f]}</button>
            );
          })}
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {filtered.length === 0 && (
            <div className="text-center text-gray-600 py-8 text-sm">리포트 없음</div>
          )}
          {filtered.map((r, i) => {
            const status = r.status || "open";
            return (
              <div key={i} className={`rounded border p-2.5 ${
                status === "resolved" ? "bg-[#0f0f1f]/50 border-[#2a2a4a] opacity-60"
                : r.priority === "urgent" ? "bg-red-900/15 border-red-500/40"
                : "bg-[#1a1a2e] border-[#2a2a4a]"
              }`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {r.priority === "urgent" && <span className="text-[9px] font-bold px-1.5 py-[1px] rounded bg-red-500/30 text-red-200 border border-red-400/40">🔥 긴급</span>}
                      <span className={`text-[9px] font-bold px-1.5 py-[1px] rounded ${status === "resolved" ? "bg-green-500/20 text-green-300 border border-green-400/40" : "bg-yellow-500/20 text-yellow-300 border border-yellow-400/40"}`}>
                        {status === "resolved" ? "✓ RESOLVED" : "OPEN"}
                      </span>
                      {r.issue_number && (
                        <a href={r.issue_url} target="_blank" rel="noopener" className="text-[10px] text-blue-300 hover:text-blue-200">#{r.issue_number} ↗</a>
                      )}
                    </div>
                    <div className="text-[12px] font-bold text-gray-200 truncate">{r.title}</div>
                    <div className="text-[10px] text-gray-500 truncate mt-0.5">{r.note || "(내용 없음)"}</div>
                    <div className="text-[9px] text-gray-600 mt-1 flex items-center gap-2">
                      <span>{new Date(r.ts).toLocaleString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      {r.user && <span>· {r.user}</span>}
                      {r.meta?.build && <span className="text-gray-700">· {r.meta.build.slice(0, 8)}</span>}
                      {(r.attachments?.length ?? 0) > 0 && status === "open" && <span className="text-blue-400/60">· 📎 {r.attachments!.length}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
