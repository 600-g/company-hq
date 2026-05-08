"use client";

import { useState } from "react";
import { Plus, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAgentStore, type Agent } from "@/stores/agentStore";
import { useConfirm } from "@/components/Confirm";
import { useNotifStore } from "@/stores/notifyStore";

interface AgentsModalBodyProps {
  agents: Agent[];
  onNew: () => void;
  onSelect: (a: Agent) => void;
  onEdit: (a: Agent) => void;
}

export default function AgentsModalBody({ agents, onNew, onSelect, onEdit }: AgentsModalBodyProps) {
  const removeAgent = useAgentStore((s) => s.removeAgent);
  const confirm = useConfirm();
  const notifyPush = useNotifStore((s) => s.push);
  const [importing, setImporting] = useState(false);
  const importFromServer = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const { importTeamsFromServer } = await import("@/lib/importTeams");
      const r = await importTeamsFromServer();
      notifyPush("success", "서버 에이전트 가져옴", `신규 ${r.added} · 갱신 ${r.updated} · 건너뜀 ${r.skipped}`, "import");
    } catch (e) {
      notifyPush("error", "가져오기 실패", e instanceof Error ? e.message : "서버 연결 실패", "import");
    } finally {
      setImporting(false);
    }
  };
  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3 gap-2">
        <Button size="sm" variant="outline" onClick={importFromServer} disabled={importing}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${importing ? "animate-spin" : ""}`} />
          {importing ? "가져오는 중..." : "서버에서 가져오기"}
        </Button>
        <Button size="sm" onClick={onNew}>
          <Plus className="w-3.5 h-3.5 mr-1" /> 새로 추가
        </Button>
      </div>
      {agents.length === 0 && (
        <div className="mb-3 p-3 rounded-lg bg-sky-500/10 border border-sky-400/30 text-[12px] text-sky-200">
          💡 팁 — <span className="font-bold">[서버에서 가져오기]</span> 를 누르면 이미 세팅된 CPO / 프론트 / 백엔드 / 디자인 / QA / 매매봇 등이 한번에 들어옵니다.
        </div>
      )}
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
                  onClick={(e) => { e.stopPropagation(); onEdit(a); }}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-sky-300 transition-opacity shrink-0 text-[11px] px-1.5 py-0.5 border border-gray-700 rounded hover:border-sky-400"
                  title="편집"
                >
                  편집
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const ok = await confirm({
                      title: "에이전트 완전 삭제",
                      message: `"${a.name}" 를 서버에서도 삭제합니다.\nteams.json · team_prompts.json · chat_history 폴더 제거.\n복구 불가.`,
                      confirmText: "삭제",
                      destructive: true,
                    });
                    if (!ok) return;
                    const { deleteTeamOnServer } = await import("@/lib/importTeams");
                    await deleteTeamOnServer(a.id, false);
                    removeAgent(a.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity shrink-0"
                  title="완전 삭제 (서버 포함)"
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

export function NewAgentBody({ onDone }: { onDone: () => void }) {
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
