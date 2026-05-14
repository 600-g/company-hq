"use client";

/**
 * 임베드 채팅 페이지 — 외부 사이트 widget.js 가 iframe 으로 띄움.
 *
 * URL: /embed/chat/?team={team_id}
 *
 * 기능:
 *  - 세션(스레드) 분기: 드롭다운 + 새 채팅 + 🗑 숨김 (데이터 보존, UI 만 가림)
 *  - 답변 중 상태: 🔄 spinner + 경과 시간(Ns)
 *  - history_sync 로 이전 메시지 복원
 *  - IME(한글) Enter 두번 가드
 *
 * 본진 useChatWs.ts 와 동일 프로토콜.
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
  const [elapsedSec, setElapsedSec] = useState(0);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [currentSession, setCurrentSession] = useState<string>("");
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentAgentIdRef = useRef<string | null>(null);
  const sendingStartRef = useRef<number>(0);

  // URL ?team=X
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTeamId(params.get("team") || "");
  }, []);

  // 경과 시간 카운터 (sending 동안만)
  useEffect(() => {
    if (!sending) { setElapsedSec(0); return; }
    sendingStartRef.current = Date.now();
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - sendingStartRef.current) / 1000));
    }, 200);
    return () => clearInterval(id);
  }, [sending]);

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

  // WS 연결 — session 바뀌면 재연결
  useEffect(() => {
    if (!teamId || !currentSession) return;
    const url = `${wsBase()}/ws/chat/${encodeURIComponent(teamId)}?session_id=${encodeURIComponent(currentSession)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    setMessages([]);
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
        // 자동 제목화 — 백엔드가 기본 title + msgCount≥2 조건 검사. fire-and-forget.
        void fetch(`${apiBase()}/api/embed/session-auto-title`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ team_id: teamId, session_id: currentSession }),
        }).catch(() => {});
        // 제목 갱신 반영 + 메시지 카운터 — 1.5초 후 refresh (LLM 응답 대기)
        setTimeout(() => { void refreshSessions(); }, 1500);
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

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, elapsedSec]);

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

  // 세션 숨김 — 데이터 그대로, UI 에서만 가림
  async function hideSession(sid: string) {
    if (!teamId) return;
    try {
      const r = await fetch(`${apiBase()}/api/sessions/${encodeURIComponent(teamId)}/${encodeURIComponent(sid)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: true }),
      });
      const d = await r.json();
      if (d.ok) {
        // 숨긴 게 현재 세션이면 가장 최근 일반 세션으로 fallback
        const next = (d.sessions || []).find((s: SessionMeta) => s.id !== sid)?.id || "";
        setSessions(d.sessions || []);
        if (sid === currentSession) {
          if (next) setCurrentSession(next);
          else {
            // 남은 세션 없으면 새로 생성
            void newChat();
          }
        }
      }
    } catch {}
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
      <div className="h-screen w-screen flex items-center justify-center bg-[#06060e] text-gray-300 text-sm">
        ?team= 파라미터 필요
      </div>
    );
  }

  const currentTitle = sessions.find((s) => s.id === currentSession)?.title || (currentSession ? "기본 세션" : "(로딩 중)");

  return (
    <div className="h-screen w-screen flex flex-col bg-[#06060e] text-gray-100" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <header className="shrink-0 h-10 px-3 flex items-center gap-2 border-b border-gray-700 text-[11px] relative">
        <button
          onClick={() => setSessionMenuOpen((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-700/70 max-w-[55%]"
          title="세션 전환"
        >
          <span className="text-gray-50 font-semibold truncate">{currentTitle}</span>
          <span className="text-gray-300 text-[10px]">▼</span>
          <span className="text-gray-300 ml-1">({sessions.length})</span>
        </button>
        <button
          onClick={newChat}
          className="px-2 py-1 rounded bg-indigo-500 hover:bg-indigo-400 text-white text-[11px] font-semibold"
          title="새 채팅 시작"
        >
          + 새 채팅
        </button>
        <span className={`ml-auto font-semibold ${connected ? "text-emerald-300" : "text-gray-400"}`}>
          {connected ? "● 연결됨" : "○ 연결 중..."}
        </span>

        {sessionMenuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setSessionMenuOpen(false)} />
            <div className="absolute left-3 top-9 z-20 w-72 max-h-72 overflow-y-auto bg-[#0b0b14] border border-gray-600 rounded-lg shadow-xl py-1">
              {sessions.length === 0 && (
                <div className="px-3 py-2 text-gray-300 text-[11px]">세션 없음</div>
              )}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`group flex items-center px-3 py-2 hover:bg-gray-700/60 ${
                    s.id === currentSession ? "bg-indigo-500/25" : ""
                  }`}
                >
                  <button onClick={() => switchSession(s.id)} className="flex-1 text-left min-w-0">
                    <div className={`truncate text-[12px] ${s.id === currentSession ? "text-indigo-100 font-semibold" : "text-gray-100"}`}>
                      {s.title || "(제목 없음)"}
                    </div>
                    <div className="text-[10px] text-gray-300">
                      {s.messageCount}건 · {new Date(s.updatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm("이 채팅을 숨길까요? (데이터는 보존됩니다)")) void hideSession(s.id); }}
                    className="ml-2 px-2 py-1 text-gray-400 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="이 채팅 숨김 (데이터는 보존)"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-gray-300 text-xs text-center pt-12">
            메시지를 입력해서 시작하세요.
          </div>
        )}
        {messages.map((m, idx) => {
          const isLast = idx === messages.length - 1;
          const isStreaming = m.role === "agent" && sending && isLast && !m.text;
          return (
            <div key={m.id} className={`max-w-[85%] ${m.role === "user" ? "ml-auto" : ""}`}>
              <div
                className={`text-[12.5px] leading-relaxed rounded-lg px-3 py-2 whitespace-pre-wrap break-words ${
                  m.role === "user"
                    ? "bg-indigo-500 text-white"
                    : m.role === "system"
                    ? "bg-amber-500/30 text-amber-100 border border-amber-500/40"
                    : "bg-gray-700/80 text-gray-50"
                }`}
              >
                {isStreaming ? (
                  <span className="inline-flex items-center gap-2 text-gray-200">
                    <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    답변 작성 중… ({elapsedSec}초)
                  </span>
                ) : (
                  m.text || (m.role === "agent" && sending ? "..." : "")
                )}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="shrink-0 border-t border-gray-700 p-2 flex gap-2 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={connected ? "메시지를 입력하고 Enter…" : "연결 중..."}
          disabled={!connected || sending}
          rows={2}
          className="flex-1 bg-[#0b0b14] border border-gray-600 rounded-lg px-3 py-2 text-[12.5px] text-gray-50 placeholder:text-gray-400 resize-none focus:outline-none focus:border-indigo-400"
        />
        <button
          onClick={send}
          disabled={!connected || sending || !input.trim()}
          className="shrink-0 h-9 px-4 bg-indigo-500 hover:bg-indigo-400 disabled:bg-gray-600 disabled:text-gray-400 rounded-lg text-[12px] font-semibold text-white"
        >
          {sending ? `${elapsedSec}s` : "전송"}
        </button>
      </footer>
    </div>
  );
}
