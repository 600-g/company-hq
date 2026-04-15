"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Team } from "../config/teams";

export interface Message {
  type: "user" | "ai";
  content: string;
  cancelled?: boolean;
  timestamp?: string;
}

interface Props {
  team: Team;
  onClose: () => void;
  onWorkingChange: (working: boolean) => void;
  inline?: boolean;
  messages: Message[];
  onMessages: (msgs: Message[]) => void;
  onOpenTradingDash?: () => void;
  onAiEnd?: (content: string) => void;
}

// ── 마크다운 렌더러 ────────────────────────────────────
function processInline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <code key={i} className="bg-[#2a2a1a] text-yellow-200 px-1 rounded text-[11px] font-mono">{part.slice(1, -1)}</code>;
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
            <code className="text-green-200 text-[11px] font-mono">{codeLines.join("\n")}</code>
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

// ── API/WebSocket URL ────────────────────────────────
function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h.startsWith("192.168.");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

function getWsUrl(teamId: string): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h.startsWith("192.168.");
  const base = isLocal ? `ws://${h}:8000` : `wss://api.600g.net`;
  return `${base}/ws/chat/${teamId}`;
}

export function getWsStorageKey() { return "hq-ws-base-url"; }

// ─────────────────────────────────────────────────────

export default function ChatPanel({ team, onClose, onWorkingChange, inline, messages: initMessages, onMessages, onOpenTradingDash, onAiEnd }: Props) {
  const [messages, setMessagesInternal] = useState<Message[]>(initMessages);
  const setMessages = useCallback((updater: Message[] | ((prev: Message[]) => Message[])) => {
    setMessagesInternal(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      onMessages(next);
      return next;
    });
  }, [onMessages]);
  const draftKey = `hq-draft-${team.id}`;
  const [input, setInputRaw] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(draftKey) || "";
  });
  const setInput = useCallback((v: string) => {
    setInputRaw(v);
    try { localStorage.setItem(draftKey, v); } catch {}
  }, [draftKey]);
  const [streaming, setStreaming] = useState(false);
  const [connected, setConnected] = useState(false);
  const [toolStatus, setToolStatus] = useState<string>("");
  // ── 진행 추적 ──
  const [toolLog, setToolLog] = useState<{time: string; text: string}[]>([]);  // 이번 작업 툴 타임라인
  const [elapsed, setElapsed] = useState(0);                      // 경과 초
  const [lastDone, setLastDone] = useState<{ sec: number; tools: number } | null>(null); // 완료 정보
  const [showToolLog, setShowToolLog] = useState(false);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  // 콜백 ref — useEffect deps에 넣지 않아도 항상 최신 참조
  const onWorkingChangeRef = useRef(onWorkingChange);
  onWorkingChangeRef.current = onWorkingChange;

  const [showScrollBtn, setShowScrollBtn] = useState(false);
  // history_sync 수신 시 무조건 맨 아래로 스크롤하기 위한 플래그
  const forceScrollRef = useRef(false);
  const scrollToBottom = useCallback((smooth?: boolean) => {
    if (scrollRef.current) {
      if (smooth) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      } else {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, []);
  // 스크롤 위치 감지 → "최신 메시지로" 버튼 표시
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100);
  }, []);

  // 브라우저 알림
  const notify = useCallback((title: string, body: string) => {
    if (document.hasFocus()) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/favicon.ico" });
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then(p => {
        if (p === "granted") new Notification(title, { body });
      });
    }
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let dead = false;
    let retryDelay = 1000; // 1초부터 시작, 최대 15초

    const connect = () => {
      if (dead) return;
      const wsUrl = getWsUrl(team.id);
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retryDelay = 1000;
        // 재연결 시 streaming 상태 리셋 (이전 응답 끊긴 경우)
        setStreaming(prev => {
          if (prev) {
            // 끊긴 스트리밍 → 완료 처리
            if (timerRef.current) clearInterval(timerRef.current);
            onWorkingChangeRef.current(false);
          }
          return false;
        });
        Notification.requestPermission();
      };

      ws.onclose = () => {
        setConnected(false);
        setStreaming(false);
        onWorkingChangeRef.current(false);
        wsRef.current = null;
        // 자동 재연결
        if (!dead) {
          reconnectTimer = setTimeout(() => {
            connect();
            retryDelay = Math.min(retryDelay * 1.5, 15000);
          }, retryDelay);
        }
      };

      ws.onerror = () => {
        // onclose가 이어서 호출됨
      };

      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === "history_sync") {
          const serverMsgs: Message[] = data.messages || [];
          if (serverMsgs.length > 0) {
            forceScrollRef.current = true;  // 동기화 후 무조건 맨 아래로
            setMessages(serverMsgs);
          }
          return;
        }
        if (data.type === "history_cleared") {
          setMessages([]);
          return;
        }
        if (data.type === "user") {
          setMessages(prev => [...prev, { type: "user", content: data.content, timestamp: new Date().toLocaleString("ko-KR", { hour12: false }) }]);
        } else if (data.type === "status") {
          setToolStatus(data.content);
          setToolLog(prev => [...prev, { time: new Date().toLocaleTimeString("ko-KR", { hour12: false }), text: data.content }]);
        } else if (data.type === "ai_start") {
          setStreaming(true);
          setToolStatus("");
          setToolLog([]);
          setLastDone(null);
          setElapsed(0);
          startTimeRef.current = Date.now();
          timerRef.current = setInterval(() => {
            setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
          }, 1000);
          onWorkingChangeRef.current(true);
          setMessages(prev => [...prev, { type: "ai", content: "", timestamp: new Date().toLocaleString("ko-KR", { hour12: false }) }]);
        } else if (data.type === "ai_chunk") {
          setMessages(prev => {
            const u = [...prev]; const l = u[u.length - 1];
            if (l?.type === "ai") u[u.length - 1] = { ...l, content: l.content + data.content };
            return u;
          });
        } else if (data.type === "ai_end") {
          if (timerRef.current) clearInterval(timerRef.current);
          const sec = Math.floor((Date.now() - startTimeRef.current) / 1000);
          setStreaming(false);
          setToolStatus("");
          setLastDone(prev => ({ sec, tools: (prev?.tools ?? 0) + toolLog.length }));
          onWorkingChangeRef.current(false);
          // 결과 미리보기 콜백 (부모가 bubble 등 표시)
          try { onAiEnd?.(data.content ?? ""); } catch {}
          // 큐에 다음 메시지가 있으면 자동 전송
          setQueued(prev => {
            if (prev.length > 0) {
              const next = prev[0];
              setTimeout(() => {
                if (wsRef.current) {
                  wsRef.current.send(JSON.stringify({ prompt: next }));
                }
              }, 500);
              return prev.slice(1);
            }
            return prev;
          });
          // 빈 응답이면 완료 메시지 추가
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.type === "ai" && !last.content.trim()) {
              const u = [...prev];
              u[u.length - 1] = { ...last, content: "✅ 작업 완료 (응답 없음)" };
              return u;
            }
            return prev;
          });
          notify(`${team.emoji} ${team.name} 완료`, `작업 완료 (${sec}초)`);
        }
      };
    };

    connect();
    inputRef.current?.focus();

    return () => {
      dead = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (timerRef.current) clearInterval(timerRef.current);
      ws?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onWorkingChange/notify는 ref로 안정화
  }, [team.id]);

  // 메시지 변경 시 맨 아래로 (위로 올려놨으면 유지) + 스크롤 버튼 상태 갱신
  useEffect(() => {
    if (!scrollRef.current) return;
    // history_sync 후 강제 스크롤 (서버 재시작/재연결 시 항상 맨 아래로)
    if (forceScrollRef.current) {
      forceScrollRef.current = false;
      // DOM 렌더링 대기 후 스크롤 (여러 번 시도하여 확실하게)
      requestAnimationFrame(() => {
        scrollToBottom();
        setTimeout(() => { scrollToBottom(); setShowScrollBtn(false); }, 100);
      });
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
    // 처음 로드이거나 맨 아래 근처면 자동 스크롤
    if (isNearBottom || messages.length <= 1) {
      setTimeout(() => scrollToBottom(), 50);
    }
    // 스크롤 버튼 표시 여부도 갱신 (초기 로드 시 handleScroll이 안 불리므로)
    setTimeout(() => {
      if (!scrollRef.current) return;
      const el = scrollRef.current;
      setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
    }, 100);
  }, [messages, scrollToBottom]);

  const [queued, setQueued] = useState<string[]>([]);
  const [pendingImages, setPendingImages] = useState<{ file: File; path?: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadImage = async (file: File): Promise<string | null> => {
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${getApiBase()}/api/upload/image`, { method: "POST", body: form });
      const data = await res.json();
      return data.ok ? data.path : null;
    } catch { return null; }
  };

  const sendDirect = useCallback((msg: string, imagePaths?: string[]) => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({ prompt: msg, images: imagePaths?.length ? imagePaths : undefined }));
  }, []);

  const send = async () => {
    if ((!input.trim() && pendingImages.length === 0) || !wsRef.current) return;
    const msg = input.trim();

    // streaming 중이면 큐에만 넣고 입력 초기화
    if (streaming) {
      if (msg) setQueued(prev => [...prev, msg]);
      setInput("");
      setPendingImages([]);
      return;
    }

    // 이미지 업로드 후 경로 수집
    const imagePaths: string[] = [];
    for (const img of pendingImages) {
      const path = img.path || await uploadImage(img.file);
      if (path) imagePaths.push(path);
    }

    sendDirect(msg, imagePaths);
    setInput("");
    setPendingImages([]);
  };

  // 작업 취소 — 진행중 패널에서 호출 (서버에 cancel 전송 + 취소 마킹 + 입력창 복구)
  const cancelWork = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ action: "cancel" }));
    setStreaming(false);
    if (timerRef.current) clearInterval(timerRef.current);
    onWorkingChangeRef.current(false);
    // 마지막 유저 메시지에 취소 표시 + 입력창에 복구, AI 응답(빈 청크) 제거
    setMessages(prev => {
      const lastUserIdx = prev.findLastIndex(m => m.type === "user");
      if (lastUserIdx === -1) return prev;
      const restored = prev[lastUserIdx].content;
      setInput(restored);
      const updated = prev.slice(0, lastUserIdx + 1);  // user 메시지까지만 유지
      updated[lastUserIdx] = { ...updated[lastUserIdx], cancelled: true };
      return updated;
    });
  }, [setMessages]);

  // ── 경과시간 포맷 ──
  const fmtTime = (s: number) => s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`;

  // ── 인라인 모드 ──────────────────────────────────────
  if (inline) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {/* 상태 */}
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400" : "bg-red-500 animate-pulse"}`} />
          <span className={`text-[9px] ${connected ? "text-gray-500" : "text-red-400"}`}>{connected ? "연결됨" : "재연결중..."}</span>
          {team.id === "trading-bot" && onOpenTradingDash && (
            <button
              onClick={onOpenTradingDash}
              className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-300 border border-yellow-500/40 hover:bg-yellow-500/25 transition-colors"
              title="매매 분석 대시보드 열기"
            >📊 매매 분석</button>
          )}
          <button
            onClick={() => { setMessages([]); onMessages([]); wsRef.current?.send(JSON.stringify({ action: "clear_history" })); }}
            className={`text-[9px] text-gray-500 hover:text-gray-300 ${team.id === "trading-bot" && onOpenTradingDash ? "" : "ml-auto"}`}
          >🗑 대화 지우기</button>
        </div>

        {/* 메시지 — 주의: absolute/sticky 금지 (lessons.md 참고), flex-1로 높이 확보 */}
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto space-y-2 min-h-0 select-text overscroll-contain" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}>
          {messages.length === 0 && (
            <div className="py-6 text-center">
              <p className="text-[10px] text-gray-600">명령을 입력하거나 아래 바로가기를 사용하세요</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`group relative text-sm px-2.5 py-2 rounded select-text cursor-text ${
              msg.type === "user"
                ? "bg-blue-600/15 text-blue-200 border-l-2 border-blue-500"
                : "bg-[#1a2a1a] text-green-300 border-l-2 border-green-600"
            }`}>
              {/* 타임스탬프 */}
              {msg.timestamp && (
                <div className="text-[8px] text-gray-600 font-mono mb-0.5">{msg.timestamp}</div>
              )}
              {msg.type === "ai"
                ? <div className="font-mono text-xs"><MarkdownMessage content={msg.content} /></div>
                : <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              }
              {msg.type === "ai" && streaming && i === messages.length - 1 && (
                <span className="inline-block w-1.5 h-3 bg-green-400 ml-0.5 animate-pulse" />
              )}
              <div className="flex items-center justify-between mt-0.5">
                {msg.type === "user" && !streaming && (
                  <span className="text-[8px]">
                    <span className="text-blue-400/50">✓ 읽음</span>
                    {msg.cancelled && <span className="text-red-400/70 ml-1">· ✕ 취소됨</span>}
                  </span>
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
          {/* 터미널 작업 로그 */}
          {streaming && (
            <div className="rounded overflow-hidden" style={{ background: '#080818', border: '1px solid #1a1a3a' }}>
              {/* 헤더 */}
              <div className="flex items-center justify-between px-2 py-1.5" style={{ borderBottom: '1px solid #1a1a3a' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#f5c842] font-mono">▶ 작업중</span>
                  <span className="text-[9px] text-gray-600 font-mono">{fmtTime(elapsed)}</span>
                  <span className="text-[8px] text-gray-700 font-mono">{toolLog.length}개 실행</span>
                </div>
                <button onClick={cancelWork}
                  className="bg-red-500/90 hover:bg-red-500 text-white text-[9px] font-bold px-2.5 py-0.5 rounded transition-colors">
                  ■ 취소
                </button>
              </div>
              {/* 로그 영역 */}
              <div className="max-h-[160px] overflow-y-auto px-2 py-1.5 space-y-0.5 font-mono" style={{ fontSize: '11px' }}>
                {toolLog.map((entry, i) => (
                  <div key={i} className="flex gap-2 leading-tight">
                    <span className="text-gray-700 shrink-0">{entry.time}</span>
                    <span className="text-[#50d070]">✓</span>
                    <span className="text-gray-400 truncate">{entry.text}</span>
                  </div>
                ))}
                {/* 현재 진행 중 (커서 깜빡임) */}
                {toolStatus && (
                  <div className="flex gap-2 leading-tight">
                    <span className="text-gray-700 shrink-0">{new Date().toLocaleTimeString("ko-KR", { hour12: false })}</span>
                    <span className="text-[#f5c842]">▶</span>
                    <span className="text-[#f5c842]">{toolStatus}</span>
                    <span className="text-[#f5c842] animate-pulse">▌</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 완료 배지 */}
          {!streaming && lastDone && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded font-mono" style={{ background: '#080818', border: '1px solid #1a1a3a', fontSize: '11px' }}>
              <span className="text-[#50d070]">✓ 완료</span>
              <span className="text-gray-600 ml-auto">{fmtTime(lastDone.sec)}</span>
              {lastDone.tools > 0 && (
                <span className="text-gray-700">{lastDone.tools}개 도구</span>
              )}
            </div>
          )}
          </div>

        {/* 최신 메시지로 이동 — 일반 flex 아이템 (CSS 포지셔닝 트릭 금지) */}
        {showScrollBtn && (
          <div className="flex justify-center py-0.5 shrink-0">
            <button onClick={() => scrollToBottom(true)}
              className="bg-[#1a1a3a] border border-[#3a3a5a] text-yellow-400 text-[10px] px-3 py-0.5 rounded-full shadow-lg hover:bg-[#2a2a4a] transition-colors flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
              최신 메시지 ↓
            </button>
          </div>
        )}

        {/* 바로가기 */}
        <div className="mt-1 flex flex-wrap gap-1 shrink-0">
          {[
            { label: "📋 현황 요약", cmd: "지금 프로젝트 상태 간단히 요약해줘" },
            { label: "🐛 에러 확인", cmd: "최근 에러 로그 확인해줘" },
            { label: "🔨 빌드 & 배포", cmd: "빌드하고 배포해줘" },
            { label: "🔄 최근 변경", cmd: "최근 변경사항 알려줘" },
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

        {/* 대기중 메시지 */}
        {queued.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {queued.map((q, i) => (
              <div key={i} className="text-[9px] text-yellow-400/60 bg-yellow-500/5 border border-yellow-500/10 rounded px-2 py-0.5 truncate">
                ⏳ 대기{queued.length > 1 ? ` (${i + 1}/${queued.length})` : ""}: {q.slice(0, 40)}{q.length > 40 ? "..." : ""}
              </div>
            ))}
          </div>
        )}

        {/* 첨부 이미지 미리보기 */}
        {pendingImages.length > 0 && (
          <div className="mt-1 flex gap-1 flex-wrap">
            {pendingImages.map((img, i) => (
              <button key={i} onClick={() => setPendingImages(prev => prev.filter((_, j) => j !== i))}
                className="relative w-12 h-12 rounded border border-[#3a3a5a] overflow-hidden active:opacity-50 transition-opacity"
                title="탭하여 삭제">
                <img src={URL.createObjectURL(img.file)} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 입력 (작업 중에도 입력 가능, Shift+Enter=줄바꿈) */}
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            setPendingImages(prev => [...prev, ...files.map(f => ({ file: f }))]);
            e.target.value = "";
          }}
        />
        <div className="mt-1.5 flex gap-1.5 items-end">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-gray-500 hover:text-yellow-400 px-1.5 py-1.5 text-sm transition-colors shrink-0"
            title="이미지 첨부"
          ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isMobile && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            onPaste={(e) => {
              const items = Array.from(e.clipboardData?.items || []);
              const imageItems = items.filter(item => item.type.startsWith("image/"));
              if (imageItems.length > 0) {
                e.preventDefault();
                imageItems.forEach(item => {
                  const file = item.getAsFile();
                  if (file) setPendingImages(prev => [...prev, { file }]);
                });
              }
            }}
            placeholder={streaming ? "작업중... (추가 입력 가능)" : isMobile ? "명령 입력... (전송 버튼으로 보내기)" : "명령 입력... (Ctrl+V 이미지 붙여넣기)"}
            rows={input.includes("\n") ? Math.min(input.split("\n").length, 4) : 1}
            className="flex-1 bg-[#1a1a2e] border border-[#3a3a5a] text-white px-2 py-1.5 text-xs rounded
                       placeholder-gray-600 focus:outline-none focus:border-yellow-400/50 resize-none"
          />
          <button
            onClick={send}
            disabled={!input.trim() && pendingImages.length === 0}
            className="bg-yellow-500 text-black px-3 py-1.5 text-[10px] font-bold rounded
                       hover:bg-yellow-400 disabled:opacity-30 transition-colors shrink-0"
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
        <div className="flex-1 min-h-0 flex flex-col">
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
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
                {msg.type === "user" && msg.cancelled && (
                  <div className="text-[9px] text-red-300/70 mt-0.5">✕ 취소됨</div>
                )}
              </div>
            </div>
          ))}
          {/* 작업 진행 패널 + 취소 (모달) */}
          {streaming && (
            <div className="bg-[#0f1a0f] border border-green-900/40 rounded p-3 mx-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-xs text-green-400/70">작업중</span>
                  <span className="text-xs text-gray-600 font-mono">{fmtTime(elapsed)}</span>
                  {toolStatus && <span className="text-[10px] text-yellow-300/80 truncate max-w-[180px]">· {toolStatus}</span>}
                </div>
                <button onClick={cancelWork}
                  className="bg-red-500/90 hover:bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded transition-colors">
                  ■ 취소
                </button>
              </div>
            </div>
          )}
          </div>
          {showScrollBtn && (
            <div className="flex justify-center py-1 shrink-0 border-t border-[#2a2a5a]/50">
              <button onClick={() => scrollToBottom(true)}
                className="bg-[#1a1a3a] border border-[#3a3a5a] text-yellow-400 text-[11px] px-4 py-1 rounded-full shadow-lg hover:bg-[#2a2a4a] transition-colors flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
                최신 메시지 ↓
              </button>
            </div>
          )}
        </div>
        <div className="border-t border-[#2a2a5a] p-3 flex gap-2 items-end">
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !isMobile && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            placeholder={streaming ? "작업중... (추가 입력 가능)" : "명령 입력..."}
            rows={input.includes("\n") ? Math.min(input.split("\n").length, 4) : 1}
            className="flex-1 bg-[#1a1a2e] border border-[#3a3a5a] text-white px-3 py-2 text-sm rounded
                       focus:outline-none focus:border-yellow-400/50 resize-none" />
          <button onClick={send} disabled={!input.trim()}
            className="bg-yellow-500 text-black px-4 py-2 text-sm font-bold rounded hover:bg-yellow-400 disabled:opacity-30 shrink-0">
            전송
          </button>
        </div>
      </div>
    </div>
  );
}
