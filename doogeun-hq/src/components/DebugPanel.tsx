"use client";

import { useEffect, useState } from "react";
import { X, Bug, Terminal as TerminalIcon } from "lucide-react";
import { apiBase } from "@/lib/utils";
import { getRecentLogs, type DiagLog } from "@/lib/diag";
import BugReportDialog from "@/components/BugReportDialog";

interface Props {
  onClose: () => void;
}

type Tab = "logs";

interface BugRow { ts: string; title: string; note: string; issue_number?: number; status?: string; urgent?: boolean }

const LEVEL_STYLE: Record<DiagLog["level"], string> = {
  log: "text-gray-300", info: "text-sky-300", warn: "text-amber-300", error: "text-red-300",
};

/** 진단 로그 패널 (버그 티켓은 연구소 통합으로 분리됨, ESC 닫기) */
export default function DebugPanel({ onClose }: Props) {
  const [tab] = useState<Tab>("logs");
  const [showBugReport, setShowBugReport] = useState(false);
  void tab; // 단일 탭이라 미사용

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4" onClick={onClose}>
      <div className="w-full max-w-3xl h-[85vh] bg-[var(--background)] border border-gray-800 rounded-xl flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="h-11 shrink-0 flex items-center gap-2 px-3 border-b border-gray-800/70">
          <TerminalIcon className="w-3.5 h-3.5 text-sky-300" />
          <span className="text-[13px] font-bold text-sky-200">진단 로그</span>
          <span className="text-[10px] text-gray-500">브라우저 메모리 링버퍼 · 토큰 0 · 버그는 연구소→버그 탭</span>
          <button onClick={onClose} className="ml-auto p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <LogsPane />
        </div>
      </div>
      {showBugReport && <BugReportDialog onClose={() => setShowBugReport(false)} onSent={() => setShowBugReport(false)} />}
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-[13px] font-bold flex items-center gap-1.5 transition-colors ${
        active ? "bg-sky-500/15 text-sky-200" : "text-gray-500 hover:text-gray-200 hover:bg-gray-800/40"
      }`}
    >
      {icon}{children}
    </button>
  );
}

export function LogsPane() {
  const [logs, setLogs] = useState<DiagLog[]>(() => getRecentLogs(500));
  const [level, setLevel] = useState<"all" | DiagLog["level"]>("all");
  const [q, setQ] = useState("");
  useEffect(() => {
    const id = setInterval(() => setLogs(getRecentLogs(500)), 1000);
    return () => clearInterval(id);
  }, []);
  const visible = logs.filter((l) => (level === "all" || l.level === level) && (!q || l.msg.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800/50 flex items-center gap-2 flex-wrap">
        <div className="flex gap-0.5 bg-gray-900 rounded border border-gray-800 p-0.5">
          {(["all", "log", "info", "warn", "error"] as const).map((lv) => (
            <button key={lv} onClick={() => setLevel(lv)} className={`px-2 py-1 text-[12px] rounded ${level === lv ? "bg-sky-500/20 text-sky-200 font-bold" : "text-gray-400 hover:text-gray-200"}`}>
              {lv === "all" ? "전체" : lv.toUpperCase()}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색..." className="flex-1 min-w-[120px] h-7 rounded border border-gray-800 bg-gray-900/60 px-2 text-[12px] text-gray-100" />
        <span className="text-[11px] text-gray-500">{visible.length}/{logs.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[12px] space-y-0.5">
        {visible.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-gray-500 font-sans">로그 없음</div>
        ) : visible.map((l, i) => (
          <div key={i} className={`flex gap-2 px-2 py-1 rounded hover:bg-gray-900/40 ${LEVEL_STYLE[l.level]}`}>
            <span className="text-gray-500 shrink-0 w-20">{l.ts.slice(11, 19)}</span>
            <span className="font-bold shrink-0 w-10">{l.level.toUpperCase()}</span>
            <span className="whitespace-pre-wrap break-all min-w-0 flex-1">{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BugsPane({ onNew }: { onNew: () => void }) {
  const [rows, setRows] = useState<BugRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/api/diag/reports?status=${filter === "all" ? "" : filter}`);
      const d = await r.json();
      setRows((d.rows || []).slice().reverse());
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [filter]);
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800/50 flex items-center gap-2">
        <div className="flex gap-0.5 bg-gray-900 rounded border border-gray-800 p-0.5">
          {(["open", "resolved", "all"] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={`px-2 py-1 text-[12px] rounded ${filter === s ? "bg-sky-500/20 text-sky-200 font-bold" : "text-gray-400 hover:text-gray-200"}`}>
              {s === "open" ? "열림" : s === "resolved" ? "해결" : "전체"}
            </button>
          ))}
        </div>
        <button onClick={onNew} className="ml-auto text-[12px] px-3 py-1 rounded bg-sky-500/20 border border-sky-400/40 text-sky-200 hover:bg-sky-500/30">
          + 리포트 작성
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {loading ? <div className="text-center text-[12px] text-gray-500 py-4">로딩...</div>
         : rows.length === 0 ? <div className="text-center text-[12px] text-gray-500 py-4">버그 없음 🎉</div>
         : rows.slice(0, 50).map((r, i) => (
          <div key={i} className="p-2.5 rounded border border-gray-800/60 bg-gray-900/30">
            <div className="flex items-center gap-2">
              {r.urgent && <span className="text-red-400">🔥</span>}
              <span className="text-[13px] text-gray-100 flex-1 truncate">{r.title}</span>
              {r.issue_number != null && (
                <a href={`https://github.com/600-g/company-hq/issues/${r.issue_number}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-cyan-400 hover:underline">#{r.issue_number}</a>
              )}
            </div>
            <div className="text-[10px] text-gray-500 font-mono mt-0.5">{r.ts}</div>
            {r.note && <div className="text-[11px] text-gray-400 mt-1 line-clamp-2">{r.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
