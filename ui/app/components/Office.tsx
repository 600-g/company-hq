"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { teams as defaultTeamList, Team } from "../config/teams";
import ChatPanel, { Message, getWsStorageKey } from "./ChatPanel";
import ChatWindow from "./ChatWindow";
import WeatherBoard from "./WeatherBoard";
import type { OfficeGameHandle } from "../game/OfficeGame";

// ── 스마트 디스패치 ────────────────────────────────
type DispatchStatus = "pending" | "sending" | "working" | "done" | "skipped" | "error";
interface DispatchEntry {
  teamId: string; emoji: string; name: string;
  text: string; status: DispatchStatus; routed: boolean;
  tools: string[]; // 사용한 도구 목록
}

// 키워드 기반 라우팅
const ROUTE_KEYWORDS: Record<string, string[]> = {
  "cpo-claude": ["cpo", "전체", "회사", "조직", "보고", "총괄", "전략"],
  "trading-bot": ["매매", "트레이딩", "봇", "업비트", "코인", "수익", "전략", "시장"],
  "date-map": ["데이트", "지도", "맵", "장소", "카페", "음식"],
  "claude-biseo": ["비서", "일정", "스케줄", "메일", "알림", "정리"],
  "ai900": ["ai900", "학습", "교육", "문서", "자료"],
  "cl600g": ["cl600g", "600g", "서버", "인프라"],
  "design-team": ["디자인", "ui", "ux", "색상", "폰트", "에셋", "픽셀", "화면", "레이아웃"],
};

function routeMessage(msg: string, teams: Team[]): string[] {
  const lower = msg.toLowerCase();
  const matched: string[] = [];

  // "전체", "모두", "각 팀" 등은 전체 전송
  if (/전체|모두|각\s?팀|다\s?같이|상태\s?보고/.test(lower)) {
    return teams.filter(t => t.id !== "server-monitor").map(t => t.id);
  }

  for (const [teamId, keywords] of Object.entries(ROUTE_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      matched.push(teamId);
    }
  }

  // 매칭 없으면 CPO에게
  return matched.length > 0 ? matched : ["cpo-claude"];
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

function DispatchChat({ teams, onOpenChat }: { teams: Team[]; onOpenChat?: (teamId: string) => void }) {
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<DispatchEntry[]>([]);
  const [messages, setMessages] = useState<DispatchMessage[]>([]);
  const [sending, setSending] = useState(false);
  const wsRefs = useRef<Map<string, WebSocket>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  const getWsUrl = (teamId: string) => {
    const h = typeof window !== "undefined" ? window.location.hostname : "localhost";
    const isLocal = h === "localhost" || h.startsWith("192.168.");
    return `${isLocal ? `ws://${h}:8000` : "wss://api.600g.net"}/ws/chat/${teamId}`;
  };

  const dispatch = () => {
    if (!input.trim() || sending) return;
    const msg = input.trim();
    setInput("");
    setSending(true);

    // 유저 메시지 히스토리 추가
    setMessages(prev => [...prev, { role: "user", text: msg }]);

    const targetIds = routeMessage(msg, teams);
    const allTeams = teams.filter(t => t.id !== "server-monitor");

    // 라우팅 결과로 엔트리 생성
    const newEntries: DispatchEntry[] = allTeams.map(t => ({
      teamId: t.id, emoji: t.emoji, name: t.name, text: "",
      status: targetIds.includes(t.id) ? "pending" : "skipped",
      routed: targetIds.includes(t.id), tools: [],
    }));
    setEntries(newEntries);

    // 라우팅된 에이전트에만 전송
    let doneCount = 0;
    const targets = allTeams.filter(t => targetIds.includes(t.id));

    targets.forEach(team => {
      setEntries(prev => prev.map(e =>
        e.teamId === team.id ? { ...e, status: "sending" } : e
      ));

      const ws = new WebSocket(getWsUrl(team.id));
      wsRefs.current.set(team.id, ws);

      ws.onopen = () => {
        ws.send(JSON.stringify({ prompt: msg }));
        setEntries(prev => prev.map(e =>
          e.teamId === team.id ? { ...e, status: "working" } : e
        ));
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "status") {
            setEntries(prev => prev.map(e =>
              e.teamId === team.id ? { ...e, tools: [...e.tools, data.content] } : e
            ));
          } else if (data.type === "ai_chunk") {
            setEntries(prev => prev.map(e =>
              e.teamId === team.id ? { ...e, text: e.text + data.content } : e
            ));
          } else if (data.type === "ai_end") {
            setEntries(prev => prev.map(e =>
              e.teamId === team.id ? { ...e, status: "done" } : e
            ));
            ws.close();
          }
        } catch { /* ignore */ }
      };

      ws.onerror = () => {
        setEntries(prev => prev.map(e =>
          e.teamId === team.id ? { ...e, text: "연결 실패", status: "error" } : e
        ));
      };

      ws.onclose = () => {
        wsRefs.current.delete(team.id);
        doneCount++;
        if (doneCount >= targets.length) {
          setSending(false);
          // 완료된 응답을 히스토리에 추가
          setEntries(final => {
            final.filter(e => e.routed && e.text.trim()).forEach(e => {
              setMessages(prev => [...prev, {
                role: "agent", text: e.text, teamId: e.teamId,
                emoji: e.emoji, name: e.name, tools: e.tools, status: e.status,
              }]);
            });
            return final;
          });
          setEntries([]);
        }
      };
    });

    if (targets.length === 0) setSending(false);
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
      {/* 히스토리 + 진행중 */}
      {(messages.length > 0 || entries.length > 0) && (
        <div ref={scrollRef} className="max-h-[220px] overflow-y-auto space-y-1">
          {/* 대화 히스토리 */}
          {messages.map((m, i) => (
            m.role === "user" ? (
              <div key={i} className="text-[10px] text-yellow-400 bg-yellow-500/5 border border-yellow-500/10 rounded px-2 py-1">
                ▶ {m.text}
              </div>
            ) : (
              <div key={i}
                className="text-[10px] p-1.5 rounded border bg-[#1a1a2e] border-[#2a2a4a] cursor-pointer hover:border-yellow-500/30 transition-colors"
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
                <div className="text-gray-400 whitespace-pre-wrap text-[9px] line-clamp-3">{m.text.slice(0, 200)}{m.text.length > 200 ? "..." : ""}</div>
              </div>
            )
          ))}

          {/* 진행중인 응답 */}
          {entries.length > 0 && (
            <>
              {skipped.length > 0 && (
                <div className="text-[8px] text-gray-600 px-1">⏭ {skipped.map(e => e.emoji).join("")}</div>
              )}
              {routed.map(e => (
                <div key={e.teamId} className={`text-[10px] p-1.5 rounded border ${statusColor(e.status)}`}>
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
                    <div className="text-gray-400 whitespace-pre-wrap text-[9px] max-h-[60px] overflow-y-auto">{e.text}</div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* 입력 (Shift+Enter=줄바꿈) */}
      <form onSubmit={(e) => { e.preventDefault(); dispatch(); }} className="flex gap-1">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              dispatch();
            }
          }}
          rows={1}
          placeholder="명령 입력 (Shift+Enter 줄바꿈)..."
          className="flex-1 bg-[#1a1a2e] border border-[#3a3a5a] text-white text-[11px] px-2 py-1.5 rounded focus:outline-none focus:border-yellow-400/50 resize-none max-h-20 overflow-y-auto"
          style={{ minHeight: "32px" }}
        />
        {sending ? (
          <button type="button" onClick={() => { /* 취소: 현재 전송 중단 */ setSending(false); setInput(""); }}
            className="px-2 py-1.5 bg-red-500/20 text-red-400 text-[10px] font-bold border border-red-500/30 rounded hover:bg-red-500/30 transition-colors shrink-0"
            title="취소">
            ■
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()}
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

  const submit = async () => {
    if (!name.trim()) { setError("팀 이름을 입력하세요"); return; }
    setLoading(true);
    setError("");
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
      const data = await res.json();
      if (!data.ok) { setError(data.error || "생성 실패"); setLoading(false); return; }
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
      setError("서버 연결 실패");
      setLoading(false);
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
            {loading ? "🔄 생성중..." : "에이전트 생성"}
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
function SideMenu({ user, open, onClose, onLogout }: {
  user: AuthUser; open: boolean; onClose: () => void; onLogout: () => void;
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
                <div className="flex items-center gap-1">
                  <span className="text-sm font-semibold text-white truncate">{user.nickname}</span>
                  <button onClick={() => setEditingName(true)} className="text-[8px] text-gray-600 hover:text-gray-400">수정</button>
                </div>
              )}
              <span className="text-[9px] text-yellow-400/70">{user.permissions.label} (Lv.{user.permissions.level})</span>
            </div>
          </div>
        </div>

        {/* 메뉴 항목 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* 계정 정보 */}
          <div className="px-2 py-1">
            <h3 className="text-[8px] text-gray-600 uppercase tracking-wider mb-1">계정</h3>
          </div>
          <button onClick={() => setEditingName(true)}
            className="w-full text-left px-3 py-2 text-[11px] text-gray-400 hover:bg-[#1a2040] rounded transition-colors">
            이름 변경
          </button>

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
  const [mobileChat, setMobileChat] = useState<string | null>(null); // 모바일 풀스크린 채팅 팀 id
  const [mobileDispatch, setMobileDispatch] = useState(false); // 모바일 통합채팅
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
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

  // 에이전트 working 상태 폴링 (3초마다) → 채팅창 안 열어도 말풍선/글로우 표시
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/dashboard`);
        if (!res.ok) return;
        const data = await res.json();
        (data.agents as { id: string; working: boolean }[]).forEach(agent => {
          gameRef.current?.setWorking(agent.id, agent.working);
        });
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  const [GameComponent, setGameComponent] = useState<React.ComponentType<{
    onTeamClick: (id: string, screenX?: number, screenY?: number) => void;
    ref: React.Ref<OfficeGameHandle>;
  }> | null>(null);
  const gameRef = useRef<OfficeGameHandle>(null);

  useEffect(() => {
    import("../game/OfficeGame").then((mod) => setGameComponent(() => mod.default));
  }, []);

  const [clickPositions, setClickPositions] = useState<Record<string, { x: number; y: number }>>({});

  // ── 에이전트 패널 드래그 앤 드롭 (층별 순서) ──
  const PINNED_IDS = ["server-monitor", "cpo-claude"];
  const [floorTeams, setFloorTeams] = useState<Record<number, string[]>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("hq-floor-teams-order");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
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
      const next = { ...prev };
      // Remove from current floor
      for (const f of Object.keys(next)) {
        const fl = Number(f);
        if (next[fl]?.includes(teamId)) {
          next[fl] = next[fl].filter(id => id !== teamId);
          // 빈 층 제거
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

  // floorTeams 초기화: gameRef에서 실제 층 정보 읽어서 구성
  useEffect(() => {
    const timer = setInterval(() => {
      if (!gameRef.current || teams.length === 0) return;
      clearInterval(timer);

      const savedRaw = localStorage.getItem("hq-floor-teams-order");
      const saved: Record<number, string[]> = savedRaw ? JSON.parse(savedRaw) : {};

      // 현재 모든 팀의 층 정보 수집
      const currentFloors: Record<number, string[]> = {};
      for (const t of teams) {
        const floor = gameRef.current!.getTeamFloor(t.id) ?? 1;
        if (!currentFloors[floor]) currentFloors[floor] = [];
        currentFloors[floor].push(t.id);
      }

      // saved 순서를 존중하되, 새 팀은 끝에 추가, 삭제된 팀은 제거
      const merged: Record<number, string[]> = {};
      const allFloors = new Set([...Object.keys(currentFloors).map(Number), ...Object.keys(saved).map(Number)]);
      for (const f of allFloors) {
        const current = currentFloors[f] || [];
        const savedOrder = saved[f] || [];
        const currentSet = new Set(current);
        const ordered = savedOrder.filter(id => currentSet.has(id));
        const newIds = current.filter(id => !savedOrder.includes(id));
        const floorList = [...ordered, ...newIds];
        if (floorList.length > 0) merged[f] = floorList; // 빈 층 제거
      }
      setFloorTeams(merged);
    }, 200);
    return () => clearInterval(timer);
  }, [teams]);

  // floorTeams 변경 시 localStorage 저장
  useEffect(() => {
    if (Object.keys(floorTeams).length === 0) return;
    try {
      localStorage.setItem("hq-floor-teams-order", JSON.stringify(floorTeams));
    } catch {}
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
        // 다른 층: 층 이동
        const dstList = [...(next[targetFloor] || [])];
        const insertAt = Math.min(targetIndex, dstList.length);
        dstList.splice(insertAt, 0, drag.teamId);
        next[targetFloor] = dstList;
        // Phaser 씬에도 반영
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

  const handleTeamClick = useCallback((teamId: string, screenX?: number, screenY?: number) => {
    const mobile = typeof window !== "undefined" && window.innerWidth < 768;
    if (mobile) {
      setMobileChat(prev => prev === teamId ? null : teamId);
      setMobileDispatch(false);
      return;
    }
    if (screenX != null && screenY != null) {
      setClickPositions(prev => ({ ...prev, [teamId]: { x: screenX, y: screenY } }));
    }
    setOpenWindows(prev => {
      if (prev.includes(teamId)) {
        return prev.filter(id => id !== teamId);
      }
      return [...prev, teamId];
    });
    setFocusedWindow(teamId);
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
      {showAddModal && <AddTeamModal onClose={() => setShowAddModal(false)} onCreated={handleAddTeam} />}
      {guideTeamId && <GuideModal teamId={guideTeamId} onClose={() => setGuideTeamId(null)} />}
      {user && onLogout && <SideMenu user={user} open={showMenu} onClose={() => setShowMenu(false)} onLogout={onLogout} />}
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

        {/* Phaser — 모바일에서 채팅 열리면 축소 */}
        <main className={`relative min-h-0 md:flex-1 ${(mobileChat || mobileDispatch) ? "h-[35%] shrink-0" : "flex-1"}`}>
          {GameComponent ? (
            <GameComponent ref={gameRef} onTeamClick={handleTeamClick} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-xs text-gray-500">🏢 사무실 로딩중...</p>
            </div>
          )}
        </main>

        {/* ── 모바일 인라인 채팅 (사무실 아래, 하단바 위) ── */}
        {mobileChat && (() => {
          const team = teams.find(t => t.id === mobileChat);
          if (!team) return null;
          return (
            <div className="md:hidden flex-1 flex flex-col min-h-0 border-t border-[#2a2a5a] bg-[#0a0a18]">
              {/* 채팅 헤더 */}
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#0e0e20] border-b border-[#2a2a5a] shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{team.emoji}</span>
                  <span className="text-xs font-semibold text-white">{team.name}</span>
                </div>
                <button onClick={() => setMobileChat(null)} className="text-gray-500 hover:text-white text-[10px] px-2 py-0.5 rounded bg-[#1a1a3a]">닫기</button>
              </div>
              {/* 채팅 본문 */}
              <div className="flex-1 min-h-0">
                <ChatPanel
                  team={team}
                  onClose={() => setMobileChat(null)}
                  onWorkingChange={(working) => handleWorkingChange(team.id, working)}
                  inline={true}
                  messages={chatHistory[team.id] || []}
                  onMessages={(msgs) => setChatHistory(prev => ({ ...prev, [team.id]: msgs }))}
                />
              </div>
            </div>
          );
        })()}

        {/* ── 모바일 인라인 통합채팅 ── */}
        {mobileDispatch && !mobileChat && (
          <div className="md:hidden flex-1 flex flex-col min-h-0 border-t border-[#2a2a5a] bg-[#0a0a18]">
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#0e0e20] border-b border-[#2a2a5a] shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm">📡</span>
                <span className="text-xs font-semibold text-white">통합 채팅</span>
              </div>
              <button onClick={() => setMobileDispatch(false)} className="text-gray-500 hover:text-white text-[10px] px-2 py-0.5 rounded bg-[#1a1a3a]">닫기</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <DispatchChat teams={teams} onOpenChat={(id) => { setMobileDispatch(false); setMobileChat(id); }} />
            </div>
          </div>
        )}

        {/* ── 모바일 하단 에이전트 바 ── */}
        <div className="md:hidden border-t border-[#2a2a5a] bg-[#0e0e20] px-2 pt-2 shrink-0" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
            {/* 통합채팅 버튼 */}
            <button
              onClick={() => { setMobileDispatch(v => !v); setMobileChat(null); }}
              className={`shrink-0 flex items-center gap-1 px-3 py-2.5 rounded-full text-[12px] font-medium transition-all ${
                mobileDispatch
                  ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                  : "bg-[#1a1a3a] text-purple-400/60 border border-[#2a2a5a] active:bg-[#2a2a4a]"
              }`}
            >
              <span>📡</span>
              <span className="whitespace-nowrap">통합</span>
            </button>
            {teams.filter(t => t.id !== "server-monitor").map(team => (
              <button
                key={team.id}
                onClick={() => handleTeamClick(team.id)}
                className={`shrink-0 flex items-center gap-1 px-3 py-2.5 rounded-full text-[12px] font-medium transition-all ${
                  mobileChat === team.id
                    ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
                    : "bg-[#1a1a3a] text-gray-400 border border-[#2a2a5a] active:bg-[#2a2a4a]"
                }`}
              >
                <span>{team.emoji}</span>
                <span className="whitespace-nowrap">{team.name}</span>
              </button>
            ))}
            <button
              onClick={() => setShowAddModal(true)}
              className="shrink-0 flex items-center gap-1 px-3 py-2.5 rounded-full text-[12px] bg-[#1a1a3a] text-yellow-400/60 border border-dashed border-yellow-500/20 active:bg-[#2a2a4a]"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* ── 채팅 윈도우들 (PC만, 팀 위치 기반) ── */}
      {openWindows.map((teamId, idx) => {
        const team = teams.find(t => t.id === teamId);
        if (!team) return null;
        const cp = clickPositions[teamId];
        const baseX = cp ? Math.min(cp.x, window.innerWidth - 400) : 120 + (idx % 3) * 140;
        const baseY = cp ? Math.max(40, Math.min(cp.y - 60, window.innerHeight - 460)) : 40 + idx * 40;
        return (
          <ChatWindow
            key={teamId}
            team={team}
            messages={chatHistory[teamId] || []}
            onMessages={(msgs) => setChatHistory(prev => ({ ...prev, [teamId]: msgs }))}
            onClose={() => setOpenWindows(prev => prev.filter(id => id !== teamId))}
            onWorkingChange={(working) => handleWorkingChange(teamId, working)}
            onFocus={() => setFocusedWindow(teamId)}
            zIndex={focusedWindow === teamId ? openWindows.length + 1 : idx + 1}
            initialX={baseX}
            initialY={baseY}
          />
        );
      })}

      {/* ── 우측 패널 (PC만) ── */}
      <aside className="hidden md:flex md:w-[360px] h-full bg-[#12122a] border-l border-[#2a2a5a] flex-col shrink-0 overflow-hidden">
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
          <div className="flex flex-col gap-0">
            {(() => {
              const floors = Object.keys(floorTeams).map(Number).sort((a, b) => a - b);
              if (floors.length === 0) {
                // fallback: floorTeams not yet initialized, show flat list
                return teams.map((team) => {
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
                          {info?.version && <span className="text-[8px] text-gray-600 font-mono">{info.version}</span>}
                        </div>
                      </button>
                    </div>
                  );
                });
              }
              return floors.map((floor) => {
                const teamIds = floorTeams[floor] || [];
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
                          if (srcFloor && Number(srcFloor[0]) !== floor) {
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
                                {info?.version && (
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
                                    className="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-yellow-400 hover:bg-[#1a1a3a] transition-all text-[10px]"
                                    title="층 이동">
                                    🏢
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
                                  className="w-6 h-6 flex items-center justify-center rounded text-gray-700 hover:text-red-400 hover:bg-red-500/10 transition-all"
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
