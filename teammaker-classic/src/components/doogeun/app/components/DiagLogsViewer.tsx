"use client";

import { useEffect, useRef, useState } from "react";

interface LogRow {
  ts: string;
  level: string;
  msg: string;
  user?: string;
  url?: string;
  ua?: string;
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

export default function DiagLogsViewer({ open, onClose }: Props) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [level, setLevel] = useState<"all" | "info" | "warn" | "error">("all");
  const [filter, setFilter] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const fetchLogs = async () => {
      try {
        const q = level === "all" ? "" : `&level=${level}`;
        const r = await fetch(`${apiBase()}/api/diag/logs?limit=500${q}`, { cache: "no-store" });
        const d = await r.json();
        if (!cancelled && d.ok) setRows(d.rows || []);
      } catch {}
    };
    fetchLogs();
    const id = setInterval(fetchLogs, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [open, level]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [rows, autoScroll]);

  if (!open) return null;

  const filtered = filter
    ? rows.filter(r => r.msg.toLowerCase().includes(filter.toLowerCase()))
    : rows;

  const levelBadge = (lv: string) => {
    const cls =
      lv === "error" ? "bg-red-500/25 text-red-300 border-red-500/40"
      : lv === "warn" ? "bg-yellow-500/25 text-yellow-300 border-yellow-500/40"
      : "bg-[#2a2a4a] text-gray-400 border-[#3a3a5a]";
    return <span className={`text-[8px] font-bold px-1 py-[1px] rounded border ${cls} uppercase tracking-wider`}>{lv}</span>;
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl h-[80vh] bg-[#0f0f1f] border border-[#3a3a5a] rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-4 py-3 bg-[#1a1a3a] border-b border-[#2a2a5a] flex items-center gap-3">
          <span className="text-xl">📋</span>
          <div className="flex-1">
            <div className="text-sm font-bold text-yellow-400">실시간 로그</div>
            <div className="text-[10px] text-gray-500">3초마다 자동 갱신 · 최근 500줄</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
        </div>

        {/* 필터 */}
        <div className="px-3 py-2 border-b border-[#2a2a5a] flex items-center gap-2">
          <div className="flex gap-1">
            {(["all", "info", "warn", "error"] as const).map(lv => (
              <button key={lv} onClick={() => setLevel(lv)}
                className={`text-[10px] px-2 py-1 rounded transition-colors ${
                  level === lv
                    ? lv === "error" ? "bg-red-500/30 text-red-200 border border-red-400/50"
                    : lv === "warn" ? "bg-yellow-500/30 text-yellow-200 border border-yellow-400/50"
                    : "bg-yellow-500/20 text-yellow-300 border border-yellow-400/40"
                    : "bg-[#1a1a2e] text-gray-500 border border-[#3a3a5a] hover:text-gray-300"
                }`}>{lv.toUpperCase()}</button>
            ))}
          </div>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="검색 (msg 내용)…"
            className="flex-1 bg-[#1a1a2e] border border-[#3a3a5a] text-gray-200 text-[11px] rounded px-2 py-1 focus:outline-none focus:border-yellow-400/50"
          />
          <label className="flex items-center gap-1 text-[9px] text-gray-500 cursor-pointer">
            <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} className="accent-yellow-400" />
            자동 스크롤
          </label>
        </div>

        {/* 로그 리스트 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto font-mono text-[10px] p-2 space-y-0.5">
          {filtered.length === 0 && (
            <div className="text-center text-gray-600 py-8">로그 없음</div>
          )}
          {filtered.map((r, i) => (
            <div key={i} className={`px-2 py-1 rounded hover:bg-[#1a1a2e]/60 border-l-2 ${
              r.level === "error" ? "border-red-500/60"
              : r.level === "warn" ? "border-yellow-500/60"
              : "border-transparent"
            }`}>
              <div className="flex items-center gap-2 mb-0.5">
                {levelBadge(r.level)}
                <span className="text-[9px] text-gray-600">{r.ts?.slice(11, 19)}</span>
                {r.user && <span className="text-[9px] text-blue-300/70">{r.user}</span>}
              </div>
              <div className={`whitespace-pre-wrap break-words pl-1 ${
                r.level === "error" ? "text-red-300" : r.level === "warn" ? "text-yellow-300" : "text-gray-300"
              }`}>{r.msg}</div>
            </div>
          ))}
        </div>

        {/* 푸터 */}
        <div className="px-4 py-2 border-t border-[#2a2a5a] flex items-center justify-between text-[10px] text-gray-500">
          <span>{filtered.length}개 표시 · 총 {rows.length}개</span>
          <button onClick={() => setRows([])} className="hover:text-red-400">화면 비우기 (서버는 유지)</button>
        </div>
      </div>
    </div>
  );
}
