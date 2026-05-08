"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiBase } from "@/lib/utils";
import { getRecentLogs } from "@/lib/diag";

export interface BugRow {
  ts: string;
  title: string;
  note: string;
  issue_number?: number;
  urgent?: boolean;
  status?: "open" | "in_progress" | "resolved" | "closed";
  resolved?: boolean;
  images?: string[];
  comments?: { ts: string; author: string; text: string }[];
}

type BugFilter = "open" | "in_progress" | "resolved" | "all";

export default function BugsBody() {
  const [rows, setRows] = useState<BugRow[]>([]);
  const [note, setNote] = useState("");
  const [title, setTitle] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<BugFilter>("open");

  const load = async () => {
    try {
      const statusParam = filter === "all" ? "all" : filter;
      const r = await fetch(`${apiBase()}/api/diag/reports?status=${statusParam}`);
      const d = await r.json();
      const list: BugRow[] = (d.rows || []).slice().reverse();
      setRows(list.map((r: BugRow) => ({
        ...r,
        status: r.status || (r.resolved ? "resolved" : "open"),
      })));
    } catch { setRows([]); }
  };
  useEffect(() => { load(); }, [filter]);

  const addImage = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImages((p) => [...p, dataUrl].slice(0, 4));
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    for (const it of Array.from(e.clipboardData.items)) {
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) addImage(f);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    for (const f of Array.from(e.dataTransfer.files)) {
      if (f.type.startsWith("image/")) addImage(f);
    }
  };

  const submit = async () => {
    if (!note.trim()) return;
    setSending(true);
    try {
      const logs = getRecentLogs(200).map((l) => ({ level: l.level, msg: l.msg, ts: l.ts }));
      await fetch(`${apiBase()}/api/diag/report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          note: note.trim(),
          urgent,
          logs,
          images,
        }),
      });
      setNote(""); setTitle(""); setUrgent(false); setImages([]);
      await load();
    } finally { setSending(false); }
  };

  return (
    <div className="p-5 space-y-4">
      <div
        onPaste={handlePaste}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="p-3 rounded-lg border border-gray-800/60 bg-gray-900/20 space-y-2"
      >
        <div className="text-[12px] text-gray-400 font-bold">🎫 티켓 작성</div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목 (비우면 본문에서 자동 추출)"
          className="w-full h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="무슨 일? (⌘+V 이미지 붙여넣기 / 드래그-드롭 가능)"
          className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
        />
        {images.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <div key={i} className="relative">
                <img src={src} alt="" className="h-20 rounded border border-gray-700 object-cover" />
                <button
                  onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/90 text-white text-[10px] font-bold"
                >×</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[12px] text-gray-300 cursor-pointer">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="accent-red-400" />
              긴급
            </label>
            <label className="flex items-center gap-1.5 text-[12px] text-sky-300 hover:text-sky-200 cursor-pointer">
              📎 파일 첨부
              <input type="file" accept="image/*" multiple onChange={(e) => { for (const f of Array.from(e.target.files || [])) addImage(f); e.target.value = ""; }} className="hidden" />
            </label>
            <span className="text-[10px] text-gray-500">로그 자동 동봉 (토큰 X · 클라 메모리)</span>
          </div>
          <Button size="sm" onClick={submit} disabled={!note.trim() || sending}>
            {sending ? "전송 중..." : "티켓 제출"}
          </Button>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-gray-900/60 rounded border border-gray-800">
        {(["open", "in_progress", "resolved", "all"] as BugFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`flex-1 text-[12px] py-1.5 rounded transition-colors ${
              filter === s ? "bg-sky-500/15 text-gray-200 font-bold" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {s === "open" ? "열림" : s === "in_progress" ? "진행" : s === "resolved" ? "해결" : "전체"}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {rows.length === 0 ? (
          <div className="text-[12px] text-gray-500 text-center py-6">없음</div>
        ) : rows.slice(0, 30).map((r, i) => (
          <TicketRow key={i} row={r} onChanged={load} />
        ))}
      </div>
    </div>
  );
}

function TicketRow({ row, onChanged }: { row: BugRow; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const statusBadge = {
    open: { variant: "warning" as const, label: "열림" },
    in_progress: { variant: "default" as const, label: "진행 중" },
    resolved: { variant: "success" as const, label: "해결됨" },
    closed: { variant: "secondary" as const, label: "닫힘" },
  }[row.status || "open"];
  const checked = (row.status || "open") === "resolved";
  const toggleResolve = async () => {
    try {
      const r = await fetch(`${apiBase()}/api/diag/report/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ts: row.ts, status: checked ? "open" : "resolved" }),
      });
      if (r.ok) onChanged?.();
    } catch { /* ignore */ }
  };

  return (
    <div className="rounded-lg border border-gray-800/60 bg-gray-900/20">
      <div className="flex">
      <input
        type="checkbox"
        checked={checked}
        onChange={toggleResolve}
        onClick={(e) => e.stopPropagation()}
        className="mt-3 ml-3 w-4 h-4 cursor-pointer accent-emerald-500 shrink-0"
        title={checked ? "해결 해제" : "해결 완료로 이동"}
      />
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex-1 flex items-center gap-2 p-3 text-left hover:bg-gray-800/20 transition-colors min-w-0"
      >
        <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
        {row.urgent && <Badge variant="destructive">긴급</Badge>}
        <span className={`text-[13px] truncate flex-1 ${checked ? "text-gray-500 line-through" : "text-gray-200"}`}>{row.title}</span>
        {row.issue_number != null && (
          <a
            href={`https://github.com/600-g/company-hq/issues/${row.issue_number}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] text-cyan-400 hover:underline shrink-0"
          >
            #{row.issue_number}
          </a>
        )}
      </button>
      </div>
      {open && (
        <div className="border-t border-gray-800/60 p-3 space-y-2">
          <div className="text-[11px] text-gray-500 font-mono">{row.ts}</div>
          {row.note && <div className="text-[12px] text-gray-300 whitespace-pre-wrap">{row.note}</div>}
          {row.images && row.images.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {row.images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="h-24 rounded border border-gray-700 object-cover" />
              ))}
            </div>
          )}
          {row.comments && row.comments.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-gray-800/60">
              <div className="text-[11px] text-gray-500 font-bold">팔로업 ({row.comments.length})</div>
              {row.comments.map((c, i) => (
                <div key={i} className="text-[11px] text-gray-400">
                  <span className="font-mono">{c.ts}</span> · <span className="text-sky-300">{c.author}</span> · {c.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
