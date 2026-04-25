"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { X, Paperclip, Trash2, AlertTriangle } from "lucide-react";
import { apiBase } from "@/lib/utils";
import { getRecentLogs } from "@/lib/diag";

type Priority = "low" | "normal" | "high" | "urgent";

interface Props {
  onClose: () => void;
  onSent: () => void;
  defaultTitle?: string;
}

/**
 * 버그 리포트 고급 다이얼로그.
 *   - 이미지 붙여넣기(⌘+V) + 드래그드롭 + 파일선택
 *   - 우선순위 4단계
 *   - 로그 전송 시 자동 첨부 (최근 200개 링버퍼)
 *   - ESC 닫기
 */
export default function BugReportDialog({ onClose, onSent, defaultTitle }: Props) {
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [attachLogs, setAttachLogs] = useState(true);
  const [images, setImages] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const readImage = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) { setError("이미지는 5MB 이하로"); return; }
    const reader = new FileReader();
    reader.onload = () => setImages((p) => [...p, String(reader.result)]);
    reader.readAsDataURL(file);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) { e.preventDefault(); readImage(f); }
      }
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    files.forEach(readImage);
  };

  const send = async () => {
    const content = note.trim();
    if (!content && !title.trim()) { setError("제목 또는 내용이 필요합니다"); return; }
    setSending(true); setError(null);
    try {
      const logs = attachLogs ? getRecentLogs(200) : [];
      const res = await fetch(`${apiBase()}/api/diag/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || content.slice(0, 40),
          note: content,
          priority,
          urgent: priority === "urgent",
          logs,
          images,
          url: typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        onPaste={onPaste}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>버그 리포트</CardTitle>
              <CardDescription>이미지 붙여넣기 · 드래그드롭 · 로그 자동 첨부</CardDescription>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
              <X className="w-4 h-4" />
            </button>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목 (선택)"
              className="w-full h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-[13px] text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              placeholder="무슨 일이 일어났나요? 재현 방법이 있으면 적어주세요."
              className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
            />

            {/* 우선순위 */}
            <div className="flex gap-1 p-1 bg-gray-900/60 rounded border border-gray-800">
              {(["low", "normal", "high", "urgent"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`flex-1 text-[11px] py-1.5 rounded transition-colors ${
                    priority === p
                      ? p === "urgent" ? "bg-red-500/20 text-red-300 font-bold"
                      : p === "high" ? "bg-amber-500/20 text-amber-300 font-bold"
                      : p === "low" ? "bg-gray-500/20 text-gray-300 font-bold"
                      : "bg-sky-500/20 text-sky-300 font-bold"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {p === "low" ? "낮음" : p === "normal" ? "보통" : p === "high" ? "높음" : "🔥 긴급"}
                </button>
              ))}
            </div>

            {/* 이미지 프리뷰 */}
            {images.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {images.map((src, i) => (
                  <div key={i} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-20 w-20 object-cover rounded border border-gray-700" />
                    <button
                      onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 bg-gray-900 border border-gray-700 rounded-full p-0.5 opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3 h-3 text-red-300" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 첨부 컨트롤 */}
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1 text-gray-400 hover:text-gray-200"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  이미지 첨부
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => { Array.from(e.target.files || []).forEach(readImage); if (fileRef.current) fileRef.current.value = ""; }}
                />
                <label className="flex items-center gap-1 text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={attachLogs}
                    onChange={(e) => setAttachLogs(e.target.checked)}
                    className="accent-sky-400"
                  />
                  로그 자동 첨부 (최근 200)
                </label>
              </div>
              <span className="text-gray-500">⌘+V · 드래그</span>
            </div>

            {error && (
              <div className="flex items-center gap-1.5 text-[11px] text-red-300 px-2 py-1.5 bg-red-500/10 rounded border border-red-500/30">
                <AlertTriangle className="w-3.5 h-3.5" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>취소</Button>
              <Button onClick={send} disabled={sending || (!note.trim() && !title.trim())}>
                {sending ? "전송 중..." : "전송"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
