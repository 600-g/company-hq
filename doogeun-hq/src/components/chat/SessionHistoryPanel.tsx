"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, MessageSquarePlus, Trash2, Edit2, Check, X } from "lucide-react";
import { apiBase } from "@/lib/utils";
import { useConfirm } from "@/components/Confirm";

interface SessionRow {
  id: string;
  title: string;
  updated_at?: number;
  message_count?: number;
  preview?: string;
}

interface Props {
  teamId: string;
  onClose?: () => void;
}

/**
 * 세션 리스트 패널 — 팀 내 여러 대화 세션 관리.
 *   - 생성 / 전환 (activate) / 이름변경 / 삭제
 *   - 서버 /api/sessions/{team_id}
 *   - WS sessions_sync 브로드캐스트 수신 시 새로고침
 */
export default function SessionHistoryPanel({ teamId, onClose }: Props) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/api/sessions/${teamId}`);
      const d = await r.json();
      if (d.ok) {
        setSessions(d.sessions || []);
        setActiveId(d.session_id || null);
      }
    } catch {} finally { setLoading(false); }
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      const r = await fetch(`${apiBase()}/api/sessions/${teamId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `세션 ${sessions.length + 1}` }),
      });
      const d = await r.json();
      if (d.ok && d.session) {
        await load();
        await activate(d.session.id);
      }
    } catch {}
  };

  const activate = async (sessionId: string) => {
    try {
      await fetch(`${apiBase()}/api/sessions/${teamId}/${sessionId}/activate`, { method: "POST" });
      setActiveId(sessionId);
      // 해당 세션의 히스토리 로드 → chatStore 에 반영
      const histRes = await fetch(`${apiBase()}/api/chat/${teamId}/history?session_id=${sessionId}`);
      const h = await histRes.json();
      if (h.ok && Array.isArray(h.messages)) {
        const { useChatStore } = await import("@/stores/chatStore");
        const msgs = h.messages.map((m: Record<string, unknown>) => ({
          id: (m.id as string) || crypto.randomUUID(),
          role: (m.role as "user" | "agent" | "system") || "agent",
          content: (m.content as string) || "",
          ts: (m.ts as number) || Date.now(),
          streaming: false,
        }));
        useChatStore.getState().setMessages(teamId, msgs);
      }
    } catch {}
  };

  const rename = async (sessionId: string, title: string) => {
    if (!title.trim()) { setRenamingId(null); return; }
    try {
      await fetch(`${apiBase()}/api/sessions/${teamId}/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      setRenamingId(null);
      await load();
    } catch {}
  };

  const del = async (sess: SessionRow) => {
    const ok = await confirm({
      title: "세션 삭제",
      message: `"${sess.title}" 을(를) 삭제할까요?`,
      confirmText: "삭제",
      destructive: true,
    });
    if (!ok) return;
    try {
      await fetch(`${apiBase()}/api/sessions/${teamId}/${sess.id}`, { method: "DELETE" });
      await load();
    } catch {}
  };

  return (
    <div className="rounded-lg border border-gray-800/60 bg-gray-900/40 max-h-72 flex flex-col overflow-hidden">
      <div className="h-8 shrink-0 flex items-center gap-2 px-2 border-b border-gray-800/50">
        <MessageSquarePlus className="w-3.5 h-3.5 text-sky-300" />
        <span className="text-[11px] font-bold text-gray-200">세션 {sessions.length}</span>
        <button
          onClick={create}
          className="ml-auto flex items-center gap-0.5 text-[10px] text-sky-300 hover:text-sky-200"
          title="새 세션"
        >
          <Plus className="w-3 h-3" /> 새로
        </button>
        {onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && sessions.length === 0 ? (
          <div className="py-4 text-center text-[10px] text-gray-500">로딩...</div>
        ) : sessions.length === 0 ? (
          <div className="py-4 text-center text-[10px] text-gray-500">세션 없음</div>
        ) : (
          sessions.map((s) => {
            const active = s.id === activeId;
            const renaming = renamingId === s.id;
            return (
              <div
                key={s.id}
                className={`group flex items-center gap-1.5 px-2 py-1.5 text-[11px] border-b border-gray-800/30 last:border-0 ${
                  active ? "bg-sky-500/10" : "hover:bg-gray-800/30"
                }`}
              >
                {renaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => rename(s.id, renameValue)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") rename(s.id, renameValue);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="flex-1 h-5 px-1 bg-gray-900 border border-sky-400/50 rounded text-[11px] text-gray-100"
                  />
                ) : (
                  <button
                    onClick={() => activate(s.id)}
                    className={`flex-1 min-w-0 text-left ${active ? "text-sky-200 font-bold" : "text-gray-300"}`}
                  >
                    <div className="truncate">{s.title}</div>
                    {s.preview && <div className="text-gray-500 text-[10px] truncate">{s.preview}</div>}
                  </button>
                )}
                {s.message_count != null && s.message_count > 0 && (
                  <span className="text-[9px] text-gray-500 font-mono">{s.message_count}</span>
                )}
                {!renaming && (
                  <>
                    <button
                      onClick={() => { setRenamingId(s.id); setRenameValue(s.title); }}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-200 transition-opacity"
                      title="이름 변경"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => del(s)}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity"
                      title="삭제"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                )}
                {renaming && (
                  <button onClick={() => rename(s.id, renameValue)} className="text-green-400">
                    <Check className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
