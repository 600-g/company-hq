"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { teams as defaultTeamList, Team } from "../config/teams";
import ChatPanel, { Message, getWsStorageKey } from "./ChatPanel";
import ChatWindow from "./ChatWindow";
import ServerDashboard from "./ServerDashboard";
import WeatherBoard from "./WeatherBoard";
import type { OfficeGameHandle } from "../game/OfficeGame";
import DevTerminal from "./DevTerminal";

// ── CPO 주도 스마트 디스패치 ────────────────────────────
type DispatchStatus = "pending" | "sending" | "working" | "done" | "skipped" | "error";
type DispatchPhase = "idle" | "routing" | "executing" | "summarizing" | "done";
interface DispatchEntry {
  teamId: string; emoji: string; name: string;
  text: string; status: DispatchStatus; routed: boolean;
  tools: string[];
}

interface DispatchMessage {
  role: "user" | "agent";
  text: string;
  teamId?: string;
  emoji?: string;
  name?: string;
  tools?: string[];
  status?: DispatchStatus;
}

const DISPATCH_HISTORY_KEY = "hq-dispatch-history";
function loadDispatchHistory(): DispatchMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DISPATCH_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveDispatchHistory(msgs: DispatchMessage[]) {
  try {
    // 최근 100개만 유지
    const trimmed = msgs.slice(-100);
    localStorage.setItem(DISPATCH_HISTORY_KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

function DispatchChat({ teams, onOpenChat }: { teams: Team[]; onOpenChat?: (teamId: string) => void }) {
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<DispatchEntry[]>([]);
  const [messages, setMessages] = useState<DispatchMessage[]>(loadDispatchHistory);
  const [sending, setSending] = useState(false);
  const [phase, setPhase] = useState<DispatchPhase>("idle");
  const [summaryText, setSummaryText] = useState("");
  // 멘션 자동완성
  const [mentionQuery, setMentionQuery] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionIdx, setMentionIdx] = useState(0);
  const mentionTeams = teams.filter(t =>
    t.id !== "server-monitor" &&
    (mentionQuery === "" || t.name.includes(mentionQuery) || t.id.includes(mentionQuery.toLowerCase()))
  ).slice(0, 8);
  const selectMention = (t: Team) => {
    const atIdx = input.lastIndexOf("@");
    setInput(input.slice(0, atIdx) + `@${t.name} `);
    setShowMentions(false);
    setMentionIdx(0);
  };

  // 메시지 변경 시 localStorage 동기화
  useEffect(() => {
    if (messages.length > 0) saveDispatchHistory(messages);
  }, [messages]);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pendingImages, setPendingImages] = useState<{ file: File; path?: string }[]>([]);
  const dispatchFileRef = useRef<HTMLInputElement>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const [canUndo, setCanUndo] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const uploadImage = async (file: File): Promise<string | null> => {
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${getApiBase()}/api/upload/image`, { method: "POST", body: form });
      const data = await res.json();
      return data.ok ? data.path : null;
    } catch { return null; }
  };

  const dispatch = async () => {
    if ((!input.trim() && pendingImages.length === 0) || sending) return;
    const msg = input.trim();
    setInput("");
    setSending(true);
    setPhase("routing");
    setSummaryText("");

    // 이미지 업로드
    const imagePaths: string[] = [];
    for (const img of pendingImages) {
      const path = img.path || await uploadImage(img.file);
      if (path) imagePaths.push(path);
    }
    setPendingImages([]);

    // 5초 취소 타이머
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setCanUndo(true);
    undoTimerRef.current = setTimeout(() => setCanUndo(false), 5000);

    const displayMsg = msg + (imagePaths.length > 0 ? ` 📷${imagePaths.length}` : "");
    setMessages(prev => [...prev, { role: "user", text: displayMsg }]);

    // CPO 주도 SSE 디스패치
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/dispatch/smart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
        signal: abort.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("스트림 리더 없음");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.phase === "routing") {
              setPhase("routing");
            } else if (data.phase === "routed") {
              // CPO가 팀 필터링 완료 → 엔트리 생성
              const allTeams = teams.filter(t => t.id !== "server-monitor" && t.id !== "cpo-claude");
              const routedIds: string[] = data.teams;
              const newEntries: DispatchEntry[] = allTeams.map(t => ({
                teamId: t.id, emoji: t.emoji, name: t.name, text: "",
                status: routedIds.includes(t.id) ? "pending" : "skipped",
                routed: routedIds.includes(t.id), tools: [],
              }));
              setEntries(newEntries);
              setPhase("executing");
            } else if (data.phase === "team_done") {
              // 팀 완료 알림 → 상태 업데이트
              const doneTeams: string[] = data.teams;
              setEntries(prev => prev.map(e =>
                doneTeams.includes(e.teamId)
                  ? { ...e, status: "done" }
                  : e.routed && !doneTeams.includes(e.teamId)
                    ? { ...e, status: "working" }
                    : e
              ));
            } else if (data.phase === "summarizing") {
              setPhase("summarizing");
            } else if (data.phase === "summary_chunk") {
              setSummaryText(prev => prev + data.content);
            } else if (data.phase === "done") {
              setPhase("done");
              // 팀별 결과를 엔트리에 반영
              const teamResults: Record<string, { status: string; result: string }> = data.team_results || {};
              setEntries(prev => prev.map(e => {
                const r = teamResults[e.teamId];
                return r ? { ...e, text: r.result, status: r.status as DispatchStatus } : e;
              }));
              // CPO 통합 보고를 히스토리에 추가 (효율 메타 포함)
              const meta = data.meta;
              const metaLine = meta
                ? `\n\n───\n⚡ haiku 라우팅 → ${meta.routed_count}/${meta.total_teams}팀 실행 → ${meta.summary_model === "opus" ? "opus 통합" : "직통 전달"}`
                : "";
              setMessages(prev => [...prev, {
                role: "agent", text: data.summary + metaLine,
                teamId: "cpo-claude", emoji: "🧠", name: "CPO 통합보고",
              }]);
              setSending(false);
              // 지연 후 엔트리 정리
              setTimeout(() => setEntries([]), 3000);
            } else if (data.phase === "error") {
              setMessages(prev => [...prev, {
                role: "agent", text: `❌ ${data.error}`,
                teamId: "cpo-claude", emoji: "🧠", name: "CPO",
              }]);
              setSending(false);
              setPhase("idle");
              setEntries([]);
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        // 자동 재시도: 서버 reload 중일 수 있으므로 3초 후 헬스체크 → 재시도
        const apiBase = getApiBase();
        const retryCheck = async () => {
          try {
            const health = await fetch(`${apiBase}/api/standby`);
            if (health.ok) return true;
          } catch { /* */ }
          return false;
        };
        setMessages(prev => [...prev, {
          role: "agent", text: `⚠️ 연결 실패 — 서버 복구 확인 중...`,
          teamId: "cpo-claude", emoji: "🧠", name: "CPO",
        }]);
        // 3초 후 헬스체크
        setTimeout(async () => {
          const alive = await retryCheck();
          if (alive) {
            setMessages(prev => prev.map((m, i) =>
              i === prev.length - 1 && m.text.includes("복구 확인 중")
                ? { ...m, text: "✅ 서버 복구 완료 — 다시 시도해주세요." }
                : m
            ));
          } else {
            setMessages(prev => prev.map((m, i) =>
              i === prev.length - 1 && m.text.includes("복구 확인 중")
                ? { ...m, text: `❌ 연결 실패: ${e.message}. 서버 상태를 확인해주세요.` }
                : m
            ));
          }
        }, 3000);
      }
      setSending(false);
      setPhase("idle");
      setEntries([]);
    }
  };

  const undoDispatch = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setCanUndo(false);
    // SSE 연결 취소
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setPhase("idle");
    setSummaryText("");
    setEntries([]);
    // 마지막 유저 메시지 제거
    setMessages(prev => {
      const lastUserIdx = prev.findLastIndex(m => m.role === "user");
      return lastUserIdx >= 0 ? prev.slice(0, lastUserIdx) : prev;
    });
  };

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [entries]);

  const statusIcon = (s: DispatchStatus) => {
    switch (s) {
      case "pending": return "⏳";
      case "sending": return "📡";
      case "working": return "⚡";
      case "done": return "✅";
      case "skipped": return "⏭";
      case "error": return "❌";
    }
  };

  const statusColor = (s: DispatchStatus) => {
    switch (s) {
      case "working": return "bg-yellow-500/5 border-yellow-500/20";
      case "done": return "bg-green-500/5 border-green-500/20";
      case "error": return "bg-red-500/5 border-red-500/20";
      default: return "bg-[#1a1a2e] border-[#2a2a4a]";
    }
  };

  const routed = entries.filter(e => e.routed);
  const skipped = entries.filter(e => !e.routed);

  return (
    <div className="flex flex-col gap-1.5">
      {/* 히스토리 헤더 */}
      {messages.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[9px] text-gray-600">{messages.length}개 대화</span>
          <button
            onClick={() => { setMessages([]); localStorage.removeItem(DISPATCH_HISTORY_KEY); }}
            className="text-[9px] text-gray-600 hover:text-red-400 transition-colors"
          >
            초기화
          </button>
        </div>
      )}
      {/* 히스토리 + 진행중 */}
      {(messages.length > 0 || entries.length > 0) && (
        <div ref={scrollRef} className="max-h-[220px] overflow-y-auto space-y-1">
          {/* 대화 히스토리 */}
          {messages.map((m, i) => (
            m.role === "user" ? (
              <div key={i} className="text-[11px] text-yellow-400 bg-yellow-500/5 border border-yellow-500/10 rounded px-2 py-1.5">
                ▶ {m.text.split(/(@\S+)/g).map((part, j) =>
                  part.startsWith("@") ? <span key={j} className="text-yellow-300 font-bold bg-yellow-500/10 px-0.5 rounded">{part}</span> : part
                )}
              </div>
            ) : (
              <div key={i}
                className="text-[11px] p-2 rounded border bg-[#1a1a2e] border-[#2a2a4a] cursor-pointer hover:border-yellow-500/30 transition-colors"
                onClick={() => m.teamId && onOpenChat?.(m.teamId)}
                title="클릭 → 채팅창 열기"
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <span>{m.emoji}</span>
                  <span className="font-bold text-gray-300">{m.name}</span>
                  {m.tools && m.tools.length > 0 && (
                    <span className="text-[7px] text-purple-400 ml-auto">{m.tools.length}개 작업</span>
                  )}
                </div>
                <div className="text-gray-400 whitespace-pre-wrap text-[10px] line-clamp-3">{m.text.slice(0, 200)}{m.text.length > 200 ? "..." : ""}</div>
              </div>
            )
          ))}

          {/* CPO 진행 상태 */}
          {phase !== "idle" && phase !== "done" && (
            <div className="text-[11px] px-2 py-1.5 rounded border bg-yellow-500/5 border-yellow-500/20 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
              <span className="text-yellow-400 font-bold">
                {phase === "routing" && "🧠 CPO가 관련 팀 분석 중..."}
                {phase === "executing" && `⚡ ${routed.filter(e => e.status === "done").length}/${routed.length}팀 작업 중...`}
                {phase === "summarizing" && "🧠 CPO 통합 보고서 작성 중..."}
              </span>
            </div>
          )}

          {/* CPO 통합 보고 스트리밍 */}
          {phase === "summarizing" && summaryText && (
            <div className="text-[11px] p-2 rounded border bg-[#1a1a2e] border-yellow-500/30">
              <div className="flex items-center gap-1 mb-0.5">
                <span>🧠</span>
                <span className="font-bold text-yellow-400">CPO 통합보고</span>
                <span className="w-1 h-1 bg-yellow-400 rounded-full animate-pulse" />
              </div>
              <div className="text-gray-300 whitespace-pre-wrap text-[10px]">{summaryText}</div>
            </div>
          )}

          {/* 진행중인 팀 응답 */}
          {entries.length > 0 && (
            <>
              {skipped.length > 0 && (
                <div className="text-[8px] text-gray-600 px-1">⏭ {skipped.map(e => e.emoji).join("")}</div>
              )}
              {routed.map(e => (
                <div key={e.teamId} className={`text-[11px] p-2 rounded border ${statusColor(e.status)}`}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-[8px]">{statusIcon(e.status)}</span>
                    <span>{e.emoji}</span>
                    <span className="font-bold text-gray-300">{e.name}</span>
                    {e.status === "working" && <span className="w-1 h-1 bg-yellow-400 rounded-full animate-pulse" />}
                  </div>
                  {e.status === "working" && e.tools.length > 0 && (
                    <div className="text-[8px] text-yellow-400/70 truncate">⚡ {e.tools[e.tools.length - 1]}</div>
                  )}
                  {e.text && (
                    <div className="text-gray-400 whitespace-pre-wrap text-[10px] max-h-[60px] overflow-y-auto">{e.text}</div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* 이미지 미리보기 */}
      {pendingImages.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {pendingImages.map((img, i) => (
            <button key={i} onClick={() => setPendingImages(prev => prev.filter((_, j) => j !== i))}
              className="relative w-10 h-10 rounded border border-yellow-500/30 overflow-hidden active:opacity-50 transition-opacity"
              title="탭하여 삭제">
              <img src={URL.createObjectURL(img.file)} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 멘션 자동완성 드롭다운 */}
      {showMentions && mentionTeams.length > 0 && (
        <div className="bg-[#0f0f1f] border border-[#3a3a5a] rounded shadow-lg max-h-32 overflow-y-auto">
          {mentionTeams.map((t, i) => (
            <button key={t.id}
              className={`w-full text-left px-2 py-1 text-[11px] flex items-center gap-1.5 transition-colors ${
                i === mentionIdx ? "bg-yellow-500/15 text-yellow-300" : "text-gray-300 hover:bg-[#1a1a3a]"
              }`}
              onClick={() => selectMention(t)}>
              <span>{t.emoji}</span>
              <span className={i === mentionIdx ? "text-yellow-300 font-semibold" : ""}>{t.name}</span>
              <span className="text-[8px] text-gray-600 ml-auto">{t.id}</span>
            </button>
          ))}
          <div className="px-2 py-0.5 text-[8px] text-gray-700 border-t border-[#2a2a4a]">↑↓ 이동 · Tab/Enter 선택 · ESC 닫기</div>
        </div>
      )}

      {/* 입력 (Shift+Enter=줄바꿈) */}
      <input ref={dispatchFileRef} type="file" accept="image/*" multiple hidden
        onChange={(e) => { Array.from(e.target.files || []).forEach(f => setPendingImages(prev => [...prev, { file: f }])); e.target.value = ""; }} />
      <form onSubmit={(e) => { e.preventDefault(); dispatch(); }} className="flex gap-1">
        <button type="button" onClick={() => dispatchFileRef.current?.click()}
          className="px-1.5 py-1.5 text-gray-500 hover:text-yellow-400 shrink-0" title="이미지 첨부"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></button>
        <textarea
          value={input}
          onChange={e => {
            const v = e.target.value;
            setInput(v);
            // @ 감지 → 자동완성 (커서 위치 기준)
            const cursorPos = e.target.selectionStart || v.length;
            const textBeforeCursor = v.slice(0, cursorPos);
            const lastAtIdx = textBeforeCursor.lastIndexOf("@");
            if (lastAtIdx >= 0 && (lastAtIdx === 0 || textBeforeCursor[lastAtIdx - 1] === " " || textBeforeCursor[lastAtIdx - 1] === "\n")) {
              const afterAt = textBeforeCursor.slice(lastAtIdx + 1);
              // 공백이 포함되면 이미 선택 완료 → 드롭다운 닫기
              if (afterAt.includes(" ") || afterAt.includes("\n")) {
                setShowMentions(false);
              } else {
                setMentionQuery(afterAt);
                setMentionIdx(0);
                setShowMentions(true);
              }
            } else {
              setShowMentions(false);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setShowMentions(false); return; }
            // 멘션 드롭다운 키보드 네비게이션
            if (showMentions && mentionTeams.length > 0) {
              if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx(prev => Math.min(prev + 1, mentionTeams.length - 1)); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx(prev => Math.max(prev - 1, 0)); return; }
              if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); selectMention(mentionTeams[mentionIdx]); return; }
            }
            if (e.key === "Enter" && !isMobile && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              setShowMentions(false);
              dispatch();
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
          rows={1}
          placeholder="명령 입력 (@팀명 멘션 가능, Shift+Enter 줄바꿈)..."
          className="flex-1 bg-[#1a1a2e] border border-[#3a3a5a] text-white text-xs px-2 py-1.5 rounded focus:outline-none focus:border-yellow-400/50 resize-none max-h-20 overflow-y-auto"
          style={{ minHeight: "32px" }}
        />
        {canUndo ? (
          <button type="button" onClick={undoDispatch}
            className="px-2 py-1.5 bg-red-500/20 text-red-400 text-[10px] font-bold border border-red-500/30 rounded hover:bg-red-500/30 transition-colors shrink-0 animate-pulse"
            title="전송 취소">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        ) : sending ? (
          <button type="button" onClick={undoDispatch}
            className="px-2 py-1.5 bg-red-500/20 text-red-400 text-[10px] font-bold border border-red-500/30 rounded hover:bg-red-500/30 transition-colors shrink-0"
            title="중지">
            ■
          </button>
        ) : (
          <button type="submit" disabled={!input.trim() && pendingImages.length === 0}
            className="px-2 py-1.5 bg-yellow-500/20 text-yellow-400 text-[10px] font-bold border border-yellow-500/30 rounded hover:bg-yellow-500/30 disabled:opacity-30 transition-colors shrink-0">
            ▶
          </button>
        )}
      </form>
    </div>
  );
}

const WS_KEY = "hq-ws-base-url";

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h.startsWith("192.168.");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

interface TeamInfo {
  id: string;
  version: string | null;
  version_updated: string | null;
  last_commit_date: string | null;
  last_commit: string | null;
}

// ── 신규 에이전트 추가 모달 ──────────────────────────
const PROJECT_TYPE_OPTIONS = [
  { id: "webapp", label: "🌐 웹앱", desc: "Next.js, React 등 웹 서비스" },
  { id: "bot", label: "🤖 봇/자동화", desc: "트레이딩봇, 크롤러, 자동화" },
  { id: "game", label: "🎮 게임", desc: "Phaser, Canvas, 인터랙티브" },
  { id: "api", label: "⚡ API 서버", desc: "FastAPI, Express 백엔드" },
  { id: "mobile", label: "📱 모바일", desc: "React Native, Flutter" },
  { id: "data", label: "📊 데이터/분석", desc: "Pandas, Jupyter, 시각화" },
  { id: "tool", label: "🔧 CLI/도구", desc: "명령줄 도구, 유틸리티" },
  { id: "general", label: "📦 범용", desc: "기타 프로젝트" },
];

function AddTeamModal({ onClose, onCreated }: { onClose: () => void; onCreated: (team: Team) => void }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🆕");
  const [desc, setDesc] = useState("");
  const [projectType, setProjectType] = useState("general");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState("");

  const submit = async () => {
    if (!name.trim()) { setError("팀 이름을 입력하세요"); return; }
    setLoading(true);
    setError("");

    // 단계별 표시 (서버 응답 전 프론트 타이머)
    setStep("GitHub 레포 생성 중...");
    const stepTimer1 = setTimeout(() => setStep("로컬 클론 중..."), 2000);
    const stepTimer2 = setTimeout(() => setStep("CLAUDE.md 작성 중..."), 4000);
    const stepTimer3 = setTimeout(() => setStep("시스템 프롬프트 등록 중..."), 6000);

    try {
      const res = await fetch(`${getApiBase()}/api/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          repo: name.trim().toLowerCase().replace(/\s+/g, "-"),
          emoji,
          description: desc.trim(),
          project_type: projectType,
        }),
      });
      clearTimeout(stepTimer1); clearTimeout(stepTimer2); clearTimeout(stepTimer3);
      const data = await res.json();
      if (!data.ok) { setError(data.error || "생성 실패"); setLoading(false); setStep(""); return; }
      setStep("✅ 에이전트 생성 완료!");
      await new Promise(r => setTimeout(r, 800));
      const newTeam: Team = {
        id: data.team.id,
        name: data.team.name,
        emoji: data.team.emoji,
        repo: data.team.repo,
        localPath: data.team.localPath,
        status: data.team.status,
        githubUrl: data.repo_url,
      };
      onCreated(newTeam);
      onClose();
    } catch {
      clearTimeout(stepTimer1); clearTimeout(stepTimer2); clearTimeout(stepTimer3);
      setError("서버 연결 실패");
      setLoading(false);
      setStep("");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg p-5 w-[340px] shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-yellow-400 mb-3">+ 새 에이전트 추가</h3>
        <div className="space-y-2.5">
          {/* 이름 + 이모지 */}
          <div className="flex gap-2">
            <div className="w-16">
              <label className="text-[9px] text-gray-500 block mb-0.5">이모지</label>
              <input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={4}
                className="w-full bg-[#1a1a2e] border border-[#3a3a5a] text-white text-center px-1 py-1.5 text-lg rounded focus:outline-none focus:border-yellow-400/50" />
            </div>
            <div className="flex-1">
              <label className="text-[9px] text-gray-500 block mb-0.5">프로젝트 이름</label>
              <input autoFocus value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !loading && submit()}
                placeholder="예) 웹크롤러"
                className="w-full bg-[#1a1a2e] border border-[#3a3a5a] text-white px-2 py-1.5 text-xs rounded focus:outline-none focus:border-yellow-400/50" />
            </div>
          </div>

          {/* 프로젝트 타입 선택 */}
          <div>
            <label className="text-[9px] text-gray-500 block mb-1">프로젝트 타입</label>
            <div className="grid grid-cols-4 gap-1">
              {PROJECT_TYPE_OPTIONS.map(opt => (
                <button key={opt.id} onClick={() => setProjectType(opt.id)}
                  className={`text-[10px] py-1.5 px-1 rounded border transition-colors ${
                    projectType === opt.id
                      ? "border-yellow-400 bg-yellow-400/10 text-yellow-300"
                      : "border-[#3a3a5a] bg-[#1a1a2e] text-gray-400 hover:border-gray-500"
                  }`}
                  title={opt.desc}>
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[8px] text-gray-600 mt-0.5">
              {PROJECT_TYPE_OPTIONS.find(o => o.id === projectType)?.desc}
            </p>
          </div>

          {/* 설명 */}
          <div>
            <label className="text-[9px] text-gray-500 block mb-0.5">설명 (Shift+Enter 줄바꿈)</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!loading) submit(); } }}
              placeholder={"예) 네이버 뉴스 자동 크롤링 및 요약\n역할, 기능, 목표 등 자유롭게 작성"}
              rows={desc.includes("\n") ? Math.min(desc.split("\n").length + 1, 5) : 2}
              className="w-full bg-[#1a1a2e] border border-[#3a3a5a] text-white px-2 py-1.5 text-xs rounded focus:outline-none focus:border-yellow-400/50 resize-none" />
          </div>

          {error && <p className="text-[10px] text-red-400">{error}</p>}
          <p className="text-[8px] text-gray-600">자동: GitHub 레포 + 로컬 클론 + CLAUDE.md + 시스템프롬프트</p>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={submit} disabled={loading}
            className="flex-1 bg-yellow-500 text-black py-1.5 text-xs font-bold rounded hover:bg-yellow-400 disabled:opacity-50">
            {loading ? `🔄 ${step}` : "에이전트 생성"}
          </button>
          <button onClick={onClose} className="flex-1 bg-[#2a2a3a] text-gray-400 py-1.5 text-xs rounded hover:bg-[#3a3a4a]">취소</button>
        </div>
      </div>
    </div>
  );
}

// ── 에이전트 가이드 팝업 ──────────────────────────────
interface GuideData {
  name: string; emoji: string;
  claude_md: string; system_prompt: string;
}

function GuideModal({ teamId, onClose }: { teamId: string; onClose: () => void }) {
  const [data, setData] = useState<GuideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "prompt" | "md">("overview");

  useEffect(() => {
    fetch(`${getApiBase()}/api/teams/${teamId}/guide`)
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [teamId]);

  // CLAUDE.md에서 주요 섹션 파싱
  const parseMd = (md: string) => {
    const sections: { title: string; content: string }[] = [];
    const lines = md.split("\n");
    let current: { title: string; lines: string[] } | null = null;
    for (const line of lines) {
      if (line.startsWith("## ")) {
        if (current) sections.push({ title: current.title, content: current.lines.join("\n").trim() });
        current = { title: line.slice(3).trim(), lines: [] };
      } else if (current) {
        current.lines.push(line);
      }
    }
    if (current) sections.push({ title: current.title, content: current.lines.join("\n").trim() });
    return sections;
  };

  // 시스템프롬프트에서 섹션 파싱
  const parsePrompt = (p: string) => {
    const sections: { title: string; items: string[] }[] = [];
    const parts = p.split("【");
    parts.forEach(part => {
      const m = part.match(/^(.+?)】\n?([\s\S]*)/);
      if (m) {
        const items = m[2].split("\n").filter(l => l.trim().startsWith("-")).map(l => l.trim().slice(2));
        sections.push({ title: m[1], items });
      }
    });
    return sections;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg w-[380px] max-h-[80vh] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a5a] shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{data?.emoji || "📋"}</span>
            <span className="text-sm font-bold text-white">{data?.name || teamId}</span>
            <span className="text-[9px] text-gray-500">에이전트 가이드</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-sm">✕</button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-[#2a2a5a] shrink-0">
          {(["overview", "prompt", "md"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 text-[10px] py-2 transition-colors ${
                tab === t ? "text-yellow-400 border-b-2 border-yellow-400" : "text-gray-500 hover:text-gray-300"
              }`}>
              {t === "overview" ? "📋 역할·스펙" : t === "prompt" ? "🧠 시스템프롬프트" : "📄 CLAUDE.md"}
            </button>
          ))}
        </div>

        {/* 내용 */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {loading && <p className="text-gray-500 text-xs text-center py-8">로딩중...</p>}
          {!loading && !data && <p className="text-red-400 text-xs text-center py-8">정보를 불러올 수 없습니다</p>}

          {data && tab === "overview" && (() => {
            const promptSections = parsePrompt(data.system_prompt);
            return (
              <div className="space-y-3">
                {promptSections.map((s, i) => (
                  <div key={i} className="bg-[#1a1a2e] border border-[#2a2a4a] rounded p-3">
                    <h4 className="text-[11px] font-bold text-yellow-400 mb-1.5">{s.title}</h4>
                    {s.items.length > 0 ? (
                      <ul className="space-y-0.5">
                        {s.items.map((item, j) => (
                          <li key={j} className="text-[10px] text-gray-300 flex gap-1.5">
                            <span className="text-gray-600 shrink-0">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[10px] text-gray-400">{data.system_prompt.split("【" + s.title + "】")[1]?.split("【")[0]?.trim().slice(0, 200) || ""}</p>
                    )}
                  </div>
                ))}
                {promptSections.length === 0 && (
                  <p className="text-[10px] text-gray-400 whitespace-pre-wrap">{data.system_prompt}</p>
                )}
              </div>
            );
          })()}

          {data && tab === "prompt" && (
            <pre className="text-[9px] text-gray-300 whitespace-pre-wrap font-mono bg-[#0a0a1a] p-3 rounded border border-[#1a1a3a]">
              {data.system_prompt}
            </pre>
          )}

          {data && tab === "md" && (
            data.claude_md ? (
              <div className="space-y-2">
                {parseMd(data.claude_md).map((s, i) => (
                  <div key={i} className="bg-[#1a1a2e] border border-[#2a2a4a] rounded p-2.5">
                    <h4 className="text-[10px] font-bold text-blue-400 mb-1">{s.title}</h4>
                    <p className="text-[9px] text-gray-400 whitespace-pre-wrap">{s.content.slice(0, 500)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-xs text-center py-8">CLAUDE.md 파일이 없습니다</p>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export interface AuthUser {
  user_id: string;
  nickname: string;
  role: string;
  permissions: { level: number; label: string; can_code: boolean; can_create_team: boolean; can_manage: boolean };
}

// ── 좌측 슬라이드 메뉴 ──────────────────────────────
function SideMenu({ user, open, onClose, onLogout, pushEnabled, onTogglePush }: {
  user: AuthUser; open: boolean; onClose: () => void; onLogout: () => void;
  pushEnabled?: boolean; onTogglePush?: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(user.nickname);
  const [codeRole, setCodeRole] = useState("member");
  const [generatedCode, setGeneratedCode] = useState("");
  const [showCodeGen, setShowCodeGen] = useState(false);

  const saveName = () => {
    // 로컬만 변경 (서버 API 추가 시 연동)
    const saved = localStorage.getItem("hq-auth-user");
    if (saved) {
      const u = JSON.parse(saved);
      u.nickname = newName.trim() || user.nickname;
      localStorage.setItem("hq-auth-user", JSON.stringify(u));
    }
    setEditingName(false);
    window.location.reload();
  };

  const generateCode = async () => {
    const token = localStorage.getItem("hq-auth-token");
    try {
      const res = await fetch(`${getApiBase()}/api/auth/create-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, role: codeRole, max_uses: 1 }),
      });
      const data = await res.json();
      if (data.ok) setGeneratedCode(data.code);
    } catch {}
  };

  return (
    <>
      {/* 오버레이 */}
      {open && <div className="fixed inset-0 bg-black/50 z-[80]" onClick={onClose} />}
      {/* 메뉴 패널 */}
      <div className={`fixed top-0 left-0 h-full w-[260px] bg-[#0a0e1a] border-r border-[#2a3050] z-[90] flex flex-col transition-transform duration-200 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}>
        {/* 프로필 */}
        <div className="p-4 border-b border-[#1a2040]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#1a2040] flex items-center justify-center text-lg">
              {user.nickname[0]}
            </div>
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex gap-1">
                  <input value={newName} onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveName()}
                    className="flex-1 bg-[#101828] border border-[#2a3050] text-white px-2 py-0.5 text-xs rounded" autoFocus />
                  <button onClick={saveName} className="text-[9px] text-yellow-400">저장</button>
                </div>
              ) : (
                <button onClick={() => setEditingName(true)} className="flex items-center gap-1 group cursor-pointer">
                  <span className="text-sm font-semibold text-white truncate group-hover:text-yellow-400 transition-colors">{user.nickname}</span>
                  <svg className="w-2.5 h-2.5 text-gray-600 group-hover:text-yellow-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
              )}
              <span className="text-[9px] text-yellow-400/70">{user.permissions.label} (Lv.{user.permissions.level})</span>
            </div>
          </div>
        </div>

        {/* 메뉴 항목 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* 알림 설정 */}
          {onTogglePush && (
            <button onClick={onTogglePush}
              className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-gray-400 hover:bg-[#1a2040] rounded transition-colors">
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                푸시 알림
              </span>
              <span className={`w-8 h-4 rounded-full relative transition-colors ${pushEnabled ? "bg-yellow-500" : "bg-gray-700"}`}>
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${pushEnabled ? "right-0.5" : "left-0.5"}`} />
              </span>
            </button>
          )}
          {/* 권한 관리 (오너/관리자만) */}
          {user.permissions.level >= 4 && (
            <>
              <div className="px-2 py-1 mt-3">
                <h3 className="text-[8px] text-gray-600 uppercase tracking-wider mb-1">관리</h3>
              </div>
              <button onClick={() => setShowCodeGen(v => !v)}
                className="w-full text-left px-3 py-2 text-[11px] text-gray-400 hover:bg-[#1a2040] rounded transition-colors">
                초대코드 생성
              </button>
              {showCodeGen && (
                <div className="mx-2 p-2 bg-[#101828] rounded border border-[#1a2040] space-y-2">
                  <select value={codeRole} onChange={e => setCodeRole(e.target.value)}
                    className="w-full bg-[#0a0e1a] border border-[#2a3050] text-white text-[10px] px-2 py-1 rounded">
                    <option value="admin">관리자 (Lv.4)</option>
                    <option value="manager">매니저 (Lv.3)</option>
                    <option value="member">사원 (Lv.2)</option>
                    <option value="guest">게스트 (Lv.1)</option>
                  </select>
                  <button onClick={generateCode}
                    className="w-full bg-yellow-500 text-black text-[10px] py-1.5 rounded font-bold hover:bg-yellow-400">
                    생성
                  </button>
                  {generatedCode && (
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-mono text-yellow-400 tracking-wider flex-1 text-center">{generatedCode}</span>
                      <button onClick={() => { navigator.clipboard.writeText(generatedCode); }}
                        className="text-[8px] text-gray-500 hover:text-gray-300">복사</button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* 하단 */}
        <div className="p-3 border-t border-[#1a2040]">
          <button onClick={onLogout}
            className="w-full px-3 py-2 text-[11px] text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors text-left">
            로그아웃
          </button>
          <p className="text-[7px] text-gray-700 mt-2 text-center">v2.0 · (주)두근 컴퍼니</p>
        </div>
      </div>
    </>
  );
}

export default function Office({ user, onLogout }: { user?: AuthUser; onLogout?: () => void }) {
  const [teams, setTeams] = useState<Team[]>(defaultTeamList);

  // API에서 팀 목록 동적 로드 (teams.json 기반)
  useEffect(() => {
    const loadTeams = () =>
      fetch(`${getApiBase()}/api/teams`)
        .then(r => r.json())
        .then((data: { id: string; name: string; emoji: string; repo: string; localPath: string; status: string }[]) => {
          if (!Array.isArray(data)) return;
          const merged: Team[] = data.map(t => {
            const existing = defaultTeamList.find(d => d.id === t.id);
            return {
              id: t.id, name: t.name, emoji: t.emoji, repo: t.repo,
              localPath: t.localPath, status: t.status,
              siteUrl: existing?.siteUrl,
              githubUrl: existing?.githubUrl || `https://github.com/600-g/${t.repo}`,
            };
          });
          // 서버실·CPO는 teams.json 삭제 여부와 무관하게 항상 존재
          for (const fixedId of ["cpo-claude", "server-monitor"] as const) {
            if (!merged.find(t => t.id === fixedId)) {
              const fallback = defaultTeamList.find(d => d.id === fixedId);
              if (fallback) merged.unshift(fallback);
            }
          }
          setTeams(merged);
        });
    loadTeams().catch(() => {
      // 첫 시도 실패 시 2초 후 1회 재시도
      setTimeout(() => loadTeams().catch(() => {}), 2000);
    });
  }, []);
  const [teamInfoMap, setTeamInfoMap] = useState<Record<string, TeamInfo>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [guideTeamId, setGuideTeamId] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [openWindows, setOpenWindows] = useState<string[]>([]); // 열린 팀 id 목록
  const [focusedWindow, setFocusedWindow] = useState<string>("");
  const [mobileChat, setMobileChat] = useState<string | null>(null); // 모바일 채팅 팀 id
  const MAX_OPEN_WINDOWS = 3; // 동시 열 수 있는 최대 채팅창 수
  const [mobileSide, setMobileSide] = useState(false); // 모바일 사이드패널 (목록/통합채팅)
  const [openServerDash, setOpenServerDash] = useState(false); // PC 서버실 대시보드 오버레이
  const [qaRunning, setQaRunning] = useState(false);
  const [qaResult, setQaResult] = useState<{passed: boolean; output: string} | null>(null);
  const runQA = async () => {
    setQaRunning(true); setQaResult(null);
    try {
      const res = await fetch(`${getApiBase()}/api/qa/run`, { method: "POST" });
      const data = await res.json();
      setQaResult({ passed: data.passed, output: data.output || data.error || "" });
    } catch { setQaResult({ passed: false, output: "서버 연결 실패" }); }
    setQaRunning(false);
  };
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  // ESC 키 — 포커스된 채팅창 닫기 (입력 내용은 chatHistory에 남아 유지됨)
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openWindows.length > 0 && focusedWindow) {
        setOpenWindows(prev => prev.filter(id => id !== focusedWindow));
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [openWindows, focusedWindow]);

  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); }, []);
  const [chatHistory, setChatHistory] = useState<Record<string, Message[]>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("hq-chat-history");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // 대화 변경 시 localStorage 저장
  useEffect(() => {
    try {
      localStorage.setItem("hq-chat-history", JSON.stringify(chatHistory));
    } catch {}
  }, [chatHistory]);

  // ── 웹 푸시 알림 구독 ──────────────────────────────
  const [pushEnabled, setPushEnabled] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    // SW 등록 + 구독 상태 확인
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) setPushEnabled(true);
    }).catch(() => {});
  }, []);

  const togglePush = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      showToast("이 브라우저는 푸시 알림을 지원하지 않습니다");
      return;
    }
    try {
      // SW가 아직 등록 안 됐으면 등록
      let reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) reg = await navigator.serviceWorker.register("/sw.js");
      // active 될 때까지 대기
      if (!reg.active) await navigator.serviceWorker.ready;
      if (pushEnabled) {
        // 구독 해제
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch(`${getApiBase()}/api/push/unsubscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
        showToast("알림이 꺼졌습니다");
      } else {
        // VAPID 공개키 가져오기
        const keyRes = await fetch(`${getApiBase()}/api/push/vapid-key`);
        const { publicKey } = await keyRes.json();
        // base64url → Uint8Array
        const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
        const raw = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/") + padding);
        const arr = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        // 구독
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: arr,
        });
        // 서버에 등록
        await fetch(`${getApiBase()}/api/push/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
        setPushEnabled(true);
        showToast("알림이 켜졌습니다!");
      }
    } catch (e) {
      showToast("알림 설정 실패: " + (e instanceof Error ? e.message : "권한 거부"));
    }
  }, [pushEnabled, showToast]);

  // ── 인앱 알림 시스템 ──────────────────────────────────
  interface Notification { id: string; title: string; body: string; team_id: string; tag: string; read: boolean; time: string; }
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  // 알림 목록 fetch (15초마다)
  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/notifications`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok) {
          setNotifications(data.notifications || []);
          setUnreadCount(data.unread || 0);
        }
      } catch {}
    };
    fetchNotifs();
    const id = setInterval(fetchNotifs, 15000);
    return () => clearInterval(id);
  }, []);

  // SW에서 OPEN_TEAM_CHAT 메시지 수신 → 해당 팀 채팅 열기
  const handleTeamClickRef = useRef<(id: string) => void>(() => {});
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "OPEN_TEAM_CHAT" && e.data.team_id) {
        handleTeamClickRef.current(e.data.team_id);
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  // 알림 패널 열 때 배지 초기화
  useEffect(() => {
    if (showNotifPanel && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "CLEAR_BADGE" });
    }
  }, [showNotifPanel]);

  const markNotifRead = async (notifId: string, teamId?: string) => {
    // 이미 읽은 알림이면 서버 호출 생략 (팀 이동만)
    const alreadyRead = notifications.find(n => n.id === notifId)?.read;
    if (!alreadyRead) {
      try {
        const res = await fetch(`${getApiBase()}/api/notifications/${notifId}/read`, { method: "POST" });
        const data = await res.json();
        setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
        setUnreadCount(typeof data.unread === "number" ? data.unread : Math.max(0, unreadCount - 1));
      } catch {
        setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    }
    if (teamId) {
      // 알림 클릭 시 항상 열기 (토글 아닌 강제 열기)
      const mobile = typeof window !== "undefined" && window.innerWidth < 768;
      if (mobile) {
        setMobileChat(teamId);
        setMobileSide(true);
      } else {
        setOpenWindows(prev => prev.includes(teamId) ? prev : [...prev, teamId]);
        setFocusedWindow(teamId);
      }
      setShowNotifPanel(false);
    }
  };

  const markAllRead = async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/notifications/read-all`, { method: "POST" });
      const data = await res.json();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(typeof data.unread === "number" ? data.unread : 0);
    } catch {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    }
  };

  // 팀 버전 정보 fetch (30초마다)
  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/teams/info`);
        if (!res.ok) return;
        const list: TeamInfo[] = await res.json();
        const map: Record<string, TeamInfo> = {};
        list.forEach(t => { map[t.id] = t; });
        setTeamInfoMap(map);
      } catch {}
    };
    fetchInfo();
    const id = setInterval(fetchInfo, 30000);
    return () => clearInterval(id);
  }, []);

  // 에이전트 working 상태 폴링 (3초마다) → 게임 + 사이드바 표시
  const [workingSet, setWorkingSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/dashboard`);
        if (!res.ok) return;
        const data = await res.json();
        const newWorking = new Set<string>();
        (data.agents as { id: string; working: boolean; tool?: string | null }[]).forEach(agent => {
          gameRef.current?.setWorking(agent.id, agent.working);
          if (agent.working) newWorking.add(agent.id);
        });
        setWorkingSet(newWorking);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  const [GameComponent, setGameComponent] = useState<React.ComponentType<{
    onTeamClick: (id: string, screenX?: number, screenY?: number) => void;
    floorLayout?: Record<number, string[]>;
    ref: React.Ref<OfficeGameHandle>;
  }> | null>(null);
  const gameRef = useRef<OfficeGameHandle>(null);

  useEffect(() => {
    import("../game/OfficeGame").then((mod) => setGameComponent(() => mod.default));
  }, []);

  const [clickPositions, setClickPositions] = useState<Record<string, { x: number; y: number }>>({});

  // ── 에이전트 패널 드래그 앤 드롭 (층별 순서) — 서버 영구 저장 ──
  const PINNED_IDS = ["cpo-claude"];
  const SIDEBAR_TOP_IDS = ["cpo-claude", "server-monitor"]; // 사이드바 최상단 고정 항목 (이동 불가)
  const DEFAULT_FLOORS: Record<number, string[]> = {
    1: ["cpo-claude", "claude-biseo", "frontend-team", "backend-team", "content-lab"],
    2: ["trading-bot", "ai900", "design-team", "date-map"],
  };
  // localStorage 무시 — 항상 DEFAULT_FLOORS로 시작, 서버에서 덮어씀
  const [floorTeams, setFloorTeams] = useState<Record<number, string[]>>(DEFAULT_FLOORS);
  const floorLoadedFromServer = useRef(false);
  const dragItem = useRef<{ teamId: string; fromFloor: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ floor: number; index: number } | null>(null);
  const [floorDropdownTeam, setFloorDropdownTeam] = useState<string | null>(null);

  // 층 이동 드롭다운: 바깥 클릭 시 닫기
  useEffect(() => {
    if (!floorDropdownTeam) return;
    const handler = () => setFloorDropdownTeam(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [floorDropdownTeam]);

  const moveToFloor = useCallback((teamId: string, targetFloor: number) => {
    setFloorTeams(prev => {
      // 6팀 제한 체크 (이미 그 층에 있는 경우 제외)
      const dstList = prev[targetFloor] || [];
      if (dstList.length >= MAX_PER_FLOOR && !dstList.includes(teamId)) {
        showToast(`${targetFloor}F는 최대 ${MAX_PER_FLOOR}팀까지만 배치 가능해요`);
        return prev;
      }

      const next = { ...prev };
      // Remove from current floor
      for (const f of Object.keys(next)) {
        const fl = Number(f);
        if (next[fl]?.includes(teamId)) {
          next[fl] = next[fl].filter(id => id !== teamId);
          if (next[fl].length === 0) delete next[fl];
          break;
        }
      }
      // Add to target floor
      if (!next[targetFloor]) next[targetFloor] = [];
      next[targetFloor] = [...next[targetFloor], teamId];
      return next;
    });
    gameRef.current?.moveTeamToFloor(teamId, targetFloor);
  }, []);

  // 서버에서 층 배치 로드 (최초 1회)
  useEffect(() => {
    const loadFromServer = async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/layout/floors`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.ok || !data.floors) return;

        const serverFloors: Record<number, string[]> = {};

        if (Array.isArray(data.floors)) {
          // API 형식: [{floor: 1, teams: [{id: "...", ...}, ...]}, ...]
          for (const entry of data.floors) {
            const floor = Number(entry.floor);
            if (!floor || !Array.isArray(entry.teams)) continue;
            serverFloors[floor] = entry.teams.map((t: { id: string }) => t.id);
          }
        } else if (typeof data.floors === "object") {
          // 대체 형식: {"1": ["team-id", ...], "2": [...]}
          for (const [k, v] of Object.entries(data.floors)) {
            if (Array.isArray(v)) {
              serverFloors[Number(k)] = (v as unknown[]).map(item =>
                typeof item === "string" ? item : (item as { id: string })?.id
              ).filter(Boolean) as string[];
            }
          }
        }

        if (Object.keys(serverFloors).length > 0) {
          setFloorTeams(serverFloors);
          localStorage.setItem("hq-floor-teams-order", JSON.stringify(serverFloors));
          floorLoadedFromServer.current = true;
        }
      } catch {}
    };
    loadFromServer();
  }, []);

  // floorTeams 동기화: 저장된 배치를 기준으로 새 팀 추가 / 삭제된 팀 제거
  // ⚠️ gameRef.getTeamFloor() 사용 금지 — 기본값(1층)이 서버 배치를 덮어쓰는 버그
  useEffect(() => {
    if (teams.length === 0) return;
    const teamIds = new Set(teams.map(t => t.id));

    setFloorTeams(prev => {
      if (Object.keys(prev).length === 0) return prev;
      const next: Record<number, string[]> = {};
      const placed = new Set<string>();

      // 기존 배치에서 현재 존재하는 팀만 유지 (순서 보존)
      for (const [f, ids] of Object.entries(prev)) {
        const floor = Number(f);
        const valid = (ids as string[]).filter(id => teamIds.has(id));
        valid.forEach(id => placed.add(id));
        if (valid.length > 0) next[floor] = valid;
      }

      // 새로 추가된 팀은 1층 끝에 추가
      const newTeams = [...teamIds].filter(id => !placed.has(id));
      if (newTeams.length > 0) {
        if (!next[1]) next[1] = [];
        next[1] = [...next[1], ...newTeams];
      }

      return next;
    });

    // Phaser는 ALL_FLOORS 하드코딩으로 자체 관리 — React에서 moveTeamToFloor 호출 금지
    // (moveTeamToFloor가 같은 층 이동 시 팀을 삭제하는 버그 있음)
  }, [teams]);

  // floorTeams 변경 시 localStorage + 서버 동시 저장
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (Object.keys(floorTeams).length === 0) return;
    // localStorage 즉시 저장 (빠른 캐시)
    try {
      localStorage.setItem("hq-floor-teams-order", JSON.stringify(floorTeams));
    } catch {}
    // 서버 저장은 디바운스 (500ms) — 드래그 중 과다 호출 방지
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch(`${getApiBase()}/api/layout/floors`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: floorTeams }),
      }).catch(() => {});
    }, 500);
  }, [floorTeams]);

  const handleDragStart = useCallback((e: React.DragEvent, teamId: string, floor: number) => {
    dragItem.current = { teamId, fromFloor: floor };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", teamId);
    (e.currentTarget as HTMLElement).style.opacity = "0.4";
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = "1";
    dragItem.current = null;
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, floor: number, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget({ floor, index });
  }, []);

  const MAX_PER_FLOOR = 6;

  const handleDrop = useCallback((e: React.DragEvent, targetFloor: number, targetIndex: number) => {
    e.preventDefault();
    const drag = dragItem.current;
    if (!drag) return;

    setFloorTeams(prev => {
      const next = { ...prev };
      // 원래 층에서 제거
      const srcList = [...(next[drag.fromFloor] || [])];
      const srcIdx = srcList.indexOf(drag.teamId);
      if (srcIdx !== -1) srcList.splice(srcIdx, 1);
      next[drag.fromFloor] = srcList;

      if (drag.fromFloor === targetFloor) {
        // 같은 층: 순서만 변경
        const insertAt = Math.min(targetIndex, srcList.length);
        srcList.splice(insertAt, 0, drag.teamId);
      } else {
        // 다른 층: 6팀 제한 체크
        const dstList = [...(next[targetFloor] || [])];
        if (dstList.length >= MAX_PER_FLOOR) {
          // 꽉 찬 층 → 원래 위치로 복원
          srcList.splice(srcIdx, 0, drag.teamId);
          next[drag.fromFloor] = srcList;
          showToast(`${targetFloor}F는 최대 ${MAX_PER_FLOOR}팀까지만 배치 가능해요`);
          return next;
        }
        const insertAt = Math.min(targetIndex, dstList.length);
        dstList.splice(insertAt, 0, drag.teamId);
        next[targetFloor] = dstList;
        gameRef.current?.moveTeamToFloor(drag.teamId, targetFloor);
      }

      // 빈 층 제거
      for (const f of Object.keys(next)) {
        if (next[Number(f)]?.length === 0 && Number(f) > 1) delete next[Number(f)];
      }
      return next;
    });

    dragItem.current = null;
    setDropTarget(null);
  }, []);

  // 채팅 열 때 해당 팀 알림 자동 읽음 처리
  const autoMarkTeamRead = useCallback((teamId: string) => {
    const hasUnread = notifications.some(n => n.team_id === teamId && !n.read);
    if (!hasUnread) return;
    fetch(`${getApiBase()}/api/notifications/team/${teamId}/read`, { method: "POST" })
      .then(r => r.json())
      .then(data => {
        setNotifications(prev => prev.map(n => n.team_id === teamId ? { ...n, read: true } : n));
        if (typeof data.unread === "number") setUnreadCount(data.unread);
      })
      .catch(() => {});
  }, [notifications]);

  const handleTeamClick = useCallback((teamId: string, screenX?: number, screenY?: number) => {
    // 서버실은 ServerDashboard로 분기
    // QA — 일반 채팅창으로 열림 (서포트 에이전트)
    if (teamId === "server-monitor") {
      const mobile = typeof window !== "undefined" && window.innerWidth < 768;
      if (mobile) {
        setMobileChat(prev => prev === "server-monitor" ? null : "server-monitor");
        setMobileSide(true);
      } else {
        setOpenServerDash(prev => !prev);
      }
      return;
    }
    const mobile = typeof window !== "undefined" && window.innerWidth < 768;
    if (mobile) {
      setMobileChat(prev => prev === teamId ? null : teamId);
      setMobileSide(true);
      autoMarkTeamRead(teamId);
      return;
    }
    // 다중 모달: openWindows 배열 토글
    if (openWindows.includes(teamId)) {
      setOpenWindows(prev => prev.filter(id => id !== teamId));
    } else {
      if (openWindows.length >= MAX_OPEN_WINDOWS) {
        showToast(`최대 ${MAX_OPEN_WINDOWS}개까지 열 수 있어요`);
        return;
      }
      setOpenWindows(prev => [...prev, teamId]);
      setFocusedWindow(teamId);
      autoMarkTeamRead(teamId);
    }
  }, [teams, openWindows, showToast, autoMarkTeamRead]);
  handleTeamClickRef.current = handleTeamClick;

  // URL ?team=xxx 파라미터로 팀 채팅 자동 열기 (알림 클릭 시)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const teamParam = params.get("team");
    if (teamParam) {
      handleTeamClick(teamParam);
      window.history.replaceState({}, "", "/"); // 파라미터 제거
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWorkingChange = useCallback((teamId: string, working: boolean) => {
    gameRef.current?.setWorking(teamId, working);
  }, []);

  const handleAddTeam = useCallback((newTeam: Team) => {
    setTeams(prev => [...prev, newTeam]);
    // 가장 낮은 층 중 여유 있는 곳에 배치 (6팀/층 제한)
    setFloorTeams(prev => {
      const next = { ...prev };
      let targetFloor = 1;
      for (let f = 1; f <= 10; f++) {
        if (!next[f]) { targetFloor = f; break; }
        if (next[f].length < 6) { targetFloor = f; break; }
      }
      if (!next[targetFloor]) next[targetFloor] = [];
      next[targetFloor] = [...next[targetFloor], newTeam.id];
      return next;
    });
    gameRef.current?.addTeam(newTeam.id, newTeam.name, newTeam.emoji);
  }, []);

  // 날짜 상대 표시
  const formatRelativeDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return "방금";
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  };

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row overflow-hidden bg-[#1a1a2e]">
      {/* 토스트 알림 */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-[#1a1a3a] border border-yellow-500/30 text-yellow-400 text-[12px] px-4 py-2 rounded-lg shadow-lg animate-bounce">
          {toast}
        </div>
      )}
      {showAddModal && <AddTeamModal onClose={() => setShowAddModal(false)} onCreated={handleAddTeam} />}
      {guideTeamId && <GuideModal teamId={guideTeamId} onClose={() => setGuideTeamId(null)} />}
      {user && onLogout && <SideMenu user={user} open={showMenu} onClose={() => setShowMenu(false)} onLogout={onLogout} pushEnabled={pushEnabled} onTogglePush={togglePush} />}
      {/* ── 사무실 영역 ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* HUD */}
        <header className="bg-[#0e0e20]/90 border-b border-[#2a2a5a] px-3 py-1.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {/* 메뉴 버튼 */}
            <button onClick={() => setShowMenu(true)} className="text-gray-500 hover:text-gray-300 transition-colors" title="메뉴">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <span className="text-base cursor-pointer" onClick={() => window.location.reload()}
              onDoubleClick={async (e) => {
                e.stopPropagation();
                if (typeof caches !== "undefined") { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
                if (navigator.serviceWorker) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); }
                window.location.href = window.location.pathname + "?v=" + Date.now();
              }}>🏢</span>
            <h1 className="text-xs font-semibold text-yellow-400 cursor-pointer" onClick={() => window.location.reload()}>(주)두근 컴퍼니</h1>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] text-gray-400">
            {/* 알림 벨 */}
            <button onClick={() => setShowNotifPanel(v => !v)} className="relative text-gray-400 hover:text-yellow-400 transition-colors p-1" title="알림">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
            {/* 네트워크 신호 아이콘 */}
            <div className="flex items-center gap-1 bg-[#1a1a3a] border border-[#2a2a5a] px-2 py-0.5 rounded">
              <svg width="12" height="12" viewBox="0 0 16 16" className="text-green-400">
                <rect x="1" y="11" width="3" height="4" rx="0.5" fill="currentColor" />
                <rect x="5" y="8" width="3" height="7" rx="0.5" fill="currentColor" />
                <rect x="9" y="5" width="3" height="10" rx="0.5" fill="currentColor" />
                <rect x="13" y="2" width="3" height="13" rx="0.5" fill="currentColor" opacity="0.3" />
              </svg>
              <span>연결됨</span>
            </div>
            <div className="bg-[#1a1a3a] border border-[#2a2a5a] px-2 py-0.5 rounded hidden sm:block">
              에이전트 {teams.length}
            </div>
          </div>
        </header>

        {/* 알림 패널 드롭다운 */}
        {showNotifPanel && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setShowNotifPanel(false)} />
            <div className="absolute right-2 top-10 z-[70] w-[320px] max-h-[400px] bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg shadow-2xl flex flex-col overflow-hidden">
              {/* 헤더 */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a5a]">
                <span className="text-xs font-bold text-white">알림 {unreadCount > 0 && <span className="text-yellow-400">({unreadCount})</span>}</span>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-[9px] text-yellow-400 hover:text-yellow-300">전체 읽음</button>
                )}
              </div>
              {/* 알림 목록 */}
              <div className="flex-1 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-gray-600 text-xs">알림이 없습니다</div>
                ) : notifications.map(n => (
                  <button key={n.id}
                    onClick={() => markNotifRead(n.id, n.team_id || undefined)}
                    className={`w-full text-left px-3 py-2.5 border-b border-[#1a1a3a] hover:bg-[#1a1a3a] transition-colors ${
                      n.read ? "opacity-50" : ""
                    }`}>
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 mt-1.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-white truncate">{n.title}</span>
                          <span className="text-[8px] text-gray-600 shrink-0">{n.time.split(" ")[1]?.slice(0, 5)}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">{n.body}</p>
                        {n.team_id && (
                          <span className="text-[8px] text-yellow-400/60 mt-0.5 inline-block">
                            {teams.find(t => t.id === n.team_id)?.emoji} {teams.find(t => t.id === n.team_id)?.name || n.team_id} →
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Phaser — 항상 풀 */}
        <main className={`relative min-h-0 flex-1${(mobileSide || mobileChat) ? " pointer-events-none" : ""}`}>
          {GameComponent ? (
            <GameComponent ref={gameRef} onTeamClick={handleTeamClick} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-xs text-gray-500">🏢 사무실 로딩중...</p>
            </div>
          )}
        </main>

      </div>

      {/* ── 모바일 플로팅 버튼 ── */}
      {!mobileSide && !mobileChat && (
        <button
          onClick={() => setMobileSide(true)}
          className="md:hidden fixed right-4 z-[60] w-14 h-14 rounded-full bg-yellow-500 text-[#0a0a18] text-2xl shadow-lg active:scale-90 transition-transform flex items-center justify-center"
          style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
        ><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
      )}

      {/* ── 모바일 우측 사이드 패널 ── */}
      {(mobileSide || mobileChat) && (
        <div className="md:hidden fixed inset-0 z-[70] bg-black/30" onClick={() => { setMobileChat(null); setMobileSide(false); }}>
          <div
            className="absolute top-0 right-0 w-[85vw] max-w-[360px] h-[100dvh] bg-[#0a0e1a] border-l border-[#2a2a5a] flex flex-col shadow-2xl animate-slide-in-right overscroll-contain"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            onClick={e => e.stopPropagation()}
          >
            {mobileChat ? (() => {
              const team = teams.find(t => t.id === mobileChat);
              if (!team) return null;
              const isServerMonitor = team.id === "server-monitor";
              return (
                <>
                  {/* 채팅/대시보드 헤더 */}
                  <div className="flex items-center gap-2 px-3 py-3 bg-[#0e0e20] border-b border-[#2a2a5a] shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setMobileChat(null); }} className="text-gray-400 active:text-white text-lg px-1">←</button>
                    <span className="text-lg">{team.emoji}</span>
                    <span className="text-sm font-semibold text-white flex-1 truncate">{team.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); setMobileChat(null); setMobileSide(false); }} className="text-gray-500 active:text-white text-xl px-1">✕</button>
                  </div>
                  {/* 서버모니터 → 대시보드, 그 외 → 채팅 */}
                  <div className="flex-1 min-h-0 flex flex-col">
                    {isServerMonitor
                      ? <ServerDashboard onClose={() => setMobileChat(null)} />
                      : <ChatPanel
                          team={team}
                          onClose={() => setMobileChat(null)}
                          onWorkingChange={(working) => handleWorkingChange(team.id, working)}
                          inline={true}
                          messages={chatHistory[team.id] || []}
                          onMessages={(msgs) => setChatHistory(prev => ({ ...prev, [team.id]: msgs }))}
                        />
                    }
                  </div>
                </>
              );
            })() : (
              <>
                {/* 목록 헤더 */}
                <div className="flex items-center justify-between px-3 py-3 bg-[#0e0e20] border-b border-[#2a2a5a] shrink-0">
                  <span className="text-sm font-semibold text-white">에이전트</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setMobileSide(false); setShowAddModal(true); }}
                      className="text-[9px] px-2 py-0.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded active:bg-yellow-500/20"
                    >+ 추가</button>
                    <button onClick={(e) => { e.stopPropagation(); setMobileSide(false); }} className="text-gray-500 active:text-white text-xl px-1">✕</button>
                  </div>
                </div>
                {/* 에이전트 목록 (층별 그룹) + 통합채팅 */}
                <div className="flex-1 overflow-y-auto overscroll-contain" style={{ minHeight: 0, WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}>
                  {/* ── 서버실 + CPO 모바일 최상단 고정 섹션 ── */}
                  <div className="px-2 pt-2 pb-1.5 flex flex-col gap-0.5 border-b border-[#2a2a5a]">
                    {/* 서버실 — 모니터링 (최상단) */}
                    <button
                      onClick={() => { setMobileChat("server-monitor"); setMobileSide(true); }}
                      className={`w-full text-left px-2.5 py-1.5 rounded text-[12px] transition-all min-h-[36px] ${
                        mobileChat === "server-monitor"
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          : "text-gray-400 border border-transparent active:bg-[#1a1a3a]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>🖥</span>
                        <span>서버실</span>
                        <span className="text-[7px] text-gray-600 ml-auto">모니터링</span>
                        <span className="text-[7px] bg-gray-700 text-gray-500 px-1 rounded">고정</span>
                      </div>
                    </button>
                    {/* CPO */}
                    {(() => {
                      const cpo = teams.find(t => t.id === "cpo-claude");
                      if (!cpo) return null;
                      return (
                        <button
                          onClick={() => { setMobileChat("cpo-claude"); setMobileSide(true); }}
                          className={`w-full text-left px-2.5 py-1.5 rounded text-[12px] transition-all min-h-[36px] ${
                            mobileChat === "cpo-claude"
                              ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                              : "text-yellow-300/80 border border-yellow-500/15 active:bg-yellow-500/5"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-base">{cpo.emoji}</span>
                            <span className="font-semibold">{cpo.name}</span>
                            <span className="text-[7px] bg-yellow-500/20 text-yellow-500 px-1 rounded ml-auto">고정</span>
                          </div>
                        </button>
                      );
                    })()}
                  </div>
                  <div className="p-2 flex flex-col gap-0">
                    {(() => {
                      const floors = Object.keys(floorTeams).map(Number).sort((a, b) => a - b);
                      if (floors.length === 0) {
                        return teams.filter(t => !SIDEBAR_TOP_IDS.includes(t.id)).map((team) => {
                          const info = teamInfoMap[team.id];
                          return (
                            <button key={team.id} onClick={() => setMobileChat(team.id)}
                              className="w-full text-left px-2.5 py-2 rounded text-[12px] active:bg-[#1a2040] transition-colors">
                              <div className="flex items-center gap-1.5">
                                <span>{team.emoji} {team.name}</span>
                                {info?.version && <span className="text-[8px] text-gray-600 font-mono">{info.version}</span>}
                              </div>
                            </button>
                          );
                        });
                      }
                      return floors.map((floor) => {
                        const teamIds = (Array.isArray(floorTeams[floor]) ? floorTeams[floor] : []).filter(id => !SIDEBAR_TOP_IDS.includes(id));
                        return (
                          <div key={floor}>
                            {/* 층 헤더 */}
                            <button
                              onClick={() => { gameRef.current?.changeFloor(floor); setMobileSide(false); }}
                              className="flex items-center gap-1.5 py-1.5 mt-1 w-full rounded active:bg-[#1a1a3a] transition-colors group"
                            >
                              <span className="flex-1 h-px bg-[#2a2a5a]" />
                              <span className="text-[9px] text-gray-600 group-active:text-blue-400 font-semibold tracking-wider whitespace-nowrap">{floor}F</span>
                              <span className="flex-1 h-px bg-[#2a2a5a]" />
                            </button>
                            {teamIds.map((teamId) => {
                              const team = teams.find(t => t.id === teamId);
                              if (!team) return null;
                              const info = teamInfoMap[team.id];
                              const isPinned = PINNED_IDS.includes(team.id);
                              return (
                                <div key={team.id} className="flex items-center gap-1">
                                  <button
                                    onClick={() => setMobileChat(team.id)}
                                    className={`shrink-0 flex-1 text-left px-2.5 py-1.5 rounded text-[12px] transition-all min-h-[36px] ${
                                      mobileChat === team.id
                                        ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                                        : "text-gray-400 border border-transparent active:bg-[#1a1a3a]"
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span>{team.emoji} {team.name}</span>
                                      {info?.version && <span className="text-[8px] text-gray-600 font-mono">{info.version}</span>}
                                    </div>
                                    {info?.last_commit_date && (
                                      <div className="text-[8px] text-gray-600 mt-0.5 truncate">
                                        {formatRelativeDate(info.last_commit_date)}
                                        {info.last_commit && <span className="text-gray-700"> · {info.last_commit.slice(0, 25)}</span>}
                                      </div>
                                    )}
                                  </button>
                                  {/* 액션 아이콘: 가이드 / 층이동 / 삭제 */}
                                  <div className="flex shrink-0 gap-0.5">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setGuideTeamId(team.id); }}
                                      className="w-7 h-7 flex items-center justify-center rounded text-gray-600 active:text-yellow-400 active:bg-[#1a1a3a]"
                                      title="가이드">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                                      </svg>
                                    </button>
                                    {!isPinned && (
                                      <div className="relative">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setFloorDropdownTeam(floorDropdownTeam === team.id ? null : team.id); }}
                                          className="w-7 h-7 flex items-center justify-center rounded text-gray-600 active:text-yellow-400 active:bg-[#1a1a3a]"
                                          title="층 이동">
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22V12h6v10"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01"/></svg>
                                        </button>
                                        {floorDropdownTeam === team.id && (
                                          <div className="absolute right-0 top-full mt-1 bg-[#1a1a2e] border border-[#3a3a5a] rounded p-1 z-50 min-w-[80px]" onClick={e => e.stopPropagation()}>
                                            {Object.keys(floorTeams).map(Number).sort((a, b) => a - b).map(f => {
                                              const isCurrent = floorTeams[f]?.includes(team.id);
                                              const isFull = (floorTeams[f]?.length || 0) >= MAX_PER_FLOOR && !isCurrent;
                                              return (
                                                <button key={f} disabled={isFull || isCurrent}
                                                  onClick={() => { moveToFloor(team.id, f); setFloorDropdownTeam(null); }}
                                                  className={`w-full text-left text-[10px] px-2 py-1 rounded transition-colors ${
                                                    isCurrent ? "text-yellow-400 bg-yellow-500/10" : isFull ? "text-gray-600 cursor-not-allowed" : "text-gray-300 active:bg-[#2a2a4a]"
                                                  }`}>
                                                  <span className="whitespace-nowrap">{isCurrent ? "●" : "○"} {f}F{isFull ? " 꽉참" : ""}</span>
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {!isPinned && (
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          if (!confirm(`${team.emoji} ${team.name} 에이전트를 삭제할까요?`)) return;
                                          await fetch(`${getApiBase()}/api/teams/${team.id}`, { method: "DELETE" });
                                          window.location.reload();
                                        }}
                                        className="w-7 h-7 flex items-center justify-center rounded text-red-500/70 active:text-red-400 active:bg-red-500/10"
                                        title="삭제">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      });
                    })()}
                  </div>
                  {/* 통합 디스패치 */}
                  <div className="border-t border-[#2a2a5a] p-2">
                    <DispatchChat teams={teams} onOpenChat={(id) => setMobileChat(id)} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 서버실 대시보드 오버레이 (PC) ── */}
      {openServerDash && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-start justify-center pt-12" onClick={() => setOpenServerDash(false)}>
          <div className="bg-[#0a0e1a] border border-[#2a2a5a] rounded-lg w-[680px] max-h-[80vh] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a5a] shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">🖥</span>
                <span className="text-sm font-bold text-white">서버실 모니터링</span>
                <span className="text-[9px] text-gray-600">server-monitor</span>
              </div>
              <button onClick={() => setOpenServerDash(false)} className="text-gray-500 hover:text-white text-sm">✕</button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <ServerDashboard onClose={() => setOpenServerDash(false)} />
            </div>
          </div>
        </div>
      )}

      {/* ── 다중 채팅 모달 (최대 3개 병렬) ── */}
      {openWindows.length > 0 && (
        <div
          style={{
            position: 'fixed', inset: 0,
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          {openWindows.map((winId, idx) => {
            const t = teams.find(tm => tm.id === winId);
            if (!t) return null;
            const isFocused = focusedWindow === winId;
            const baseX = Math.floor((typeof window !== "undefined" ? window.innerWidth : 900) / 2 - 250);
            return (
              <div key={winId} style={{ pointerEvents: 'auto' }} onMouseDown={() => setFocusedWindow(winId)}>
                <ChatWindow
                  team={t}
                  messages={chatHistory[winId] || []}
                  onMessages={(msgs) => setChatHistory(prev => ({ ...prev, [winId]: msgs }))}
                  onClose={() => setOpenWindows(prev => prev.filter(id => id !== winId))}
                  onWorkingChange={(working) => handleWorkingChange(winId, working)}
                  onFocus={() => setFocusedWindow(winId)}
                  zIndex={isFocused ? 1010 : 1001 + idx}
                  initialX={baseX + idx * 40}
                  initialY={60 + idx * 30}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* ── 우측 패널 (PC만) ── */}
      <aside className="hidden md:flex md:w-[420px] h-full bg-[#12122a] border-l border-[#2a2a5a] flex-col shrink-0 overflow-hidden">
        {/* 에이전트 목록 */}
        <div className="p-2 border-b border-[#2a2a5a] overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Agents</h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-[9px] px-2 py-0.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded hover:bg-yellow-500/20 transition-colors"
              title="새 팀 추가"
            >
              + 추가
            </button>
          </div>

          {/* ── 서버실 + CPO 최상단 고정 섹션 ── */}
          <div className="flex flex-col gap-0.5 mb-2 pb-2 border-b border-[#2a2a5a]">
            {/* 서버실 — 모니터링 대시보드 (최상단) */}
            <button
              onClick={() => setOpenServerDash(true)}
              className={`w-full text-left px-2.5 py-1.5 rounded text-[12px] transition-all min-h-[36px] ${
                openServerDash
                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  : "text-gray-400 border border-transparent hover:bg-[#1a1a3a]"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span>🖥</span>
                <span>서버실</span>
                <span className="text-[7px] text-gray-600 ml-auto">모니터링</span>
                <span className="text-[7px] bg-gray-700 text-gray-500 px-1 rounded">고정</span>
              </div>
            </button>
            {/* CPO */}
            {(() => {
              const cpo = teams.find(t => t.id === "cpo-claude");
              if (!cpo) return null;
              return (
                <button
                  onClick={() => handleTeamClick("cpo-claude")}
                  className={`w-full text-left px-2.5 py-1.5 rounded text-[12px] transition-all min-h-[36px] ${
                    openWindows.includes("cpo-claude")
                      ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                      : "text-yellow-300/80 border border-yellow-500/15 hover:bg-yellow-500/5"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{cpo.emoji}</span>
                    <span className="font-semibold">{cpo.name}</span>
                    <span className="text-[7px] bg-yellow-500/20 text-yellow-500 px-1 rounded ml-auto">고정</span>
                  </div>
                </button>
              );
            })()}
          </div>

          <div className="flex flex-col gap-0">
            {(() => {
              const floors = Object.keys(floorTeams).map(Number).sort((a, b) => a - b);
              if (floors.length === 0) {
                // fallback: floorTeams not yet initialized, show flat list
                return teams.filter(t => !SIDEBAR_TOP_IDS.includes(t.id)).map((team) => {
                  const info = teamInfoMap[team.id];
                  return (
                    <div key={team.id} className="flex items-center gap-1">
                      <button onClick={() => handleTeamClick(team.id)}
                        className={`shrink-0 flex-1 text-left px-2.5 py-1.5 rounded text-[12px] transition-all min-h-[36px] ${
                          openWindows.includes(team.id)
                            ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                            : "text-gray-400 border border-transparent hover:bg-[#1a1a3a] active:bg-[#2a2a4a]"
                        }`}>
                        <div className="flex items-center gap-1.5">
                          <span>{team.emoji} {team.name}</span>
                          {workingSet.has(team.id) && (
                            <span className="flex items-center gap-1 ml-auto">
                              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
                              <span className="text-[8px] text-yellow-400/70">작업중</span>
                            </span>
                          )}
                          {!workingSet.has(team.id) && info?.version && <span className="text-[8px] text-gray-600 font-mono ml-auto">{info.version}</span>}
                        </div>
                      </button>
                    </div>
                  );
                });
              }
              return floors.map((floor) => {
                const teamIds = (Array.isArray(floorTeams[floor]) ? floorTeams[floor] : []).filter(id => !SIDEBAR_TOP_IDS.includes(id));
                return (
                  <div key={floor}>
                    {/* ── 층 헤더 (클릭 → 해당 층으로 이동, 드롭 → 팀 층 이동) ── */}
                    <button
                      onClick={() => gameRef.current?.changeFloor(floor)}
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("bg-blue-500/10"); }}
                      onDragLeave={(e) => { e.currentTarget.classList.remove("bg-blue-500/10"); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove("bg-blue-500/10");
                        const draggedId = e.dataTransfer.getData("text/plain");
                        if (draggedId && !PINNED_IDS.includes(draggedId)) {
                          const srcFloor = Object.entries(floorTeams).find(([, ids]) => ids.includes(draggedId));
                          const dstCount = floorTeams[floor]?.length || 0;
                          if (srcFloor && Number(srcFloor[0]) !== floor && dstCount < MAX_PER_FLOOR) {
                            moveToFloor(draggedId, floor);
                          }
                        }
                      }}
                      className="flex items-center gap-1.5 py-1.5 mt-1 w-full rounded hover:bg-[#1a1a3a] transition-colors cursor-pointer group"
                      title={`${floor}F로 이동 (클릭)`}
                    >
                      <span className="flex-1 h-px bg-[#2a2a5a] group-hover:bg-blue-500/30" />
                      <span className="text-[9px] text-gray-600 group-hover:text-blue-400 font-semibold tracking-wider whitespace-nowrap">{floor}F</span>
                      <span className="flex-1 h-px bg-[#2a2a5a] group-hover:bg-blue-500/30" />
                    </button>
                    {teamIds.map((teamId, idx) => {
                      const team = teams.find(t => t.id === teamId);
                      if (!team) return null;
                      const info = teamInfoMap[team.id];
                      const isPinned = PINNED_IDS.includes(team.id);
                      const isDropHere = dropTarget?.floor === floor && dropTarget?.index === idx;
                      return (
                        <div key={team.id}>
                          {/* 드롭 인디케이터 */}
                          {isDropHere && <div className="h-[2px] bg-blue-500 rounded mx-1 my-0.5" />}
                          <div
                            className="flex items-center gap-1"
                            draggable={!isPinned}
                            onDragStart={isPinned ? undefined : (e) => handleDragStart(e, team.id, floor)}
                            onDragEnd={isPinned ? undefined : handleDragEnd}
                            onDragOver={(e) => handleDragOver(e, floor, idx)}
                            onDrop={(e) => handleDrop(e, floor, idx)}
                          >
                            <button
                              onClick={() => handleTeamClick(team.id)}
                              className={`shrink-0 flex-1 text-left px-2.5 py-1.5 rounded text-[12px] transition-all min-h-[36px] ${
                                isPinned ? "cursor-default " : "cursor-grab active:cursor-grabbing "
                              }${
                                openWindows.includes(team.id)
                                  ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                                  : "text-gray-400 border border-transparent hover:bg-[#1a1a3a] active:bg-[#2a2a4a]"
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span>{team.emoji} {team.name}</span>
                                {workingSet.has(team.id) && (
                                  <span className="flex items-center gap-1 ml-auto">
                                    <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
                                    <span className="text-[8px] text-yellow-400/70">작업중</span>
                                  </span>
                                )}
                                {!workingSet.has(team.id) && info?.version && (
                                  <span className="text-[8px] text-gray-600 font-mono">{info.version}</span>
                                )}
                              </div>
                              {info?.last_commit_date && (
                                <div className="text-[8px] text-gray-600 mt-0.5 truncate">
                                  {formatRelativeDate(info.last_commit_date)}
                                  {info.last_commit && <span className="text-gray-700"> · {info.last_commit.slice(0, 30)}</span>}
                                </div>
                              )}
                            </button>
                            {/* 사이트 링크 */}
                            <div className="flex shrink-0 gap-0.5">
                              {team.siteUrl && (
                                <a href={team.siteUrl} target="_blank" rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-blue-400 hover:bg-[#1a1a3a] transition-all"
                                  title={`${team.name} 사이트`}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                                  </svg>
                                </a>
                              )}
                              {team.githubUrl && (
                                <a href={team.githubUrl} target="_blank" rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-gray-300 hover:bg-[#1a1a3a] transition-all"
                                  title="GitHub">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                                  </svg>
                                </a>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); setGuideTeamId(team.id); }}
                                className="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-yellow-400 hover:bg-[#1a1a3a] transition-all"
                                title={`${team.name} 가이드`}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                                </svg>
                              </button>
                              {!isPinned && (
                                <div className="relative">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setFloorDropdownTeam(floorDropdownTeam === team.id ? null : team.id); }}
                                    className="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-yellow-400 hover:bg-[#1a1a3a] transition-all"
                                    title="층 이동">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22V12h6v10"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01"/></svg>
                                  </button>
                                  {floorDropdownTeam === team.id && (
                                    <div className="absolute right-0 top-full mt-1 bg-[#1a1a2e] border border-[#3a3a5a] rounded p-1 z-50 min-w-[80px]" onClick={e => e.stopPropagation()}>
                                      {Object.keys(floorTeams).map(Number).sort((a, b) => a - b).map(f => {
                                        const isCurrent = floorTeams[f]?.includes(team.id);
                                        const isFull = (floorTeams[f]?.length || 0) >= 6 && !isCurrent;
                                        return (
                                          <button key={f} disabled={isFull || isCurrent}
                                            onClick={() => { moveToFloor(team.id, f); setFloorDropdownTeam(null); }}
                                            className={`w-full text-left text-[10px] px-2 py-1 rounded transition-colors ${
                                              isCurrent ? "text-yellow-400 bg-yellow-500/10" : isFull ? "text-gray-600 cursor-not-allowed" : "text-gray-300 hover:bg-[#2a2a4a]"
                                            }`}>
                                            <span className="whitespace-nowrap">{isCurrent ? "●" : "○"} {f}F{isFull ? " 꽉참" : ""}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                              {!isPinned && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!confirm(`${team.emoji} ${team.name} 에이전트를 삭제할까요?`)) return;
                                    await fetch(`${getApiBase()}/api/teams/${team.id}`, { method: "DELETE" });
                                    window.location.reload();
                                  }}
                                  className="w-6 h-6 flex items-center justify-center rounded text-red-500/70 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                  title="에이전트 삭제">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* 마지막 아이템 뒤 드롭 인디케이터 */}
                    {dropTarget?.floor === floor && dropTarget?.index === teamIds.length && (
                      <div className="h-[2px] bg-blue-500 rounded mx-1 my-0.5" />
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* 총괄 디스패치 (하단 채팅형) */}
        <div className="p-2 border-t border-[#2a2a5a] shrink-0">
          <DispatchChat teams={teams} onOpenChat={(id) => handleTeamClick(id)} />
        </div>

        {/* 날씨 게시판 — 숨김 (공간 확보) */}

        <div
          className="px-2.5 py-1 border-t border-[#2a2a5a] text-[8px] text-gray-700 text-center select-none cursor-default"
          onDoubleClick={async () => {
            // SW 캐시 삭제
            if (typeof caches !== "undefined") {
              const ks = await caches.keys();
              await Promise.all(ks.map(k => caches.delete(k)));
            }
            // SW 해제
            if (navigator.serviceWorker) {
              const regs = await navigator.serviceWorker.getRegistrations();
              await Promise.all(regs.map(r => r.unregister()));
            }
            // 브라우저 HTTP 캐시 우회 강제 새로고침
            window.location.href = window.location.pathname + "?v=" + Date.now();
          }}
          title="더블클릭: 새로고침 및 업데이트 반영"
        >
          Claude Code CLI · $0 · <span className="text-gray-500">v2.0</span>
        </div>
      </aside>
    </div>
  );
}
