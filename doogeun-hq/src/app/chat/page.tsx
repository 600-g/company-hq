"use client";

import { useEffect, useRef, useState } from "react";
import TopBar from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Send } from "lucide-react";
import { useAgentStore } from "@/stores/agentStore";
import { apiBase } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  agentName?: string;
  agentEmoji?: string;
  ts: number;
}

export default function ChatPage() {
  const agents = useAgentStore((s) => s.agents);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selected = agents.find((a) => a.id === selectedAgentId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || !selected) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      ts: Date.now(),
    };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setSending(true);

    // FastAPI /api/chat/{team_id}/send 호출 (구 백엔드 호환)
    try {
      const res = await fetch(`${apiBase()}/api/chat/${selected.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userMsg.content }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      // 간이 폴링 — 응답은 폴링으로
      setTimeout(async () => {
        try {
          const h = await fetch(`${apiBase()}/api/chat/${selected.id}/history`);
          const d = await h.json();
          const last = (d.messages || []).filter((m: { role?: string }) => m.role === "assistant").slice(-1)[0];
          if (last) {
            setMessages((p) => [...p, {
              id: crypto.randomUUID(),
              role: "agent",
              content: last.content,
              agentName: selected.name,
              agentEmoji: selected.emoji,
              ts: Date.now(),
            }]);
          }
        } catch {}
        setSending(false);
      }, 2000);
    } catch {
      setMessages((p) => [...p, {
        id: crypto.randomUUID(),
        role: "agent",
        content: "⚠️ 백엔드 연결 실패. FastAPI(localhost:8000) 가 켜져있는지 확인.",
        agentEmoji: "❌",
        agentName: "system",
        ts: Date.now(),
      }]);
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="두근컴퍼니 HQ — 채팅" />
      <main className="flex-1 flex gap-4 p-6 max-w-6xl w-full mx-auto">
        {/* 에이전트 사이드바 */}
        <Card className="w-64 shrink-0">
          <CardHeader>
            <CardTitle className="text-sm">에이전트</CardTitle>
            <CardDescription>클릭해서 대화 시작</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {agents.length === 0 ? (
              <div className="text-[12px] text-gray-500 py-2">
                에이전트가 없습니다. <a href="/agents" className="text-blue-400 hover:underline">추가</a>
              </div>
            ) : (
              agents.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setSelectedAgentId(a.id); setMessages([]); }}
                  className={`w-full text-left p-2 rounded-md border transition-all ${
                    a.id === selectedAgentId
                      ? "border-blue-400/50 bg-blue-500/10"
                      : "border-gray-800/60 bg-gray-900/20 hover:bg-gray-800/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{a.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-gray-200 truncate font-bold">{a.name}</div>
                      <div className="text-[10px] text-gray-500 truncate">{a.role}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* 채팅창 */}
        <Card className="flex-1 flex flex-col min-w-0">
          {selected ? (
            <>
              <CardHeader className="border-b border-gray-800/60">
                <CardTitle className="flex items-center gap-2">
                  <span className="text-xl">{selected.emoji}</span>
                  {selected.name}
                </CardTitle>
                <CardDescription>{selected.role}</CardDescription>
              </CardHeader>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
                {messages.length === 0 && (
                  <div className="py-10 text-center text-[13px] text-gray-500">
                    에이전트에게 시킬 일을 입력해보세요
                  </div>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed ${
                        m.role === "user"
                          ? "rounded-br-md bg-[var(--chat-user-bg)] border border-[var(--chat-user-border)] text-[var(--chat-user-text)]"
                          : "rounded-bl-md bg-[var(--chat-ai-bg)] border border-[var(--chat-ai-border)] text-[var(--chat-ai-text)]"
                      }`}
                    >
                      {m.role === "agent" && (
                        <div className="text-[11px] text-gray-400 mb-1">
                          {m.agentEmoji} {m.agentName}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start">
                    <div className="px-3 py-2 rounded-2xl rounded-bl-md bg-[var(--chat-ai-bg)] border border-[var(--chat-ai-border)]">
                      <span className="inline-flex gap-1 items-center text-gray-400 text-[13px]">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t border-gray-800/60 p-3 flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="에이전트에게 시킬 일을 입력하세요"
                  className="flex-1 h-10 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400/50"
                />
                <Button onClick={send} disabled={!input.trim() || sending}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[13px] text-gray-500">
              좌측에서 에이전트를 선택하세요
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
