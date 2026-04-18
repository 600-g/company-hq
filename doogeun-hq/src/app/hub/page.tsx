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
  Menu, X, Users, Bug, Cpu, Settings, LogOut, Send,
  MessagesSquare, Plus, Home as HomeIcon, RefreshCw, ChevronRight,
} from "lucide-react";

const HubOffice = dynamic(() => import("@/components/HubOffice"), { ssr: false });

interface HubMsg {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  agentEmoji?: string;
  agentName?: string;
  ts: number;
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

  const [sideOpen, setSideOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [floor, setFloor] = useState(1);
  const [modalKey, setModalKey] = useState<ModalKey>(null);

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<HubMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selected = agents.find((a) => a.id === selectedAgentId) ?? null;

  useEffect(() => { fetchWx(); }, [fetchWx]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || !selected) return;
    const msg: HubMsg = { id: crypto.randomUUID(), role: "user", content: input.trim(), ts: Date.now() };
    setMessages((p) => [...p, msg]);
    setInput("");
    setSending(true);
    try {
      await fetch(`${apiBase()}/api/chat/${selected.id}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: msg.content }),
      });
      setTimeout(async () => {
        try {
          const h = await fetch(`${apiBase()}/api/chat/${selected.id}/history`);
          const d = await h.json();
          const last = (d.messages || []).filter((m: { role?: string }) => m.role === "assistant").slice(-1)[0];
          if (last) setMessages((p) => [...p, {
            id: crypto.randomUUID(), role: "agent", content: last.content,
            agentEmoji: selected.emoji, agentName: selected.name, ts: Date.now(),
          }]);
        } catch {}
        setSending(false);
      }, 2000);
    } catch {
      setMessages((p) => [...p, {
        id: crypto.randomUUID(), role: "system",
        content: "⚠️ 백엔드 연결 실패 (localhost:8000)", ts: Date.now(),
      }]);
      setSending(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden relative flex flex-col">
      {/* 상단 미니 헤더 — 로고 + 날씨 + 층 + 메뉴 */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 py-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => setSideOpen((v) => !v)}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-800/80 bg-gray-900/80 backdrop-blur text-gray-300 hover:text-blue-300 hover:border-blue-400/50 transition-all"
          >
            <Menu className="w-4 h-4" />
          </button>
          <Link href="/" className="h-9 px-3 flex items-center rounded-lg border border-gray-800/80 bg-gray-900/80 backdrop-blur text-blue-300 font-bold text-[13px] hover:text-blue-200 transition-colors">
            <HomeIcon className="w-3.5 h-3.5 mr-1.5" />
            두근컴퍼니 HQ
          </Link>
          <div className="h-9 px-3 flex items-center rounded-lg border border-gray-800/80 bg-gray-900/80 backdrop-blur">
            <Weather compact />
          </div>
        </div>
        <div className="flex items-center gap-1 pointer-events-auto">
          {[1, 2, 3].map((f) => (
            <button
              key={f}
              onClick={() => setFloor(f)}
              className={`h-9 w-9 flex items-center justify-center rounded-lg border text-[13px] font-bold transition-all backdrop-blur ${
                floor === f
                  ? "border-blue-400/60 bg-blue-500/20 text-blue-200"
                  : "border-gray-800/80 bg-gray-900/80 text-gray-400 hover:text-gray-200"
              }`}
            >
              {f}F
            </button>
          ))}
        </div>
      </header>

      {/* 메인 영역 */}
      <main className="flex-1 relative overflow-hidden">
        {/* Phaser 오피스 씬 (전체 배경) */}
        <div className="absolute inset-0 bg-[#06060e]">
          <HubOffice floor={floor} agentCount={agents.length} />
        </div>

        {/* 엠비언트 틴트 (밤/비/눈) */}
        <div
          className="absolute inset-0 pointer-events-none transition-colors duration-[2s]"
          style={{ background: ambientTint }}
        />

        {/* 오버레이 플로팅 버튼 — 서버실/버그/에이전트/설정 */}
        <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2">
          <FloatBtn label="에이전트" icon={Users} onClick={() => setModalKey("agents")} badge={agents.length} />
          <FloatBtn label="서버실" icon={Cpu} onClick={() => setModalKey("server")} />
          <FloatBtn label="버그" icon={Bug} onClick={() => setModalKey("bugs")} />
          <FloatBtn label="설정" icon={Settings} onClick={() => setModalKey("settings")} />
          <FloatBtn
            label={chatOpen ? "채팅 숨김" : "채팅 열기"}
            icon={MessagesSquare}
            onClick={() => setChatOpen((v) => !v)}
            active={chatOpen}
          />
        </div>

        {/* 오른쪽 채팅 슬라이드 패널 */}
        <aside
          className={`absolute top-0 right-0 h-full z-10 transition-transform duration-300 ${
            chatOpen ? "translate-x-0" : "translate-x-full"
          }`}
          style={{ width: "380px" }}
        >
          <div className="h-full flex flex-col border-l border-gray-800/80 bg-[#0b0b14]/95 backdrop-blur">
            <div className="p-3 border-b border-gray-800/60 pt-14">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] text-gray-200 font-bold">💬 채팅</div>
                  <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                    {selected ? `${selected.emoji} ${selected.name}` : "좌측에서 에이전트 선택"}
                  </div>
                </div>
                <button onClick={() => setChatOpen(false)} className="text-gray-500 hover:text-gray-200">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {agents.length > 0 && (
                <select
                  value={selectedAgentId || ""}
                  onChange={(e) => { setSelectedAgentId(e.target.value || null); setMessages([]); }}
                  className="mt-2 w-full h-8 rounded-md border border-gray-700 bg-gray-900/60 px-2 text-[12px] text-gray-200"
                >
                  <option value="">에이전트 선택...</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {messages.length === 0 && (
                <div className="py-10 text-center text-[12px] text-gray-500">
                  {selected ? "메시지 입력으로 시작" : "에이전트 선택 필요"}
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
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
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
            <div className="p-2 border-t border-gray-800/60 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={selected ? "에이전트에게 시킬 일" : "에이전트 선택 필요"}
                disabled={!selected}
                className="flex-1 h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400/50 disabled:opacity-40"
              />
              <Button onClick={send} disabled={!input.trim() || !selected || sending} size="sm">
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </aside>

        {/* 왼쪽 사이드 메뉴 (햄버거로 토글) */}
        <aside
          className={`absolute top-0 left-0 h-full z-40 transition-transform duration-300 ${
            sideOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ width: "260px" }}
        >
          <div className="h-full flex flex-col border-r border-gray-800/80 bg-[#0b0b14]/98 backdrop-blur">
            <div className="p-4 border-b border-gray-800/60">
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-bold text-blue-300">메뉴</div>
                <button onClick={() => setSideOpen(false)} className="text-gray-500 hover:text-gray-200">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              <MenuItem icon={Users} label="에이전트" onClick={() => { setModalKey("agents"); setSideOpen(false); }} badge={agents.length} />
              <MenuItem icon={Plus} label="새 에이전트" onClick={() => { setModalKey("newAgent"); setSideOpen(false); }} />
              <MenuItem icon={Cpu} label="서버실" onClick={() => { setModalKey("server"); setSideOpen(false); }} />
              <MenuItem icon={Bug} label="버그 리포트" onClick={() => { setModalKey("bugs"); setSideOpen(false); }} />
              <MenuItem icon={Settings} label="설정" onClick={() => { setModalKey("settings"); setSideOpen(false); }} />
              <div className="h-px bg-gray-800/60 my-2" />
              <MenuItem icon={RefreshCw} label="강제 새로고침" onClick={() => {
                const keep = ["doogeun-hq-auth", "doogeun-hq-settings", "doogeun-hq-agents"];
                const keepMap: Record<string, string> = {};
                keep.forEach(k => { const v = localStorage.getItem(k); if (v !== null) keepMap[k] = v; });
                Object.keys(localStorage).forEach(k => { if (!(k in keepMap)) localStorage.removeItem(k); });
                location.reload();
              }} />
              {user ? (
                <MenuItem icon={LogOut} label={`로그아웃 (${user.nickname})`} onClick={() => { logout(); router.push("/"); }} />
              ) : (
                <MenuItem icon={LogOut} label="로그인" onClick={() => router.push("/auth")} />
              )}
            </nav>
            <div className="p-3 border-t border-gray-800/60">
              <div className="text-[10px] text-gray-600 font-mono">
                {user ? `${user.nickname} · ${user.role}` : "게스트"}
              </div>
              <div className="text-[10px] text-gray-700 mt-0.5">TOD: {tod}</div>
            </div>
          </div>
        </aside>

        {/* 사이드 메뉴 오픈 시 반투명 오버레이 (모바일) */}
        {sideOpen && (
          <div
            className="absolute inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setSideOpen(false)}
          />
        )}
      </main>

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
      <Modal open={modalKey === "newAgent"} onClose={() => setModalKey(null)} title="에이전트 추가" subtitle="이름/역할/MD 프롬프트" widthClass="max-w-2xl">
        <NewAgentBody onDone={() => setModalKey("agents")} />
      </Modal>
      <Modal open={modalKey === "server"} onClose={() => setModalKey(null)} title="서버실" subtitle="실시간 상태 (3초 폴링)">
        <ServerBody />
      </Modal>
      <Modal open={modalKey === "bugs"} onClose={() => setModalKey(null)} title="버그 리포트" subtitle="이슈 리스트 / 리포트 작성" widthClass="max-w-2xl">
        <BugsBody />
      </Modal>
      <Modal open={modalKey === "settings"} onClose={() => setModalKey(null)} title="설정" subtitle="/settings 페이지로 이동">
        <div className="p-5 space-y-3">
          <p className="text-[13px] text-gray-400">API 키, 모델, 토큰, 자동화 옵션은 설정 페이지에서 관리합니다.</p>
          <Button onClick={() => { setModalKey(null); router.push("/settings"); }}>
            설정 페이지 열기 <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function FloatBtn({ label, icon: Icon, onClick, badge, active }: {
  label: string; icon: React.ComponentType<{ className?: string }>; onClick: () => void; badge?: number; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-2 px-3 h-10 rounded-lg border text-[12px] backdrop-blur transition-all ${
        active
          ? "border-blue-400/60 bg-blue-500/20 text-blue-200"
          : "border-gray-800/80 bg-gray-900/80 text-gray-300 hover:text-blue-200 hover:border-blue-400/40"
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="font-bold">{label}</span>
      {badge != null && badge > 0 && (
        <Badge variant="default" className="ml-1">{badge}</Badge>
      )}
    </button>
  );
}

function MenuItem({ icon: Icon, label, onClick, badge }: {
  icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] text-gray-300 hover:bg-gray-800/50 hover:text-blue-200 transition-colors"
    >
      <Icon className="w-4 h-4" />
      <span className="flex-1 text-left">{label}</span>
      {badge != null && badge > 0 && <Badge variant="secondary">{badge}</Badge>}
    </button>
  );
}

function AgentsModalBody({ agents, onNew, onSelect }: { agents: Agent[]; onNew: () => void; onSelect: (a: Agent) => void }) {
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
            <button
              key={a.id}
              onClick={() => onSelect(a)}
              className="p-3 rounded-lg border border-gray-800/60 bg-gray-900/30 hover:bg-gray-800/40 hover:border-blue-400/40 transition-all text-left"
            >
              <div className="flex items-start gap-2">
                <div className="text-2xl">{a.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-gray-100 font-bold truncate">{a.name}</div>
                  <div className="text-[11px] text-gray-500 truncate">{a.role}</div>
                </div>
                <Badge variant={a.status === "working" ? "warning" : a.status === "error" ? "destructive" : "secondary"}>
                  {a.status}
                </Badge>
              </div>
            </button>
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
        <input value={workingDirectory} onChange={(e) => setWorkingDirectory(e.target.value)} placeholder="작업 디렉토리 (옵션)" className="h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500" />
        <input value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} placeholder="owner/repo (옵션)" className="h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500" />
      </div>
      <div>
        <label className="text-[12px] text-gray-400">시스템 프롬프트 (MD)</label>
        <textarea
          value={systemPromptMd}
          onChange={(e) => setSystemPromptMd(e.target.value)}
          rows={6}
          placeholder="# 디자인팀&#10;&#10;## 역할&#10;- ..."
          className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 font-mono focus:outline-none focus:ring-1 focus:ring-blue-400/50"
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
      <div className="text-lg font-bold text-blue-200">{value}</div>
    </div>
  );
}

interface BugRow { ts: string; title: string; note: string; issue_number?: number; urgent?: boolean }

function BugsBody() {
  const [rows, setRows] = useState<BugRow[]>([]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      const r = await fetch(`${apiBase()}/api/diag/reports?status=open`);
      const d = await r.json();
      setRows((d.rows || []).reverse().slice(0, 30));
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!note.trim()) return;
    setSending(true);
    try {
      await fetch(`${apiBase()}/api/diag/report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, logs: [], images: [] }),
      });
      setNote("");
      await load();
    } finally { setSending(false); }
  };

  return (
    <div className="p-5 space-y-4">
      <div>
        <div className="text-[12px] text-gray-400 mb-1 font-bold">리포트 작성</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="무슨 일이 있었는지 간단히..."
          className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400/50"
        />
        <div className="flex justify-end mt-2">
          <Button size="sm" onClick={submit} disabled={!note.trim() || sending}>
            {sending ? "전송 중..." : "전송"}
          </Button>
        </div>
      </div>
      <div>
        <div className="text-[12px] text-gray-400 mb-1 font-bold">최근 이슈 (열림)</div>
        {rows.length === 0 ? (
          <div className="text-[12px] text-gray-500 text-center py-4">없음</div>
        ) : (
          <div className="space-y-1">
            {rows.map((r, i) => (
              <div key={i} className="p-2 rounded border border-gray-800/60 bg-gray-900/20 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-200 truncate">{r.title}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {r.urgent && <Badge variant="destructive">긴급</Badge>}
                    {r.issue_number != null && (
                      <a href={`https://github.com/600-g/company-hq/issues/${r.issue_number}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                        #{r.issue_number}
                      </a>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-gray-600 font-mono mt-0.5">{r.ts}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
