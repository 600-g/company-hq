"use client";

import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { History, X, MessageSquare } from "lucide-react";

interface Team { id: string; name: string; emoji: string }
interface Props {
  open: boolean;
  onClose: () => void;
  apiBase: string;
  teams: Team[];
  onSelect: (teamId: string) => void;
}

interface HistoryEntry { teamId: string; count: number; lastTs?: string; preview?: string }

export default function SessionHistoryPanel({ open, onClose, apiBase, teams, onSelect }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all(teams.map(async (t) => {
      try {
        const r = await fetch(`${apiBase}/api/chat/${t.id}/history`);
        const d = await r.json();
        const msgs = d.messages || [];
        const last = msgs[msgs.length - 1];
        return { teamId: t.id, count: msgs.length, preview: last?.content?.slice(0, 60) };
      } catch {
        return { teamId: t.id, count: 0 };
      }
    })).then((rs) => {
      setEntries(rs.filter(r => r.count > 0).sort((a, b) => b.count - a.count));
    }).finally(() => setLoading(false));
  }, [open, teams, apiBase]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a4a]">
          <div className="flex items-center gap-2 text-sm font-bold text-yellow-400">
            <History className="h-4 w-4" />세션 히스토리
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading && <div className="text-center text-xs text-gray-500 py-4">로딩...</div>}
          {!loading && entries.length === 0 && (
            <div className="text-center text-xs text-gray-500 py-8">채팅 히스토리 없음</div>
          )}
          {entries.map((e) => {
            const t = teams.find(x => x.id === e.teamId);
            if (!t) return null;
            return (
              <button
                key={e.teamId}
                onClick={() => { onSelect(e.teamId); onClose(); }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded bg-[#1a1a2e] border border-[#2a2a4a] hover:border-yellow-400/40 text-left"
              >
                <span className="text-lg">{t.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-gray-200">{t.name}</div>
                  {e.preview && <div className="text-[12px] text-gray-500 truncate">{e.preview}</div>}
                </div>
                <Badge variant="secondary" className="flex-shrink-0">
                  <MessageSquare className="h-2.5 w-2.5 mr-1" />{e.count}
                </Badge>
              </button>
            );
          })}
        </div>
        <div className="px-3 py-2 border-t border-[#2a2a4a] flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>닫기</Button>
        </div>
      </div>
    </div>
  );
}
