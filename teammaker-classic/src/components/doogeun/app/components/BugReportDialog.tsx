"use client";

import { useEffect, useRef, useState } from "react";
import { submitBugReport } from "../lib/diag";

function apiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h === "127.0.0.1" || h.endsWith(".local") || h.startsWith("192.168.");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

interface Attachment {
  preview: string;  // blob URL
  serverPath?: string;
  uploading?: boolean;
  error?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function BugReportDialog({ open, onClose }: Props) {
  const [note, setNote] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [toast, setToast] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setAttachments([]);
      setPriority("normal");
      setTimeout(() => textRef.current?.focus(), 50);
    }
  }, [open]);

  const uploadFile = async (file: File): Promise<string | null> => {
    const form = new FormData();
    form.append("file", file);
    try {
      const r = await fetch(`${apiBase()}/api/upload/image`, { method: "POST", body: form });
      const d = await r.json();
      return d.ok ? d.path : null;
    } catch { return null; }
  };

  const addFiles = async (files: File[]) => {
    const incoming: Attachment[] = files.map(f => ({
      preview: URL.createObjectURL(f),
      uploading: true,
    }));
    setAttachments(prev => [...prev, ...incoming]);
    for (let i = 0; i < files.length; i++) {
      const idx = attachments.length + i;
      const path = await uploadFile(files[i]);
      setAttachments(prev => {
        const next = [...prev];
        if (next[idx]) {
          next[idx] = {
            ...next[idx],
            uploading: false,
            serverPath: path ?? undefined,
            error: path ? undefined : "업로드 실패",
          };
        }
        return next;
      });
    }
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || []);
    const files = items
      .filter(it => it.kind === "file" && it.type.startsWith("image/"))
      .map(it => it.getAsFile())
      .filter((f): f is File => f != null);
    if (files.length > 0) {
      e.preventDefault();
      await addFiles(files);
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length > 0) await addFiles(files);
  };

  const removeAttachment = (i: number) => {
    setAttachments(prev => {
      const next = [...prev];
      const removed = next.splice(i, 1)[0];
      if (removed) URL.revokeObjectURL(removed.preview);
      return next;
    });
  };

  const submit = async () => {
    if (!note.trim() && attachments.length === 0) {
      setToast("내용이나 스크린샷 중 하나는 필요해요");
      setTimeout(() => setToast(null), 2000);
      return;
    }
    setSubmitting(true);
    const paths = attachments.map(a => a.serverPath).filter((p): p is string => !!p);
    const prefix = priority === "urgent" ? "[HQ 🔥 긴급]" : "[HQ]";
    const body = {
      title: `${prefix} ${note.slice(0, 60) || "스크린샷 리포트"}`,
      note: note.trim(),
      attachments: paths,
      priority,
    };
    try {
      // diag.ts의 submitBugReport는 attachments 지원 안 하므로 직접 호출
      const { getRecentLogs } = await import("../lib/diag");
      const full = {
        ...body,
        logs: getRecentLogs(),
        meta: {
          ua: navigator.userAgent,
          url: location.href,
          build: (() => { try { return localStorage.getItem("hq-build-id") || ""; } catch { return ""; } })(),
          user: (() => {
            try { const u = JSON.parse(localStorage.getItem("hq-auth-user") || "{}"); return u?.nickname || ""; } catch { return ""; }
          })(),
          screen: `${screen.width}x${screen.height}`,
          viewport: `${innerWidth}x${innerHeight}`,
        },
      };
      const r = await fetch(`${apiBase()}/api/diag/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(full),
      });
      const d = await r.json();
      setSubmitting(false);
      if (d.ok) {
        window.dispatchEvent(new CustomEvent("hq:toast", { detail: { text: "✅ 버그 리포트 제출 완료", variant: "success", center: true, ms: 2500 } }));
        onClose();
      } else {
        window.dispatchEvent(new CustomEvent("hq:toast", { detail: { text: "❌ 제출 실패", variant: "error", center: true, ms: 2500 } }));
      }
    } catch {
      const r = await submitBugReport(body.title, body.note);
      setSubmitting(false);
      if (r.ok) {
        window.dispatchEvent(new CustomEvent("hq:toast", { detail: { text: "✅ 버그 리포트 제출 완료", variant: "success", center: true, ms: 2500 } }));
        onClose();
      } else {
        window.dispatchEvent(new CustomEvent("hq:toast", { detail: { text: "❌ 제출 실패", variant: "error", center: true, ms: 2500 } }));
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      onDragOver={(e) => e.preventDefault()}
    >
      <div
        className="w-full max-w-md bg-[#0f0f1f] border border-[#3a3a5a] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {/* 헤더 */}
        <div className="px-4 py-3 bg-[#1a1a3a] border-b border-[#2a2a5a] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🐛</span>
            <div>
              <div className="text-sm font-bold text-yellow-400">버그 리포트</div>
              <div className="text-[12px] text-gray-500">최근 콘솔 로그 500개 자동 첨부</div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
        </div>

        {/* 본문 */}
        <div className="p-4 space-y-3">
          <textarea
            ref={textRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onPaste={onPaste}
            placeholder="무엇이 잘못됐나요? 어떤 상황이었는지 간단히…&#10;&#10;⌘+V 로 스크린샷 붙여넣기 · 파일 드래그 앤 드롭 지원"
            rows={6}
            className="w-full bg-[#1a1a2e] border border-[#3a3a5a] text-gray-200 text-xs rounded px-3 py-2
                       focus:outline-none focus:border-yellow-400/50 resize-none leading-relaxed"
          />

          {/* 첨부 미리보기 */}
          {attachments.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5">
              {attachments.map((a, i) => (
                <div key={i} className="relative group aspect-square rounded border border-[#2a2a4a] bg-[#1a1a2e] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.preview} alt="" className="w-full h-full object-cover" />
                  {a.uploading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[13px] text-yellow-300">
                      업로드…
                    </div>
                  )}
                  {a.error && (
                    <div className="absolute inset-0 bg-red-900/60 flex items-center justify-center text-[13px] text-red-300">
                      실패
                    </div>
                  )}
                  {!a.uploading && !a.error && (
                    <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-green-400" title="업로드됨" />
                  )}
                  <button
                    onClick={() => removeAttachment(i)}
                    className="absolute bottom-0 left-0 right-0 text-[13px] bg-black/70 text-red-300 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >제거</button>
                </div>
              ))}
            </div>
          )}

          {/* 우선순위 토글 */}
          <div className="flex items-center gap-1">
            <span className="text-[12px] text-gray-500 mr-1">우선순위</span>
            <button
              onClick={() => setPriority("normal")}
              className={`text-[12px] px-2.5 py-1 rounded transition-colors ${
                priority === "normal"
                  ? "bg-gray-500/20 border border-gray-400/50 text-gray-200 font-bold"
                  : "bg-[#1a1a2e] border border-[#3a3a5a] text-gray-500 hover:text-gray-300"
              }`}
            >보통</button>
            <button
              onClick={() => setPriority("urgent")}
              className={`text-[12px] px-2.5 py-1 rounded transition-colors ${
                priority === "urgent"
                  ? "bg-red-500/25 border border-red-400/60 text-red-200 font-bold"
                  : "bg-[#1a1a2e] border border-[#3a3a5a] text-gray-500 hover:text-red-300"
              }`}
            >🔥 긴급</button>
          </div>

          {/* 액션 툴바 */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fileRef.current?.click()}
              className="text-[12px] px-2 py-1 rounded bg-[#1a1a2e] border border-[#3a3a5a] text-gray-300 hover:border-yellow-400/40 flex items-center gap-1"
              title="이미지 파일 선택"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              이미지
            </button>
            <input
              ref={fileRef} type="file" accept="image/*" multiple hidden
              onChange={(e) => { void addFiles(Array.from(e.target.files || [])); if (fileRef.current) fileRef.current.value = ""; }}
            />
            <span className="text-[13px] text-gray-600 ml-auto">⌘+V / 드래그 지원</span>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-4 py-3 border-t border-[#2a2a5a] flex items-center gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 text-xs py-2 rounded bg-[#1a1a2e] border border-[#3a3a5a] text-gray-300 hover:bg-[#2a2a4a] disabled:opacity-40"
          >취소</button>
          <button
            onClick={submit}
            disabled={submitting}
            className="flex-1 text-xs py-2 rounded bg-yellow-500 text-black font-bold hover:bg-yellow-400 disabled:opacity-40"
          >{submitting ? "제출 중…" : "제출"}</button>
        </div>

        {/* 토스트 */}
        {toast && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-[#0a0a1a] border border-yellow-400/40 text-yellow-300 text-[13px] shadow-xl">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
