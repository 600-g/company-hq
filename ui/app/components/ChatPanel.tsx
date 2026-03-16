"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Team } from "../config/teams";

interface Message {
  type: "user" | "ai";
  content: string;
}

interface Props {
  team: Team;
  onClose: () => void;
  onWorkingChange: (working: boolean) => void;
  inline?: boolean; // true면 사이드 패널에 임베드
}

export default function ChatPanel({ team, onClose, onWorkingChange, inline }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws/chat/${team.id}`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => { setConnected(false); setStreaming(false); onWorkingChange(false); };
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "user") setMessages(prev => [...prev, { type: "user", content: data.content }]);
      else if (data.type === "ai_start") { setStreaming(true); onWorkingChange(true); setMessages(prev => [...prev, { type: "ai", content: "" }]); }
      else if (data.type === "ai_chunk") {
        setMessages(prev => {
          const u = [...prev]; const l = u[u.length - 1];
          if (l?.type === "ai") u[u.length - 1] = { ...l, content: l.content + data.content };
          return u;
        });
      }
      else if (data.type === "ai_end") { setStreaming(false); onWorkingChange(false); }
    };
    inputRef.current?.focus();
    return () => { ws.close(); };
  }, [team.id, onWorkingChange]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const send = () => {
    if (!input.trim() || !wsRef.current || streaming) return;
    wsRef.current.send(JSON.stringify({ prompt: input.trim() }));
    setInput("");
  };

  // ── 인라인 모드 (우측 패널 임베드) ──
  if (inline) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {/* 상태 */}
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400" : "bg-red-500"}`} />
          <span className="text-[9px] text-gray-500">{connected ? "연결됨" : "연결중..."}</span>
          <button onClick={onClose} className="ml-auto text-[9px] text-gray-500 hover:text-gray-300">✕ 닫기</button>
        </div>

        {/* 메시지 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <p className="text-[10px] text-gray-600">명령을 입력하세요</p>
              <p className="text-[8px] text-gray-700 mt-1">Claude Code CLI로 처리됩니다</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`text-[11px] px-2 py-1.5 ${
              msg.type === "user"
                ? "bg-blue-600/20 text-blue-200 border-l-2 border-blue-500"
                : "bg-[#1a2a1a] text-green-300 border-l-2 border-green-600 font-mono text-[10px]"
            }`}>
              {msg.content}
              {msg.type === "ai" && streaming && i === messages.length - 1 && (
                <span className="inline-block w-1.5 h-3 bg-green-400 ml-0.5 animate-pulse" />
              )}
            </div>
          ))}
        </div>

        {/* 입력 */}
        <div className="mt-2 flex gap-1.5">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
            placeholder={streaming ? "처리중..." : "명령 입력..."}
            disabled={streaming}
            className="flex-1 bg-[#1a1a2e] border border-[#3a3a5a] text-white px-2 py-1.5 text-[11px] rounded
                       placeholder-gray-600 focus:outline-none focus:border-yellow-400/50 disabled:opacity-40"
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            className="bg-yellow-500 text-black px-3 py-1.5 text-[10px] font-bold rounded
                       hover:bg-yellow-400 disabled:opacity-30 transition-colors"
          >
            전송
          </button>
        </div>
      </div>
    );
  }

  // ── 모달 모드 (기존) ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl h-[80vh] bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-[#1a1a3a] border-b border-[#2a2a5a]">
          <div className="flex items-center gap-3">
            <span className="text-xl">{team.emoji}</span>
            <span className="text-sm font-bold text-white">{team.name}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] px-3 py-2 text-sm rounded ${
                msg.type === "user" ? "bg-blue-600/80 text-white" : "bg-[#1a2a1a] text-green-300 font-mono text-xs"
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-[#2a2a5a] p-3 flex gap-2">
          <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
            placeholder="명령 입력..." disabled={streaming}
            className="flex-1 bg-[#1a1a2e] border border-[#3a3a5a] text-white px-3 py-2 text-sm rounded" />
          <button onClick={send} disabled={streaming || !input.trim()}
            className="bg-yellow-500 text-black px-4 py-2 text-sm font-bold rounded">전송</button>
        </div>
      </div>
    </div>
  );
}
