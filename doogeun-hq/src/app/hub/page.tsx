"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Modal from "@/components/Modal";
import Weather, { useWeatherStore } from "@/components/Weather";
import { useAgentStore, type Agent } from "@/stores/agentStore";
import { useAuthStore } from "@/stores/authStore";
import { apiBase } from "@/lib/utils";
import {
  X, Users, Bug, Cpu, Settings, LogOut, Send,
  MessagesSquare, Plus, Home as HomeIcon, RefreshCw, ChevronRight, ChevronLeft,
} from "lucide-react";
import { useThemeStore } from "@/stores/themeStore";
import AgentCreate from "@/components/AgentCreate";
import { useConfirm } from "@/components/Confirm";
import { initDiag, getRecentLogs } from "@/lib/diag";
import { BellButton } from "@/components/NotifyRoot";
import { useNotifStore } from "@/stores/notifyStore";

const HubOffice = dynamic(() => import("@/components/HubOffice"), { ssr: false });

interface HubMsg {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  agentEmoji?: string;
  agentName?: string;
  ts: number;
  images?: string[];  // data URLs (사용자 메시지 첨부)
}

type ModalKey = null | "agents" | "server" | "bugs" | "settings" | "newAgent";

export default function HubPage() {
  const router = useRouter();
  const agents = useAgentStore((s) => s.agents);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const fetchWx = useWeatherStore((s) => s.fetch);
  const tod = useWeatherStore((s) => s.tod);
  const ambientTint = useWeatherStore((s) => s.ambientTint);

  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [floor, setFloor] = useState(1);
  const [modalKey, setModalKey] = useState<ModalKey>(null);

  // 테마 저장된 값 HTML 속성에 반영 (persist hydrate 이후)
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<HubMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [composing, setComposing] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const notifyPush = useNotifStore((s) => s.push);
  const selected = agents.find((a) => a.id === selectedAgentId) ?? null;

  const addImage = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setAttachedImages((p) => [...p, reader.result as string].slice(0, 4));
    reader.readAsDataURL(file);
  };

  useEffect(() => { fetchWx(); initDiag(); }, [fetchWx]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if ((!input.trim() && attachedImages.length === 0) || !selected) return;
    const msg: HubMsg = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      ts: Date.now(),
      images: attachedImages.length > 0 ? [...attachedImages] : undefined,
    };
    setMessages((p) => [...p, msg]);
    setInput("");
    setAttachedImages([]);
    setSending(true);
    try {
      await fetch(`${apiBase()}/api/chat/${selected.id}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: msg.content,
          images: msg.images,
        }),
      });
      setTimeout(async () => {
        try {
          const h = await fetch(`${apiBase()}/api/chat/${selected.id}/history`);
          const d = await h.json();
          const last = (d.messages || []).filter((m: { role?: string }) => m.role === "assistant").slice(-1)[0];
          if (last) {
            setMessages((p) => [...p, {
              id: crypto.randomUUID(), role: "agent", content: last.content,
              agentEmoji: selected.emoji, agentName: selected.name, ts: Date.now(),
            }]);
            notifyPush("success", `${selected.emoji} ${selected.name} 응답 도착`, last.content.slice(0, 120), "chat");
          }
        } catch {}
        setSending(false);
      }, 2000);
    } catch {
      setMessages((p) => [...p, {
        id: crypto.randomUUID(), role: "system",
        content: "⚠️ 백엔드 연결 실패 (localhost:8000)", ts: Date.now(),
      }]);
      notifyPush("error", "백엔드 연결 실패", "FastAPI 서버(localhost:8000) 가 켜져있는지 확인", "chat");
      setSending(false);
    }
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden">
      {/* 좌측 사이드 — collapsible (아이콘 only ↔ 풀) */}
      <aside
        className={`shrink-0 flex flex-col border-r border-gray-800/70 bg-[#0b0b14] transition-[width] duration-200 ${
          sideCollapsed ? "w-16" : "w-60"
        }`}
      >
        <div className="h-12 flex items-center justify-between border-b border-gray-800/60 px-3 shrink-0">
          {!sideCollapsed && (
            <Link href="/" className="flex items-center gap-1.5 text-[13px] font-bold text-sky-300 hover:text-gray-200">
              <HomeIcon className="w-3.5 h-3.5" />
              <span className="truncate">두근컴퍼니</span>
            </Link>
          )}
          <button
            onClick={() => setSideCollapsed((v) => !v)}
            className={`text-gray-500 hover:text-gray-200 ${sideCollapsed ? "mx-auto" : ""}`}
            title={sideCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
          >
            {sideCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          <SideItem collapsed={sideCollapsed} icon={Users} label="에이전트" badge={agents.length} onClick={() => setModalKey("agents")} />
          <SideItem collapsed={sideCollapsed} icon={Cpu} label="서버실" onClick={() => setModalKey("server")} />
          <SideItem collapsed={sideCollapsed} icon={Bug} label="버그 리포트" onClick={() => setModalKey("bugs")} />
          <SideItem collapsed={sideCollapsed} icon={Settings} label="설정" onClick={() => router.push("/settings")} />
          <div className="h-px bg-gray-800/60 my-2" />
          <SideItem collapsed={sideCollapsed} icon={RefreshCw} label="강제 새로고침" onClick={() => {
            const keep = ["doogeun-hq-auth", "doogeun-hq-settings", "doogeun-hq-agents"];
            const keepMap: Record<string, string> = {};
            keep.forEach((k) => { const v = localStorage.getItem(k); if (v !== null) keepMap[k] = v; });
            Object.keys(localStorage).forEach((k) => { if (!(k in keepMap)) localStorage.removeItem(k); });
            location.reload();
          }} />
          <SideItem
            collapsed={sideCollapsed}
            icon={LogOut}
            label={user ? `로그아웃 (${user.nickname})` : "로그인"}
            onClick={() => { if (user) { logout(); router.push("/"); } else router.push("/auth"); }}
          />
        </nav>

        {!sideCollapsed && (
          <div className="p-3 border-t border-gray-800/60 text-[10px] text-gray-600 font-mono">
            <div>{user ? `${user.nickname} · ${user.role}` : "게스트"}</div>
            <div className="mt-0.5 text-gray-700">TOD: {tod}</div>
          </div>
        )}
      </aside>

      {/* 중앙 메인 — 오피스 (구 두근컴퍼니 크기 ~1024×736) */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 상단 얇은 바 — 날씨 + 알림 벨 */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-gray-800/60 shrink-0">
          <Weather compact />
          <BellButton />
        </div>

        {/* 오피스 캔버스 + 층 선택 — 최대한 확대, 빈 공간 최소 */}
        <div className="flex-1 flex items-stretch p-2 overflow-hidden relative gap-2">
          {/* 층 세로 스택 — 오피스 왼쪽 */}
          <div className="flex flex-col gap-2 shrink-0 self-center">
            {[1, 2, 3].map((f) => (
              <button
                key={f}
                onClick={() => setFloor(f)}
                className={`h-11 w-11 flex items-center justify-center rounded-md text-[14px] font-bold transition-all ${
                  floor === f
                    ? "bg-sky-500/15 text-gray-100 border border-sky-400/50"
                    : "border border-gray-800 text-gray-400 hover:text-gray-100 hover:border-gray-600 bg-gray-900/40"
                }`}
                title={`${f}층`}
              >
                {f}F
              </button>
            ))}
          </div>

          {/* 캔버스 — 남은 공간 최대한 + 1024/736 종횡비 유지 */}
          <div className="flex-1 flex items-center justify-center min-w-0 min-h-0">
            <div
              className="relative rounded-xl border border-gray-800/60 bg-[#06060e] overflow-hidden shadow-2xl"
              style={{
                width: "100%",
                height: "100%",
                maxWidth: "1400px",
                maxHeight: "100%",
                aspectRatio: "1024/736",
              }}
            >
              <HubOffice floor={floor} agentCount={agents.length} />
              {/* 엠비언트 틴트 — 캔버스 내부만 */}
              <div
                className="absolute inset-0 pointer-events-none transition-colors duration-[2s]"
                style={{ background: ambientTint }}
              />
            </div>
          </div>
        </div>

      </main>

      {/* 우측 채팅 패널 — collapsible */}
      <aside
        className={`shrink-0 flex flex-col border-l border-gray-800/70 bg-[#0b0b14] transition-[width] duration-200 ${
          chatOpen ? "w-80" : "w-0"
        } overflow-hidden`}
      >
        <div className="h-12 flex items-center justify-between px-3 border-b border-gray-800/60 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessagesSquare className="w-4 h-4 text-sky-300 shrink-0" />
            <span className="text-[13px] font-bold text-gray-200 truncate">
              {selected ? `${selected.emoji} ${selected.name}` : "채팅"}
            </span>
          </div>
          <button onClick={() => setChatOpen(false)} className="text-gray-500 hover:text-gray-200 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {agents.length > 0 && (
          <div className="p-2 border-b border-gray-800/60">
            <select
              value={selectedAgentId || ""}
              onChange={(e) => { setSelectedAgentId(e.target.value || null); setMessages([]); }}
              className="w-full h-8 rounded-md border border-gray-700 bg-gray-900/60 px-2 text-[12px] text-gray-200"
            >
              <option value="">에이전트 선택...</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>
              ))}
            </select>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {messages.length === 0 && (
            <div className="py-10 text-center text-[12px] text-gray-500">
              {selected ? "메시지 입력으로 시작" : agents.length === 0 ? "에이전트가 없어요 — 사이드바 [새 에이전트]" : "위에서 에이전트 선택"}
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-[12px] leading-relaxed ${
                m.role === "user"
                  ? "rounded-br-md bg-[var(--chat-user-bg)] border border-[var(--chat-user-border)] text-[var(--chat-user-text)]"
                  : m.role === "system"
                  ? "rounded-bl-md bg-red-500/10 border border-red-400/30 text-red-200"
                  : "rounded-bl-md bg-[var(--chat-ai-bg)] border border-[var(--chat-ai-border)] text-[var(--chat-ai-text)]"
              }`}>
                {m.role === "agent" && <div className="text-[10px] text-gray-400 mb-1">{m.agentEmoji} {m.agentName}</div>}
                {m.images && m.images.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {m.images.map((src, j) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={j} src={src} alt="" className="max-h-40 rounded border border-gray-700 object-contain" />
                    ))}
                  </div>
                )}
                {m.content && <div className="whitespace-pre-wrap break-words">{m.content}</div>}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded-2xl rounded-bl-md bg-[var(--chat-ai-bg)] border border-[var(--chat-ai-border)]">
                <span className="inline-flex gap-1 items-center text-gray-400 text-[12px]">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 이미지 첨부 프리뷰 */}
        {attachedImages.length > 0 && (
          <div className="flex gap-1.5 px-2 pt-2 flex-wrap">
            {attachedImages.map((src, i) => (
              <div key={i} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-14 rounded border border-gray-700 object-cover" />
                <button
                  onClick={() => setAttachedImages((p) => p.filter((_, j) => j !== i))}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500/90 text-white text-[9px] font-bold"
                >×</button>
              </div>
            ))}
          </div>
        )}

        <div
          className="p-2 border-t border-gray-800/60 flex gap-2 shrink-0 items-center"
          onDragOver={(e) => { if (selected) e.preventDefault(); }}
          onDrop={(e) => {
            if (!selected) return;
            e.preventDefault();
            for (const f of Array.from(e.dataTransfer.files)) addImage(f);
          }}
        >
          <label className="shrink-0 h-9 w-9 flex items-center justify-center rounded-md text-gray-500 hover:text-sky-200 hover:bg-gray-800/40 cursor-pointer transition-colors" title="이미지 첨부">
            <Plus className="w-4 h-4" />
            <input type="file" accept="image/*" multiple onChange={(e) => { for (const f of Array.from(e.target.files || [])) addImage(f); e.target.value = ""; }} className="hidden" />
          </label>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              for (const it of Array.from(e.clipboardData.items)) {
                if (it.kind === "file" && it.type.startsWith("image/")) {
                  const f = it.getAsFile();
                  if (f) addImage(f);
                }
              }
            }}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onKeyDown={(e) => {
              if (composing || e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder={selected ? "시킬 일 입력 · ⌘+V 이미지" : "에이전트 선택 필요"}
            disabled={!selected}
            className="flex-1 h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-400/40 disabled:opacity-40"
          />
          <Button onClick={send} disabled={(!input.trim() && attachedImages.length === 0) || !selected || sending} size="sm">
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </aside>

      {/* 채팅 닫혔을 때 열기 핸들 */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="absolute right-0 top-1/2 -translate-y-1/2 h-24 w-6 rounded-l-lg bg-gray-900/90 border-l border-y border-gray-800/80 flex items-center justify-center text-gray-400 hover:text-gray-200 hover:border-sky-400/30 transition-all z-20"
          title="채팅 펴기"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      {/* 모달들 */}
      <Modal open={modalKey === "agents"} onClose={() => setModalKey(null)} title="에이전트 목록" subtitle={`${agents.length}명 등록`}>
        <AgentsModalBody
          agents={agents}
          onNew={() => setModalKey("newAgent")}
          onSelect={(a) => {
            setSelectedAgentId(a.id);
            setMessages([]);
            setModalKey(null);
            setChatOpen(true);
          }}
        />
      </Modal>
      <Modal open={modalKey === "newAgent"} onClose={() => setModalKey(null)} title="에이전트 추가" subtitle="빠르게 (AI 초안) / 고도화 프로젝트" widthClass="max-w-2xl">
        <AgentCreate onDone={() => setModalKey("agents")} />
      </Modal>
      <Modal open={modalKey === "server"} onClose={() => setModalKey(null)} title="서버실" subtitle="실시간 상태 (3초 폴링)">
        <ServerBody />
      </Modal>
      <Modal open={modalKey === "bugs"} onClose={() => setModalKey(null)} title="버그 리포트" subtitle="이슈 리스트 / 리포트 작성" widthClass="max-w-2xl">
        <BugsBody />
      </Modal>
    </div>
  );
}

function SideItem({ collapsed, icon: Icon, label, onClick, badge, active }: {
  collapsed: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  badge?: number;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[14px] transition-colors ${
        active
          ? "bg-sky-500/10 text-gray-200"
          : "text-gray-300 hover:bg-gray-800/50 hover:text-gray-200"
      }`}
    >
      <Icon className="w-[18px] h-[18px] shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 text-left truncate">{label}</span>
          {badge != null && badge > 0 && <Badge variant="secondary">{badge}</Badge>}
        </>
      )}
    </button>
  );
}


function AgentsModalBody({ agents, onNew, onSelect }: { agents: Agent[]; onNew: () => void; onSelect: (a: Agent) => void }) {
  const removeAgent = useAgentStore((s) => s.removeAgent);
  const confirm = useConfirm();
  return (
    <div className="p-5">
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={onNew}>
          <Plus className="w-3.5 h-3.5 mr-1" /> 새로 추가
        </Button>
      </div>
      {agents.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-gray-500">에이전트가 없습니다. 위에서 추가하세요.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {agents.map((a) => (
            <div
              key={a.id}
              className="group p-3 rounded-lg border border-gray-800/60 bg-gray-900/30 hover:bg-gray-800/40 hover:border-sky-400/30 transition-all"
            >
              <div className="flex items-start gap-2">
                <button onClick={() => onSelect(a)} className="text-2xl" title="채팅 열기">{a.emoji}</button>
                <button onClick={() => onSelect(a)} className="flex-1 min-w-0 text-left">
                  <div className="text-[13px] text-gray-100 font-bold truncate">{a.name}</div>
                  <div className="text-[11px] text-gray-500 truncate">{a.role}</div>
                </button>
                <Badge variant={a.status === "working" ? "warning" : a.status === "error" ? "destructive" : "secondary"}>
                  {a.status}
                </Badge>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const ok = await confirm({
                      title: "에이전트 삭제",
                      message: `"${a.name}" 를 삭제할까요?\n대화/상태/MD 프롬프트 전부 사라져요.`,
                      confirmText: "삭제",
                      destructive: true,
                    });
                    if (ok) removeAgent(a.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity shrink-0"
                  title="삭제"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewAgentBody({ onDone }: { onDone: () => void }) {
  const addAgent = useAgentStore((s) => s.addAgent);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🤖");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [systemPromptMd, setSystemPromptMd] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [githubRepo, setGithubRepo] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !role.trim()) return;
    addAgent({
      name: name.trim(), emoji: emoji.trim() || "🤖", role: role.trim(),
      description: description.trim(), systemPromptMd,
      workingDirectory: workingDirectory.trim() || undefined,
      githubRepo: githubRepo.trim() || undefined,
    });
    onDone();
  };

  return (
    <form onSubmit={submit} className="p-5 space-y-3">
      <div className="flex gap-2">
        <input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="w-16 h-9 text-center text-lg rounded-md border border-gray-700 bg-gray-900/60 text-gray-100" maxLength={2} placeholder="🤖" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: 디자인팀)" required className="flex-1 h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500" />
      </div>
      <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="역할 (예: UI/UX · 에셋)" required className="w-full h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500" />
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="설명 (짧게)" className="w-full h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500" />
      <div className="grid grid-cols-2 gap-2">
        <input value={workingDirectory} onChange={(e) => setWorkingDirectory(e.target.value)} placeholder="작업 디렉토리" className="h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500" />
        <input value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} placeholder="owner/repo" className="h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500" />
      </div>
      <div>
        <label className="text-[12px] text-gray-400">시스템 프롬프트 (MD)</label>
        <textarea
          value={systemPromptMd}
          onChange={(e) => setSystemPromptMd(e.target.value)}
          rows={6}
          placeholder="# 디자인팀&#10;&#10;## 역할&#10;- ..."
          className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 font-mono focus:outline-none focus:ring-1 focus:ring-sky-400/40"
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit">만들기</Button>
      </div>
    </form>
  );
}

interface ServerStat { cpu?: number; mem?: number; disk?: number; processes?: number }

function ServerBody() {
  const [status, setStatus] = useState<ServerStat>({});
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const r = await fetch(`${apiBase()}/api/dashboard`);
        const d = await r.json();
        if (!stop) setStatus(d || {});
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { stop = true; clearInterval(id); };
  }, []);
  return (
    <div className="p-5 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="CPU" value={status.cpu != null ? `${status.cpu}%` : "-"} />
        <Stat label="MEM" value={status.mem != null ? `${status.mem}%` : "-"} />
        <Stat label="DISK" value={status.disk != null ? `${status.disk}%` : "-"} />
        <Stat label="PROC" value={status.processes != null ? `${status.processes}` : "-"} />
      </div>
      <pre className="p-2 rounded bg-black/40 border border-gray-800 text-[11px] text-gray-400 font-mono overflow-x-auto">
{JSON.stringify(status, null, 2)}
      </pre>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg border border-gray-800/60 bg-gray-900/40">
      <div className="text-[10px] text-gray-500 uppercase font-bold">{label}</div>
      <div className="text-lg font-bold text-gray-200">{value}</div>
    </div>
  );
}

interface BugRow {
  ts: string;
  title: string;
  note: string;
  issue_number?: number;
  urgent?: boolean;
  status?: "open" | "in_progress" | "resolved" | "closed";
  resolved?: boolean;
  images?: string[];
  comments?: { ts: string; author: string; text: string }[];
}

type BugFilter = "open" | "in_progress" | "resolved" | "all";

function BugsBody() {
  const [rows, setRows] = useState<BugRow[]>([]);
  const [note, setNote] = useState("");
  const [title, setTitle] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [images, setImages] = useState<string[]>([]);      // data URLs (미리보기용)
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<BugFilter>("open");

  const load = async () => {
    try {
      const statusParam = filter === "all" ? "all" : filter;
      const r = await fetch(`${apiBase()}/api/diag/reports?status=${statusParam}`);
      const d = await r.json();
      const list: BugRow[] = (d.rows || []).slice().reverse();
      // status 기본값 세팅 (백엔드가 보내지 않으면 open)
      setRows(list.map((r: BugRow) => ({
        ...r,
        status: r.status || (r.resolved ? "resolved" : "open"),
      })));
    } catch { setRows([]); }
  };
  useEffect(() => { load(); }, [filter]);

  const addImage = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImages((p) => [...p, dataUrl].slice(0, 4));  // 최대 4장
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    for (const it of Array.from(e.clipboardData.items)) {
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) addImage(f);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    for (const f of Array.from(e.dataTransfer.files)) {
      if (f.type.startsWith("image/")) addImage(f);
    }
  };

  const submit = async () => {
    if (!note.trim()) return;
    setSending(true);
    try {
      // 현재 링 버퍼 로그 자동 동봉
      const logs = getRecentLogs(200).map((l) => ({ level: l.level, msg: l.msg, ts: l.ts }));
      await fetch(`${apiBase()}/api/diag/report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          note: note.trim(),
          urgent,
          logs,
          images,
        }),
      });
      setNote(""); setTitle(""); setUrgent(false); setImages([]);
      await load();
    } finally { setSending(false); }
  };

  return (
    <div className="p-5 space-y-4">
      {/* 작성 폼 */}
      <div
        onPaste={handlePaste}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="p-3 rounded-lg border border-gray-800/60 bg-gray-900/20 space-y-2"
      >
        <div className="text-[12px] text-gray-400 font-bold">🎫 티켓 작성</div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목 (비우면 본문에서 자동 추출)"
          className="w-full h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="무슨 일? (⌘+V 이미지 붙여넣기 / 드래그-드롭 가능)"
          className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
        />
        {images.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <div key={i} className="relative">
                <img src={src} alt="" className="h-20 rounded border border-gray-700 object-cover" />
                <button
                  onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/90 text-white text-[10px] font-bold"
                >×</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[12px] text-gray-300 cursor-pointer">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="accent-red-400" />
              긴급
            </label>
            <label className="flex items-center gap-1.5 text-[12px] text-sky-300 hover:text-sky-200 cursor-pointer">
              📎 파일 첨부
              <input type="file" accept="image/*" multiple onChange={(e) => { for (const f of Array.from(e.target.files || [])) addImage(f); e.target.value = ""; }} className="hidden" />
            </label>
            <span className="text-[10px] text-gray-500">로그 자동 동봉 (토큰 X · 클라 메모리)</span>
          </div>
          <Button size="sm" onClick={submit} disabled={!note.trim() || sending}>
            {sending ? "전송 중..." : "티켓 제출"}
          </Button>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex gap-1 p-1 bg-gray-900/60 rounded border border-gray-800">
        {(["open", "in_progress", "resolved", "all"] as BugFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`flex-1 text-[12px] py-1.5 rounded transition-colors ${
              filter === s ? "bg-sky-500/15 text-gray-200 font-bold" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {s === "open" ? "열림" : s === "in_progress" ? "진행" : s === "resolved" ? "해결" : "전체"}
          </button>
        ))}
      </div>

      {/* 리스트 */}
      <div className="space-y-1.5">
        {rows.length === 0 ? (
          <div className="text-[12px] text-gray-500 text-center py-6">없음</div>
        ) : rows.slice(0, 30).map((r, i) => (
          <TicketRow key={i} row={r} />
        ))}
      </div>
    </div>
  );
}

function TicketRow({ row }: { row: BugRow }) {
  const [open, setOpen] = useState(false);
  const statusBadge = {
    open: { variant: "warning" as const, label: "열림" },
    in_progress: { variant: "default" as const, label: "진행 중" },
    resolved: { variant: "success" as const, label: "해결됨" },
    closed: { variant: "secondary" as const, label: "닫힘" },
  }[row.status || "open"];

  return (
    <div className="rounded-lg border border-gray-800/60 bg-gray-900/20">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-gray-800/20 transition-colors"
      >
        <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
        {row.urgent && <Badge variant="destructive">긴급</Badge>}
        <span className="text-[13px] text-gray-200 truncate flex-1">{row.title}</span>
        {row.issue_number != null && (
          <a
            href={`https://github.com/600-g/company-hq/issues/${row.issue_number}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] text-cyan-400 hover:underline shrink-0"
          >
            #{row.issue_number}
          </a>
        )}
      </button>
      {open && (
        <div className="border-t border-gray-800/60 p-3 space-y-2">
          <div className="text-[11px] text-gray-500 font-mono">{row.ts}</div>
          {row.note && <div className="text-[12px] text-gray-300 whitespace-pre-wrap">{row.note}</div>}
          {row.images && row.images.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {row.images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="h-24 rounded border border-gray-700 object-cover" />
              ))}
            </div>
          )}
          {row.comments && row.comments.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-gray-800/60">
              <div className="text-[11px] text-gray-500 font-bold">팔로업 ({row.comments.length})</div>
              {row.comments.map((c, i) => (
                <div key={i} className="text-[11px] text-gray-400">
                  <span className="font-mono">{c.ts}</span> · <span className="text-sky-300">{c.author}</span> · {c.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
