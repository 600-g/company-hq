"use client";

import { useEffect, useRef, useState } from "react";
import TopBar from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Plus, Users, Activity, Bug, Cpu } from "lucide-react";
import Weather from "@/components/Weather";
import { useAgentStore } from "@/stores/agentStore";
import { apiBase } from "@/lib/utils";

/**
 * 통합 허브 — 한 화면에 오피스(Phaser) + 에이전트 목록 + 통합 채팅 + 상태.
 * 분산된 /office /agents /chat 을 한 뷰로 합침.
 */
interface HubMsg {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  agentEmoji?: string;
  agentName?: string;
  ts: number;
}

export default function HubPage() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<unknown>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const agents = useAgentStore((s) => s.agents);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<HubMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [floor, setFloor] = useState(1);

  const selected = agents.find((a) => a.id === selectedAgentId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Phaser 씬
  useEffect(() => {
    if (!canvasRef.current || gameRef.current) return;
    let destroyed = false;
    (async () => {
      const Phaser = (await import("phaser")).default;
      class HubScene extends Phaser.Scene {
        constructor() { super("hub"); }
        create() {
          const { width, height } = this.scale;
          const g = this.add.graphics();
          g.lineStyle(1, 0x1a1a2e, 1);
          for (let x = 0; x < width; x += 32) g.lineBetween(x, 0, x, height);
          for (let y = 0; y < height; y += 32) g.lineBetween(0, y, width, y);
          this.add.text(width / 2, height / 2 - 10, `🏢 오피스 · 층 ${floor}`, {
            fontSize: "18px", color: "#60a5fa",
            fontFamily: "Pretendard Variable, system-ui, sans-serif", resolution: 4,
          }).setOrigin(0.5);
          this.add.text(width / 2, height / 2 + 16, `에이전트 ${agents.length}명 배치됨 · 픽셀 캐릭터 이식 예정`, {
            fontSize: "12px", color: "#6b7280",
            fontFamily: "Pretendard Variable, system-ui, sans-serif", resolution: 4,
          }).setOrigin(0.5);
        }
      }
      if (destroyed || !canvasRef.current) return;
      const game = new Phaser.Game({
        type: Phaser.AUTO, parent: canvasRef.current, width: 900, height: 420,
        backgroundColor: "transparent", pixelArt: false, antialias: true,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [HubScene],
      });
      gameRef.current = game;
    })();
    return () => {
      destroyed = true;
      const g = gameRef.current as { destroy?: (b: boolean) => void } | null;
      g?.destroy?.(true);
      gameRef.current = null;
    };
  }, [floor, agents.length]);

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
        id: crypto.randomUUID(), role: "system", agentName: "system",
        content: "⚠️ 백엔드 연결 실패 (localhost:8000)", ts: Date.now(),
      }]);
      setSending(false);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopBar title="두근컴퍼니 HQ · Hub" />
      <main className="flex-1 grid grid-cols-[240px_1fr_360px] gap-3 p-3 min-h-0">
        {/* 왼쪽: 에이전트 + 상태 */}
        <aside className="flex flex-col gap-3 min-h-0">
          <div className="p-3 rounded-lg border border-gray-800/60 bg-gray-900/30">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] text-gray-400 font-bold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> 에이전트 {agents.length}
              </div>
              <a href="/agents" className="text-[11px] text-blue-400 hover:underline">+ 추가</a>
            </div>
            <div className="space-y-1 max-h-[240px] overflow-y-auto">
              {agents.length === 0 ? (
                <div className="text-[11px] text-gray-500 py-2 text-center">
                  <a href="/agents" className="text-blue-400 hover:underline">에이전트 추가</a>
                </div>
              ) : agents.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setSelectedAgentId(a.id); setMessages([]); }}
                  className={`w-full text-left p-2 rounded-md border transition-all ${
                    a.id === selectedAgentId
                      ? "border-blue-400/50 bg-blue-500/10"
                      : "border-gray-800/40 bg-gray-900/20 hover:bg-gray-800/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{a.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-gray-200 font-bold truncate">{a.name}</div>
                      <div className="text-[10px] text-gray-500 truncate">{a.role}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <Weather />

          <div className="p-3 rounded-lg border border-gray-800/60 bg-gray-900/30">
            <div className="text-[12px] text-gray-400 font-bold mb-2 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> 빠른 이동
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a href="/server" className="p-2 rounded border border-gray-800/60 hover:border-blue-400/40 text-center text-[11px] text-gray-300">
                <Cpu className="w-3.5 h-3.5 inline mr-1" /> 서버실
              </a>
              <a href="/bugs" className="p-2 rounded border border-gray-800/60 hover:border-blue-400/40 text-center text-[11px] text-gray-300">
                <Bug className="w-3.5 h-3.5 inline mr-1" /> 버그
              </a>
              <a href="/agents" className="p-2 rounded border border-gray-800/60 hover:border-blue-400/40 text-center text-[11px] text-gray-300">
                <Plus className="w-3.5 h-3.5 inline mr-1" /> 에이전트
              </a>
              <a href="/settings" className="p-2 rounded border border-gray-800/60 hover:border-blue-400/40 text-center text-[11px] text-gray-300">
                ⚙️ 설정
              </a>
            </div>
          </div>
        </aside>

        {/* 중앙: Phaser 오피스 + 층 선택 */}
        <section className="flex flex-col gap-3 min-h-0">
          <div className="flex items-center gap-2 text-[13px]">
            {[1, 2, 3].map((f) => (
              <Button
                key={f}
                variant={floor === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFloor(f)}
              >
                {f}F
              </Button>
            ))}
            <Badge variant="secondary" className="ml-auto">
              에이전트 {agents.filter((a) => a.floor === floor).length} / {agents.length}명
            </Badge>
          </div>
          <div
            ref={canvasRef}
            className="flex-1 min-h-0 rounded-lg border border-gray-800/60 bg-[#06060e] overflow-hidden"
          />
        </section>

        {/* 오른쪽: 채팅 */}
        <aside className="flex flex-col min-h-0 rounded-lg border border-gray-800/60 bg-gray-900/20 overflow-hidden">
          <div className="p-3 border-b border-gray-800/60">
            <div className="text-[12px] text-gray-400 font-bold">💬 채팅</div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {selected ? `${selected.emoji} ${selected.name}` : "에이전트를 선택하세요"}
            </div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {messages.length === 0 && (
              <div className="py-6 text-center text-[12px] text-gray-500">
                {selected ? "메시지 입력으로 시작" : "왼쪽에서 에이전트 선택"}
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
        </aside>
      </main>
    </div>
  );
}
