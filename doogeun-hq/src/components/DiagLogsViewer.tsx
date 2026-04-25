"use client";

import { useEffect, useRef, useState } from "react";
import { X, Trash2, Download, Search, Terminal as TerminalIcon } from "lucide-react";
import { getRecentLogs, type DiagLog } from "@/lib/diag";

interface Props {
  onClose: () => void;
}

type LevelFilter = "all" | "log" | "info" | "warn" | "error";

const LEVEL_STYLE: Record<DiagLog["level"], string> = {
  log: "text-gray-300",
  info: "text-sky-300",
  warn: "text-amber-300",
  error: "text-red-300",
};
const LEVEL_BG: Record<DiagLog["level"], string> = {
  log: "bg-gray-800/40",
  info: "bg-sky-500/10",
  warn: "bg-amber-500/10",
  error: "bg-red-500/10",
};

export default function DiagLogsViewer({ onClose }: Props) {
  const [logs, setLogs] = useState<DiagLog[]>(() => getRecentLogs(500));
  const [filter, setFilter] = useState<LevelFilter>("all");
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 1초 주기 폴링 — 링버퍼에서 새 로그 수집
  useEffect(() => {
    const id = setInterval(() => setLogs(getRecentLogs(500)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (follow) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length, follow]);

  const visible = logs.filter((l) => {
    if (filter !== "all" && l.level !== filter) return false;
    if (query && !l.msg.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const counts = logs.reduce((acc, l) => {
    acc[l.level] = (acc[l.level] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const download = () => {
    const txt = logs.map((l) => `[${l.ts}] [${l.level.toUpperCase()}] ${l.msg}`).join("\n");
    const blob = new Blob([txt], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `diag-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const clear = () => {
    // 실제 링버퍼는 못 지움 — UI만 초기화 (다음 폴링 때 다시 채워짐)
    setLogs([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:p-4 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-3xl h-[70vh] sm:h-[80vh] bg-[#0b0b14] border border-gray-800 rounded-t-xl sm:rounded-xl flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="h-11 shrink-0 flex items-center gap-2 px-3 border-b border-gray-800/70">
          <TerminalIcon className="w-4 h-4 text-sky-300" />
          <span className="text-[13px] font-bold text-gray-200">진단 로그</span>
          <span className="text-[11px] text-gray-500">{visible.length}/{logs.length}</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={download}
              title="다운로드"
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={clear}
              title="UI 초기화"
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              title="닫기 (ESC)"
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 필터/검색 */}
        <div className="px-3 py-2 border-b border-gray-800/50 flex flex-wrap items-center gap-2">
          <div className="flex gap-0.5 bg-gray-900 rounded border border-gray-800 p-0.5">
            {(["all", "log", "info", "warn", "error"] as const).map((lv) => (
              <button
                key={lv}
                onClick={() => setFilter(lv)}
                className={`px-2 py-1 text-[11px] rounded transition-colors ${
                  filter === lv
                    ? lv === "error" ? "bg-red-500/20 text-red-300 font-bold"
                    : lv === "warn" ? "bg-amber-500/20 text-amber-300 font-bold"
                    : lv === "info" ? "bg-sky-500/20 text-sky-300 font-bold"
                    : "bg-gray-700 text-gray-200 font-bold"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {lv === "all" ? "전체" : lv.toUpperCase()}
                {lv !== "all" && counts[lv] ? <span className="ml-1 opacity-60">{counts[lv]}</span> : null}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 flex-1 min-w-[120px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색..."
              className="flex-1 h-7 rounded border border-gray-800 bg-gray-900/60 px-2 text-[11px] text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
            />
          </div>
          <label className="flex items-center gap-1 text-[11px] text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={follow}
              onChange={(e) => setFollow(e.target.checked)}
              className="accent-sky-400"
            />
            자동 스크롤
          </label>
        </div>

        {/* 로그 리스트 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-[11px]">
          {visible.length === 0 ? (
            <div className="py-10 text-center text-gray-500 font-sans">
              {logs.length === 0 ? "로그 없음 — 페이지 조작 시 여기에 출력됩니다" : "조건에 맞는 로그 없음"}
            </div>
          ) : (
            visible.map((l, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 px-2 py-1 rounded ${LEVEL_BG[l.level]}`}
              >
                <span className="text-gray-500 shrink-0 w-20">{l.ts.slice(11, 19)}</span>
                <span className={`font-bold shrink-0 w-10 ${LEVEL_STYLE[l.level]}`}>{l.level.toUpperCase()}</span>
                <span className={`${LEVEL_STYLE[l.level]} whitespace-pre-wrap break-all min-w-0 flex-1`}>{l.msg}</span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
