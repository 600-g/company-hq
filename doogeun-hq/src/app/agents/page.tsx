"use client";

import { useState } from "react";
import TopBar from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Clock } from "lucide-react";
import { useAgentStore, type Agent } from "@/stores/agentStore";

export default function AgentsPage() {
  const agents = useAgentStore((s) => s.agents);
  const removeAgent = useAgentStore((s) => s.removeAgent);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Agent | null>(null);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="두근컴퍼니 · 에이전트" />
      <main className="flex-1 p-6 max-w-5xl w-full mx-auto">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>에이전트 목록</CardTitle>
              <CardDescription>MD 기반 시스템 프롬프트 · 역할 · 작업 디렉토리</CardDescription>
            </div>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              에이전트 추가
            </Button>
          </CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-gray-500">
                아직 에이전트가 없어요. 위 버튼으로 만들어보세요.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {agents.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelected(a)}
                    className="p-4 rounded-lg border border-gray-800/60 bg-gray-900/30 hover:bg-gray-800/40 hover:border-sky-400/30 transition-all text-left"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="text-2xl">{a.emoji}</div>
                      <Badge variant={a.status === "working" ? "warning" : a.status === "error" ? "destructive" : "secondary"}>
                        {a.status}
                      </Badge>
                    </div>
                    <div className="text-[13px] text-gray-100 font-bold truncate">{a.name}</div>
                    <div className="text-[11px] text-gray-400 truncate mt-0.5">{a.role}</div>
                    {a.description && (
                      <div className="text-[11px] text-gray-500 mt-2 line-clamp-2">{a.description}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {creating && <AgentCreateModal onClose={() => setCreating(false)} />}
      {selected && (
        <AgentDetailPanel
          agent={selected}
          onClose={() => setSelected(null)}
          onDelete={() => { removeAgent(selected.id); setSelected(null); }}
        />
      )}
    </div>
  );
}

function AgentCreateModal({ onClose }: { onClose: () => void }) {
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
    addAgent({ name: name.trim(), emoji: emoji.trim() || "🤖", role: role.trim(), description: description.trim(), systemPromptMd, workingDirectory: workingDirectory.trim() || undefined, githubRepo: githubRepo.trim() || undefined });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardHeader>
            <CardTitle>에이전트 추가</CardTitle>
            <CardDescription>이름/역할/MD 시스템 프롬프트 — 나머지는 선택</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div className="flex gap-2">
                <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="w-16 text-center text-lg" maxLength={2} placeholder="🤖" />
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: 디자인팀)" required />
              </div>
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="역할 (예: UI/UX 디자이너 · 에셋 제작)" required />
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="설명 (짧게)" />
              <Input value={workingDirectory} onChange={(e) => setWorkingDirectory(e.target.value)} placeholder="작업 디렉토리 (옵션)" />
              <Input value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} placeholder="GitHub 레포 (owner/name, 옵션)" />
              <div>
                <label className="text-[12px] text-gray-400">시스템 프롬프트 (MD, 옵션)</label>
                <textarea
                  value={systemPromptMd}
                  onChange={(e) => setSystemPromptMd(e.target.value)}
                  rows={6}
                  placeholder="# 디자인팀&#10;&#10;## 역할&#10;- 시각 디자인 전담&#10;- 에셋 제작/슬라이싱&#10;..."
                  className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 font-mono focus:outline-none focus:ring-1 focus:ring-sky-400/40"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={onClose}>취소</Button>
                <Button type="submit">만들기</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AgentDetailPanel({ agent, onClose, onDelete }: { agent: Agent; onClose: () => void; onDelete: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="text-3xl">{agent.emoji}</div>
                <div>
                  <CardTitle>{agent.name}</CardTitle>
                  <CardDescription>{agent.role}</CardDescription>
                </div>
              </div>
              <div className="flex gap-2">
                <Badge variant={agent.status === "working" ? "warning" : "secondary"}>{agent.status}</Badge>
                <Badge variant="outline">{agent.floor}F</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {agent.description && (
              <div>
                <div className="text-[11px] text-gray-500 mb-1 font-bold">설명</div>
                <div className="text-[13px] text-gray-200">{agent.description}</div>
              </div>
            )}
            {agent.workingDirectory && (
              <div>
                <div className="text-[11px] text-gray-500 mb-1 font-bold">작업 디렉토리</div>
                <div className="text-[12px] text-gray-300 font-mono">{agent.workingDirectory}</div>
              </div>
            )}
            {agent.githubRepo && (
              <div>
                <div className="text-[11px] text-gray-500 mb-1 font-bold">GitHub</div>
                <a href={`https://github.com/${agent.githubRepo}`} target="_blank" rel="noopener noreferrer" className="text-[12px] text-cyan-400 hover:underline font-mono">
                  {agent.githubRepo}
                </a>
              </div>
            )}
            {agent.systemPromptMd && (
              <div>
                <div className="text-[11px] text-gray-500 mb-1 font-bold">시스템 프롬프트 (MD)</div>
                <pre className="max-h-60 overflow-y-auto p-3 rounded bg-black/40 border border-gray-800 text-[11px] text-gray-300 font-mono whitespace-pre-wrap">
{agent.systemPromptMd}
                </pre>
              </div>
            )}
            <div>
              <div className="text-[11px] text-gray-500 mb-1 font-bold flex items-center gap-1">
                <Clock className="w-3 h-3" /> 활동 타임라인
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {agent.activity.slice().reverse().map((a, i) => (
                  <div key={i} className="flex gap-2 text-[11px]">
                    <span className="text-gray-600 font-mono shrink-0">{new Date(a.ts).toLocaleString("ko-KR")}</span>
                    <span className="text-gray-300">{a.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="destructive" size="sm" onClick={onDelete}>
                <Trash2 className="w-3.5 h-3.5 mr-1" /> 삭제
              </Button>
              <Button variant="ghost" onClick={onClose}>닫기</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
