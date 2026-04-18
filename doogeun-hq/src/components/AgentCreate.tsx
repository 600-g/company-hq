"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Settings, ChevronDown, ChevronRight, Wand2 } from "lucide-react";
import { useAgentStore } from "@/stores/agentStore";
import EmojiPicker from "@/components/EmojiPicker";

type Mode = "light" | "project";

interface Props {
  onDone: () => void;
}

/**
 * 에이전트 추가 — 팀메이커식 2탭 + AI가 MD 대략 5줄 생성해 미리보기 후 확정.
 *  · 빠르게:  이름 + 한줄설명 → [AI 초안 만들기] → 5줄 미리보기 → 확정
 *  · 고도화:  이름 + 역할 + 설명 + MD 직접 + (토글) 레포/작업디렉토리
 */
export default function AgentCreate({ onDone }: Props) {
  const addAgent = useAgentStore((s) => s.addAgent);
  const [mode, setMode] = useState<Mode>("light");

  /* 공용 */
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🤖");

  /* 빠르게 */
  const [quickDesc, setQuickDesc] = useState("");
  const [draft, setDraft] = useState<null | {
    role: string;
    description: string;
    systemPromptMd: string;
    outputHint: string;
    steps: string[];
  }>(null);
  const [generating, setGenerating] = useState(false);

  /* 고도화 */
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [systemPromptMd, setSystemPromptMd] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [githubRepo, setGithubRepo] = useState("");

  /* 빠르게 — AI 초안 생성 (백엔드 /api/agents/generate-config 호출. 실패 시 로컬 fallback) */
  const genDraft = async () => {
    if (!name.trim() || !quickDesc.trim()) return;
    setGenerating(true);
    setDraft(null);
    try {
      const apiBase = window.location.hostname === "localhost" ? "http://localhost:8000" : "https://api.600g.net";
      const r = await fetch(`${apiBase}/api/agents/generate-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: quickDesc.trim() }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.ok && d.config) {
          setDraft({
            role: d.config.role || "전문가",
            description: d.config.description || quickDesc.trim(),
            systemPromptMd: d.config.systemPrompt || fallbackMd(name, quickDesc),
            outputHint: d.config.outputHint || "",
            steps: d.config.steps || fallbackSteps(quickDesc),
          });
          setGenerating(false);
          return;
        }
      }
      throw new Error("api unavailable");
    } catch {
      setDraft({
        role: "전문가",
        description: quickDesc.trim(),
        systemPromptMd: fallbackMd(name, quickDesc),
        outputHint: "요청한 작업의 결과물",
        steps: fallbackSteps(quickDesc),
      });
    } finally {
      setGenerating(false);
    }
  };

  /* 최종 생성 */
  const create = () => {
    if (!name.trim()) return;
    if (mode === "light") {
      if (!draft) return;
      addAgent({
        name: name.trim(),
        emoji: emoji.trim() || "🤖",
        role: draft.role,
        description: draft.description,
        systemPromptMd: draft.systemPromptMd,
        workingDirectory: undefined,
        githubRepo: undefined,
      });
    } else {
      if (!role.trim()) return;
      addAgent({
        name: name.trim(),
        emoji: emoji.trim() || "🤖",
        role: role.trim(),
        description: description.trim(),
        systemPromptMd,
        workingDirectory: workingDirectory.trim() || undefined,
        githubRepo: githubRepo.trim() || undefined,
      });
    }
    onDone();
  };

  return (
    <div className="p-5 space-y-4">
      {/* 탭 */}
      <div className="flex gap-1 p-1 bg-gray-900/60 rounded-lg border border-gray-800">
        <button
          onClick={() => setMode("light")}
          className={`flex-1 flex items-center justify-center gap-1.5 text-[12px] py-2 rounded-md transition-all ${
            mode === "light" ? "bg-sky-500/15 text-gray-200 font-bold" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          빠르게 만들기
        </button>
        <button
          onClick={() => setMode("project")}
          className={`flex-1 flex items-center justify-center gap-1.5 text-[12px] py-2 rounded-md transition-all ${
            mode === "project" ? "bg-sky-500/15 text-gray-200 font-bold" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          고도화 프로젝트
        </button>
      </div>

      {/* 공용: 이모지 선택 + 이름 */}
      <div className="flex gap-2 items-start">
        <EmojiPicker value={emoji} onChange={setEmoji} className="w-14 shrink-0" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="에이전트 이름 (예: 디자인팀)" className="flex-1 h-10 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500" />
      </div>

      {mode === "light" ? (
        /* ⚡ 빠르게 */
        <div className="space-y-3">
          <div>
            <label className="text-[12px] text-gray-400 mb-1 block">한 줄 설명</label>
            <textarea
              value={quickDesc}
              onChange={(e) => setQuickDesc(e.target.value)}
              rows={2}
              placeholder="예: 웹사이트 디자인과 픽셀 에셋을 만드는 디자이너"
              className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
            />
            <div className="text-[11px] text-gray-500 mt-1">
              AI가 역할/시스템 프롬프트/단계를 자동으로 설계해줍니다. 확인 후 확정.
            </div>
          </div>
          <Button
            onClick={genDraft}
            disabled={!name.trim() || !quickDesc.trim() || generating}
            variant="outline"
            className="w-full"
          >
            <Wand2 className="w-3.5 h-3.5 mr-1.5" />
            {generating ? "AI가 초안 만들고 있어요..." : "AI 초안 만들기"}
          </Button>

          {draft && (
            <div className="p-3 rounded-lg border border-sky-500/30 bg-blue-500/5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[12px] text-gray-200 font-bold">AI 초안 미리보기</div>
                <Badge variant="default">5줄 요약</Badge>
              </div>
              <div className="space-y-2 text-[12px]">
                <div><span className="text-gray-500">역할:</span> <span className="text-gray-200">{draft.role}</span></div>
                <div><span className="text-gray-500">설명:</span> <span className="text-gray-200">{draft.description}</span></div>
                {draft.outputHint && (
                  <div><span className="text-gray-500">산출물:</span> <span className="text-gray-200">{draft.outputHint}</span></div>
                )}
                <div>
                  <div className="text-gray-500 mb-0.5">작업 단계</div>
                  <ol className="list-decimal list-inside space-y-0.5 text-gray-300">
                    {draft.steps.slice(0, 5).map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                </div>
              </div>
              <details className="text-[11px]">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-300">시스템 프롬프트(MD) 펼치기</summary>
                <pre className="mt-2 p-2 rounded bg-black/40 border border-gray-800 text-gray-400 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
{draft.systemPromptMd}
                </pre>
              </details>
            </div>
          )}
        </div>
      ) : (
        /* 🏗 고도화 */
        <div className="space-y-3">
          <div>
            <label className="text-[12px] text-gray-400 mb-1 block">역할</label>
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="예: UI/UX 디자이너 · 에셋 제작" className="w-full h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500" />
          </div>
          <div>
            <label className="text-[12px] text-gray-400 mb-1 block">설명 (짧게)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="이 에이전트가 어떤 일을 하는지" className="w-full h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500" />
          </div>
          <div>
            <label className="text-[12px] text-gray-400 mb-1 block">시스템 프롬프트 (MD)</label>
            <textarea
              value={systemPromptMd}
              onChange={(e) => setSystemPromptMd(e.target.value)}
              rows={6}
              placeholder="# 역할&#10;&#10;## 책임&#10;- ..."
              className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 font-mono focus:outline-none focus:ring-1 focus:ring-sky-400/40"
            />
            <div className="text-[11px] text-gray-500 mt-1">
              역할·규칙·금지사항을 MD 로 작성. 매 대화마다 에이전트에게 자동 주입됩니다.
            </div>
          </div>

          {/* 토글: 고급 옵션 (레포 / 작업 디렉토리) */}
          <button
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full flex items-center gap-2 text-[12px] text-gray-400 hover:text-gray-200 py-1 transition-colors"
          >
            {advancedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <span>고급 옵션 (작업 디렉토리 · GitHub 레포)</span>
          </button>

          {advancedOpen && (
            <div className="space-y-3 pl-2 border-l-2 border-gray-800">
              <div>
                <label className="text-[12px] text-gray-400 mb-1 block">작업 디렉토리</label>
                <input value={workingDirectory} onChange={(e) => setWorkingDirectory(e.target.value)} placeholder="예: ~/Projects/my-app" className="w-full h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500 font-mono" />
                <div className="text-[11px] text-gray-500 mt-1">에이전트가 파일 수정 시 기준이 되는 절대/상대 경로</div>
              </div>
              <div>
                <label className="text-[12px] text-gray-400 mb-1 block">GitHub 레포</label>
                <input value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} placeholder="owner/repo-name" className="w-full h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500 font-mono" />
                <div className="text-[11px] text-gray-500 mt-1">배포/푸시할 GitHub 레포지토리 (비워두면 로컬만)</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 최종 액션 */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-800/60">
        <div className="text-[11px] text-gray-500">
          {mode === "light"
            ? draft ? "확인 후 생성하세요" : "AI 초안 먼저 만들어야 합니다"
            : "역할까지 입력하면 바로 생성됩니다"}
        </div>
        <Button
          onClick={create}
          disabled={
            !name.trim() || (mode === "light" ? !draft : !role.trim())
          }
        >
          에이전트 만들기
        </Button>
      </div>
    </div>
  );
}

function fallbackMd(name: string, desc: string): string {
  return `# ${name}

## 역할
${desc}

## 원칙
- 사용자 요청을 정확히 이해하고 구체적 결과물을 낸다
- 모르는 건 추측하지 않고 질문한다
- 작업 전 관련 파일/구조를 먼저 확인한다
- 매 세션 요청사항을 기억하여 일관성을 유지한다

## 산출물
- 텍스트 설명 + 실제 파일 변경 (요청 시)
- 작업 요약 3~5 bullet 으로 리포트
`;
}

function fallbackSteps(desc: string): string[] {
  return [
    `요청 분석: "${desc.slice(0, 40)}${desc.length > 40 ? "…" : ""}"`,
    "관련 파일/컨텍스트 파악",
    "접근 방식 제안 (필요시 사용자에게 확인)",
    "실제 작업 수행 (파일 수정·코드 작성 등)",
    "결과 요약 + 다음 단계 제안",
  ];
}
