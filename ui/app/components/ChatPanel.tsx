"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Team } from "../config/teams";

export interface Message {
  type: "user" | "ai";
  content: string;
}

interface Props {
  team: Team;
  onClose: () => void;
  onWorkingChange: (working: boolean) => void;
  inline?: boolean;
  messages: Message[];
  onMessages: (msgs: Message[]) => void;
}

// ── 마크다운 렌더러 ────────────────────────────────────
function processInline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <code key={i} className="bg-[#2a2a1a] text-yellow-200 px-1 rounded text-[9px] font-mono">{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={i} className="text-gray-300 italic">{part.slice(1, -1)}</em>;
    return part;
  });
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let codeLines: string[] = [];
  let inCode = false;
  let codeLang = "";

  lines.forEach((line, i) => {
    if (line.startsWith("```")) {
      if (inCode) {
        nodes.push(
          <pre key={i} className="bg-[#0a0a1a] border border-[#2a2a3a] rounded p-2 my-1 overflow-x-auto">
            <code className="text-green-200 text-[9px] font-mono">{codeLines.join("\n")}</code>
          </pre>
        );
        codeLines = [];
        inCode = false;
        codeLang = "";
      } else {
        inCode = true;
        codeLang = line.slice(3).trim();
      }
      return;
    }
    if (inCode) { codeLines.push(line); return; }

    if (line.startsWith("### "))
      return nodes.push(<div key={i} className="font-bold text-yellow-300 text-[11px] mt-2 mb-0.5">{line.slice(4)}</div>);
    if (line.startsWith("## "))
      return nodes.push(<div key={i} className="font-bold text-yellow-400 text-[12px] mt-2 mb-0.5">{line.slice(3)}</div>);
    if (line.startsWith("# "))
      return nodes.push(<div key={i} className="font-bold text-yellow-500 text-[13px] mt-2 mb-1">{line.slice(2)}</div>);

    if (line.startsWith("- ") || line.startsWith("* "))
      return nodes.push(<div key={i} className="flex gap-1.5 pl-1"><span className="text-gray-500 shrink-0">•</span><span>{processInline(line.slice(2))}</span></div>);

    const numMatch = line.match(/^(\d+)\.\s/);
    if (numMatch)
      return nodes.push(<div key={i} className="flex gap-1.5 pl-1"><span className="text-gray-500 shrink-0">{numMatch[1]}.</span><span>{processInline(line.slice(numMatch[0].length))}</span></div>);

    if (line.startsWith("> "))
      return nodes.push(<div key={i} className="border-l-2 border-gray-600 pl-2 text-gray-400 italic my-0.5">{processInline(line.slice(2))}</div>);

    if (!line.trim())
      return nodes.push(<div key={i} className="h-1.5" />);

    nodes.push(<div key={i}>{processInline(line)}</div>);
  });

  return <div className="space-y-0.5">{nodes}</div>;
}

// ── WebSocket URL ─────────────────────────────────────
function getWsUrl(teamId: string): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h.startsWith("192.168.");
  const base = isLocal ? `ws://${h}:8000` : `wss://600g.net`;
  return `${base}/ws/chat/${teamId}`;
}

export function getWsStorageKey() { return "hq-ws-base-url"; }

// ─────────────────────────────────────────────────────

export default function ChatPanel({ team, onClose, onWorkingChange, inline, messages: initMessages, onMessages }: Props) {
  const [messages, setMessagesInternal] = useState<Message[]>(initMessages);
  const setMessages = useCallback((updater: Message[] | ((prev: Message[]) => Message[])) => {
    setMessagesInternal(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      onMessages(next);
      return next;
    });
  }, [onMessages]);
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
    const wsUrl = getWsUrl(team.id);
    const ws = new WebSocket(wsUrl);
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

  // ── 인라인 모드 ──────────────────────────────────────
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
            <div className="py-6 text-center">
              <p className="text-[10px] text-gray-600">명령을 입력하거나 아래 바로가기를 사용하세요</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`group relative text-[11px] px-2 py-1.5 rounded ${
              msg.type === "user"
                ? "bg-blue-600/15 text-blue-200 border-l-2 border-blue-500"
                : "bg-[#1a2a1a] text-green-300 border-l-2 border-green-600"
            }`}>
              {msg.type === "ai"
                ? <div className="font-mono text-[10px]"><MarkdownMessage content={msg.content} /></div>
                : <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              }
              {msg.type === "ai" && streaming && i === messages.length - 1 && (
                <span className="inline-block w-1.5 h-3 bg-green-400 ml-0.5 animate-pulse" />
              )}
              <div className="flex items-center justify-between mt-0.5">
                {msg.type === "user" && !streaming && (
                  <span className="text-[8px] text-blue-400/50">✓ 읽음</span>
                )}
                {msg.type === "ai" && !streaming && <span />}
                {msg.content && !streaming && (
                  <button
                    onClick={() => navigator.clipboard.writeText(msg.content)}
                    className="opacity-0 group-hover:opacity-100 text-[8px] px-1.5 py-0.5
                               bg-[#2a2a4a] text-gray-400 rounded hover:text-white transition-opacity"
                  >
                    복사
                  </button>
                )}
              </div>
            </div>
          ))}
          {streaming && (
            <div className="flex items-center gap-2 px-2 py-2 text-[10px] text-gray-500">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span>생각중...</span>
            </div>
          )}
        </div>

        {/* 바로가기 */}
        <div className="mt-1 flex flex-wrap gap-1 shrink-0">
          {[
            { label: "📂 파일 목록", cmd: "ls -la" },
            { label: "🔄 Git 상태", cmd: "git status" },
            { label: "📝 Git 로그", cmd: "git log --oneline -5" },
            { label: "💾 커밋", cmd: "git add -A && git commit -m 'update'" },
            { label: "🚀 푸시", cmd: "git push" },
            { label: "🔨 빌드", cmd: "npm run build" },
            { label: "🐛 에러 로그", cmd: "tail -20 *.log" },
            { label: "💻 프로세스", cmd: "ps aux | head -10" },
            { label: "📦 설치", cmd: "npm install" },
            { label: "📊 디스크", cmd: "df -h" },
          ].map(({ label, cmd }) => (
            <button
              key={cmd}
              onClick={() => {
                if (!wsRef.current || streaming) return;
                wsRef.current.send(JSON.stringify({ prompt: cmd }));
              }}
              disabled={streaming}
              className="text-[9px] px-2 py-1 bg-[#1a1a2e] border border-[#2a2a4a] text-gray-500
                         rounded hover:bg-[#2a2a3a] hover:text-gray-300 active:bg-[#3a3a4a]
                         disabled:opacity-30 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>

        {/* 입력 */}
        <div className="mt-1.5 flex gap-1.5">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
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

  // ── 모달 모드 ────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl h-[80vh] bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-[#1a1a3a] border-b border-[#2a2a5a]">
          <div className="flex items-center gap-3">
            <span className="text-xl">{team.emoji}</span>
            <span className="text-sm font-bold text-white">{team.name}</span>
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400" : "bg-red-500"}`} />
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded ${
                msg.type === "user"
                  ? "bg-blue-600/80 text-white text-sm"
                  : "bg-[#1a2a1a] text-green-300 font-mono text-xs"
              }`}>
                {msg.type === "ai"
                  ? <MarkdownMessage content={msg.content} />
                  : msg.content
                }
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-[#2a2a5a] p-3 flex gap-2">
          <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            placeholder="명령 입력..." disabled={streaming}
            className="flex-1 bg-[#1a1a2e] border border-[#3a3a5a] text-white px-3 py-2 text-sm rounded
                       focus:outline-none focus:border-yellow-400/50" />
          <button onClick={send} disabled={streaming || !input.trim()}
            className="bg-yellow-500 text-black px-4 py-2 text-sm font-bold rounded hover:bg-yellow-400 disabled:opacity-30">
            전송
          </button>
        </div>
      </div>
    </div>
  );
}
