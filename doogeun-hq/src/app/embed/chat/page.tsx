"use client";

/**
 * 임베드 채팅 페이지 — 외부 사이트 widget.js 가 iframe 으로 띄움.
 *
 * URL: /embed/chat/?team={team_id}
 *
 * 두근컴퍼니 메인 UI 와 분리된 minimal 모드. 자체 WS 연결 (chatStore 의존 없음).
 * 인증: .600g.net 쿠키 (백엔드 ws_handler 가 검증 — 현재는 인증 강제 X, 추후 강화)
 */

import { useEffect, useRef, useState } from "react";

interface ChatMsg {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  ts: number;
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
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentAgentIdRef = useRef<string | null>(null);

  // URL ?team=X 파싱
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("team") || "";
    setTeamId(t);
  }, []);

  // WS 연결
  useEffect(() => {
    if (!teamId) return;
    const url = `${wsBase()}/ws/chat/${encodeURIComponent(teamId)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (ev) => {
      let data: { type?: string; content?: string; preview?: string; messages?: { type: string; content: string }[] } & Record<string, unknown> = {};
      try { data = JSON.parse(ev.data); } catch { return; }
      const kind = data.type;

      if (kind === "history_sync") {
        // 서버 보존 메시지 복원 — 모달 닫고 다시 열어도 대화 이어짐
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
  }, [teamId]);

  // 메시지 자동 스크롤
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

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
      // 본진 useChatWs.ts 와 동일 프로토콜 — prompt 필드 (content 아님!)
      wsRef.current.send(JSON.stringify({ prompt: text, images: [] }));
    } catch {
      setMessages((m) => [...m, { id: `e-${Date.now()}`, role: "system", text: "⚠️ 전송 실패", ts: Date.now() }]);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // IME(한글 등) composition 중에는 Enter 가 변환 확정용 — 전송 트리거 X (두번 발동 방지)
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

  return (
    <div className="h-screen w-screen flex flex-col bg-[#06060e] text-gray-100" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <header className="shrink-0 h-9 px-3 flex items-center justify-between border-b border-gray-800/70 text-[11px]">
        <span className="text-gray-300 font-mono">{teamId}</span>
        <span className={connected ? "text-emerald-400" : "text-gray-500"}>
          {connected ? "● 연결됨" : "○ 연결 중..."}
        </span>
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
