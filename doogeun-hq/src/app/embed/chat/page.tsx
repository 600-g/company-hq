"use client";

/**
 * 임베드 채팅 페이지 — 외부 사이트 widget.js 가 iframe 으로 띄움.
 *
 * URL: /embed/chat/?team={team_id}
 *
 * 세션(스레드) 분기:
 *  - 상단 [세션 라벨 ▼] 드롭다운 → 다른 세션으로 전환
 *  - [+ 새 채팅] 버튼 → 신규 세션 생성 + 자동 전환
 *  - WS 재연결 시 ?session_id=… 로 구독, history_sync 로 이전 메시지 복원
 *
 * 본진 useChatWs.ts 와 동일 프로토콜 (prompt/images 송신, ai_start/chunk/end 수신).
 */

import { useEffect, useRef, useState, useCallback } from "react";

interface ChatMsg {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  ts: number;
}

interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

function apiBase(): string {
  if (typeof window === "undefined") return "https://api.600g.net";
  const h = window.location.hostname;
  const local = h === "localhost" || h === "127.0.0.1" || h.endsWith(".local") || h.startsWith("192.168.");
  return local ? `http://${h}:8000` : `https://api.600g.net`;
}

function wsBase(): string {
  if (typeof window === "undefined") return "wss://api.600g.net";
  const h = window.location.hostname;
  const local = h === "localhost" || h === "127.0.0.1" || h.endsWith(".local") || h.startsWith("192.168.");
  return local ? `ws://${h}:8000` : `wss://api.600g.net`;
}

export default function EmbedChatPage() {
  const [teamId, setTeamId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [currentSession, setCurrentSession] = useState<string>("");
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentAgentIdRef = useRef<string | null>(null);

  // URL ?team=X 파싱
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTeamId(params.get("team") || "");
  }, []);

  // 세션 목록 + active 조회
  const refreshSessions = useCallback(async () => {
    if (!teamId) return;
    try {
      const r = await fetch(`${apiBase()}/api/sessions/${encodeURIComponent(teamId)}`);
      const d = await r.json();
      if (d.ok) {
        setSessions(d.sessions || []);
        if (!currentSession && d.session_id) setCurrentSession(d.session_id);
      }
    } catch {}
  }, [teamId, currentSession]);

  useEffect(() => { void refreshSessions(); }, [refreshSessions]);

  // WS 연결 (session 바뀌면 재연결)
  useEffect(() => {
    if (!teamId || !currentSession) return;
    const url = `${wsBase()}/ws/chat/${encodeURIComponent(teamId)}?session_id=${encodeURIComponent(currentSession)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    setMessages([]); // history_sync 가 채워줌
    currentAgentIdRef.current = null;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (ev) => {
      let data: { type?: string; content?: string; preview?: string; messages?: { type: string; content: string }[] } & Record<string, unknown> = {};
      try { data = JSON.parse(ev.data); } catch { return; }
      const kind = data.type;

      if (kind === "history_sync") {
        const msgs = data.messages || [];
        const restored: ChatMsg[] = msgs.map((m, i) => ({
          id: `h-${i}`,
          role: m.type === "user" ? "user" : m.type === "ai" ? "agent" : "system",
          text: m.content || "",
          ts: Date.now() - (msgs.length - i) * 1000,
        }));
        setMessages(restored);
      } else if (kind === "ai_start") {
        const id = `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        currentAgentIdRef.current = id;
        setMessages((m) => [...m, { id, role: "agent", text: "", ts: Date.now() }]);
        setSending(true);
      } else if (kind === "ai_chunk") {
        const id = currentAgentIdRef.current;
        const chunk = (data.content as string) || "";
        if (!id) return;
        setMessages((m) => m.map((x) => x.id === id ? { ...x, text: x.text + chunk } : x));
      } else if (kind === "ai_end") {
        currentAgentIdRef.current = null;
        setSending(false);
        // 메시지 흐름 끝났을 때 세션 목록 갱신 (messageCount 반영)
        void refreshSessions();
      } else if (kind === "error") {
        const msg = (data.content as string) || (data.preview as string) || "오류";
        setMessages((m) => [...m, { id: `e-${Date.now()}`, role: "system", text: `⚠️ ${msg}`, ts: Date.now() }]);
        setSending(false);
      }
    };

    return () => {
      try { ws.close(); } catch {}
      wsRef.current = null;
    };
  }, [teamId, currentSession, refreshSessions]);

  // 메시지 자동 스크롤
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function newChat() {
    if (!teamId) return;
    try {
      const r = await fetch(`${apiBase()}/api/sessions/${encodeURIComponent(teamId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "새 채팅" }),
      });
      const d = await r.json();
      if (d.ok && d.session?.id) {
        setSessions(d.sessions || []);
        setCurrentSession(d.session.id);
        setSessionMenuOpen(false);
      }
    } catch {}
  }

  function switchSession(sid: string) {
    setSessionMenuOpen(false);
    if (sid === currentSession) return;
    setCurrentSession(sid);
  }

  function send() {
    const text = input.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const userMsg: ChatMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      ts: Date.now(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    try {
      wsRef.current.send(JSON.stringify({ prompt: text, images: [] }));
    } catch {
      setMessages((m) => [...m, { id: `e-${Date.now()}`, role: "system", text: "⚠️ 전송 실패", ts: Date.now() }]);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean };
    if (native.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (!teamId) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#06060e] text-gray-400 text-sm">
        ?team= 파라미터 필요
      </div>
    );
  }

  const currentTitle = sessions.find((s) => s.id === currentSession)?.title || (currentSession ? "기본 세션" : "(로딩 중)");

  return (
    <div className="h-screen w-screen flex flex-col bg-[#06060e] text-gray-100" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <header className="shrink-0 h-10 px-3 flex items-center gap-2 border-b border-gray-800/70 text-[11px] relative">
        <button
          onClick={() => setSessionMenuOpen((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-800/60 max-w-[60%]"
          title="세션 전환"
        >
          <span className="text-gray-200 truncate">{currentTitle}</span>
          <span className="text-gray-500 text-[10px]">▼</span>
          <span className="text-gray-500 ml-1">({sessions.length})</span>
        </button>
        <button
          onClick={newChat}
          className="px-2 py-1 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-100 text-[11px]"
          title="새 채팅 시작"
        >
          + 새 채팅
        </button>
        <span className={`ml-auto ${connected ? "text-emerald-400" : "text-gray-500"}`}>
          {connected ? "● 연결됨" : "○ 연결 중..."}
        </span>

        {sessionMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setSessionMenuOpen(false)}
            />
            <div className="absolute left-3 top-9 z-20 w-64 max-h-64 overflow-y-auto bg-[#0b0b14] border border-gray-700 rounded-lg shadow-xl py-1">
              {sessions.length === 0 && (
                <div className="px-3 py-2 text-gray-500 text-[11px]">세션 없음</div>
              )}
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => switchSession(s.id)}
                  className={`w-full text-left px-3 py-2 hover:bg-gray-800/60 ${
                    s.id === currentSession ? "bg-indigo-600/20 text-indigo-100" : "text-gray-200"
                  }`}
                >
                  <div className="truncate text-[12px]">{s.title || "(제목 없음)"}</div>
                  <div className="text-[10px] text-gray-500">{s.messageCount}건 · {new Date(s.updatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-gray-500 text-xs text-center pt-12">
            메시지를 입력해서 시작하세요.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`max-w-[85%] ${m.role === "user" ? "ml-auto" : ""}`}>
            <div
              className={`text-[12px] leading-relaxed rounded-lg px-3 py-2 whitespace-pre-wrap break-words ${
                m.role === "user"
                  ? "bg-indigo-600/30 text-indigo-100"
                  : m.role === "system"
                  ? "bg-amber-600/20 text-amber-200"
                  : "bg-gray-800/60 text-gray-100"
              }`}
            >
              {m.text || (m.role === "agent" && sending ? "..." : "")}
            </div>
          </div>
        ))}
      </div>

      <footer className="shrink-0 border-t border-gray-800/70 p-2 flex gap-2 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={connected ? "메시지를 입력하고 Enter…" : "연결 중..."}
          disabled={!connected || sending}
          rows={2}
          className="flex-1 bg-[#0b0b14] border border-gray-800 rounded-lg px-3 py-2 text-[12px] text-gray-100 resize-none focus:outline-none focus:border-indigo-500/60"
        />
        <button
          onClick={send}
          disabled={!connected || sending || !input.trim()}
          className="shrink-0 h-9 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-[12px] font-semibold"
        >
          {sending ? "..." : "전송"}
        </button>
      </footer>
    </div>
  );
}
