"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Settings, ChevronDown, ChevronRight, Wand2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAgentStore } from "@/stores/agentStore";
import { useLayoutStore } from "@/stores/layoutStore";
import EmojiPicker from "@/components/EmojiPicker";
import { apiBase } from "@/lib/utils";

type Mode = "light" | "project";

interface Props {
  /** 생성된 에이전트 id 를 호출자에게 알림 (자동 선택용). 없으면 그냥 닫힘. */
  onDone: (createdAgentId?: string) => void;
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

  /* 확인 단계 */
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  /* AI 초안 생성 — light 모드의 quickDesc 또는 고도화 모드의 role+description 기반.
   *  백엔드 /api/agents/generate-config 호출. 실패 시 로컬 fallback.
   *  응답 형식: {ok, role, description, outputHint, steps, system_prompt} (백엔드 반환 키 그대로) */
  const genDraft = async () => {
    // 입력 소스 결정 — 모드별
    const descSource = mode === "light"
      ? quickDesc.trim()
      : [role.trim(), description.trim()].filter(Boolean).join(" — ");
    if (!name.trim() || !descSource) return;

    setGenerating(true);
    setDraft(null);
    try {
      const r = await fetch(`${apiBase()}/api/agents/generate-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: descSource }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.ok && (d.role || d.system_prompt || d.steps)) {
          setDraft({
            role: d.role || "전문가",
            description: d.description || descSource,
            systemPromptMd: d.system_prompt || fallbackMd(name, descSource),
            outputHint: d.outputHint || "",
            steps: d.steps || fallbackSteps(descSource),
          });
          setGenerating(false);
          return;
        }
      }
      throw new Error("api unavailable");
    } catch {
      setDraft({
        role: mode === "project" && role ? role : "전문가",
        description: descSource,
        systemPromptMd: fallbackMd(name, descSource),
        outputHint: "요청한 작업의 결과물",
        steps: fallbackSteps(descSource),
      });
    } finally {
      setGenerating(false);
    }
  };

  /* 고도화 모드에서 초안을 시스템 프롬프트 필드에 반영 */
  const applyDraftToProject = () => {
    if (!draft) return;
    if (!role.trim() && draft.role) setRole(draft.role);
    if (!description.trim() && draft.description) setDescription(draft.description);
    setSystemPromptMd(draft.systemPromptMd);
  };

  /* 1단계: 검증 → 확인 화면으로 전환 (즉시 생성 X) */
  const proceedToConfirm = () => {
    if (!name.trim()) return;
    if (mode === "light" && !draft) return;
    if (mode === "project" && !role.trim()) return;
    setServerError(null);
    setConfirming(true);
  };

  /* 2단계: 확정 — 서버에 등록 → 시스템 프롬프트 저장 → 로컬 store 추가 → 채팅 자동 선택 */
  const create = async () => {
    if (submitting) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const finalRole = mode === "light" ? (draft?.role ?? "") : role.trim();
      const finalDesc = mode === "light" ? (draft?.description ?? quickDesc.trim()) : description.trim();
      const finalSysPrompt = mode === "light" ? (draft?.systemPromptMd ?? "") : systemPromptMd;

      // 서버에 light 팀 등록 (id 자동 생성)
      const r = await fetch(`${apiBase()}/api/teams/light`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          emoji: emoji.trim() || "🤖",
          description: finalDesc,
          system_prompt: finalSysPrompt,
          collaborative: true,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) {
        throw new Error(data?.error || `서버 등록 실패 (HTTP ${r.status})`);
      }
      const serverTeamId: string = data.team?.id || data.id || "";
      if (!serverTeamId) {
        throw new Error("서버가 팀 ID를 반환하지 않음");
      }

      // 로컬 store 추가 — 서버 ID를 그대로 사용 (WS 채팅 매칭)
      const agent = addAgent({
        id: serverTeamId,
        name: name.trim(),
        emoji: emoji.trim() || "🤖",
        role: finalRole,
        description: finalDesc,
        systemPromptMd: finalSysPrompt,
        workingDirectory: mode === "project" ? (workingDirectory.trim() || undefined) : undefined,
        githubRepo: mode === "project" ? (githubRepo.trim() || undefined) : undefined,
      });

      // 즉시 서버 state 동기화 — 30s polling이 stale 데이터로 새 에이전트를 덮어쓰는 race 방지
      try {
        const allAgents = useAgentStore.getState().agents;
        const allFloors = useLayoutStore.getState().floors;
        await fetch(`${apiBase()}/api/doogeun/state`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agents: allAgents, layout: { floors: allFloors } }),
        });
      } catch {
        // 실패해도 1초 후 useStateSync debounce가 재시도
      }

      onDone(agent.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "서버 등록 실패";
      setServerError(msg);
    } finally {
      setSubmitting(false);
    }
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

          {/* AI 초안 추천 — 고도화 모드 전용 */}
          <Button
            onClick={genDraft}
            disabled={!name.trim() || (!role.trim() && !description.trim()) || generating}
            variant="outline"
            className="w-full"
          >
            <Wand2 className="w-3.5 h-3.5 mr-1.5" />
            {generating ? "AI가 시스템 프롬프트 초안 만들고 있어요..." : "AI 초안 추천 (3~5줄 페르소나·단계 자동 설계)"}
          </Button>

          {draft && (
            <div className="p-3 rounded-lg border border-sky-500/30 bg-blue-500/5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[12px] text-gray-200 font-bold">AI 초안 미리보기</div>
                <Badge variant="default">권장 설계</Badge>
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
              <Button
                variant="outline"
                onClick={applyDraftToProject}
                className="w-full text-[12px]"
              >
                ✨ 이 초안을 시스템 프롬프트로 채우기 (빈 역할·설명도 보충)
              </Button>
              <details className="text-[11px]">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-300">전체 시스템 프롬프트(MD) 보기</summary>
                <pre className="mt-2 p-2 rounded bg-black/40 border border-gray-800 text-gray-400 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
{draft.systemPromptMd}
                </pre>
              </details>
            </div>
          )}

          <div>
            <label className="text-[12px] text-gray-400 mb-1 block">시스템 프롬프트 (MD)</label>
            <textarea
              value={systemPromptMd}
              onChange={(e) => setSystemPromptMd(e.target.value)}
              rows={6}
              placeholder="# 역할&#10;&#10;## 책임&#10;- ...&#10;&#10;(또는 위 [AI 초안 추천] 버튼 사용)"
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
            ? draft ? "확인 단계로 넘어갑니다" : "AI 초안 먼저 만들어야 합니다"
            : "역할까지 입력하면 다음 단계로"}
        </div>
        <Button
          onClick={proceedToConfirm}
          disabled={
            !name.trim() || (mode === "light" ? !draft : !role.trim())
          }
        >
          다음 — 확인 화면
        </Button>
      </div>

      {/* 2단계 확인 모달 (인라인 오버레이) */}
      {confirming && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4" onClick={(e) => { if (!submitting && e.target === e.currentTarget) setConfirming(false); }}>
          <div className="w-full max-w-md rounded-xl border border-sky-500/40 bg-gray-950 shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 bg-sky-500/10">
              <AlertTriangle className="w-4 h-4 text-sky-300" />
              <div className="text-[13px] text-sky-200 font-bold">에이전트 생성 확인</div>
            </div>
            <div className="p-4 space-y-3 text-[12px]">
              <div className="text-gray-400">아래 내용으로 새 에이전트를 두근컴퍼니에 등록합니다. 생성 후 우측 채팅 패널 목록에 즉시 나타나고, WebSocket 채팅이 활성화돼.</div>
              <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{emoji}</span>
                  <span className="text-gray-100 font-bold">{name}</span>
                  <Badge variant="default">{mode === "light" ? "빠르게" : "고도화"}</Badge>
                </div>
                <div><span className="text-gray-500">역할:</span> <span className="text-gray-200">{mode === "light" ? draft?.role : role}</span></div>
                <div><span className="text-gray-500">설명:</span> <span className="text-gray-300">{mode === "light" ? draft?.description : description}</span></div>
                {mode === "project" && workingDirectory && (
                  <div><span className="text-gray-500">작업 디렉토리:</span> <span className="text-gray-300 font-mono">{workingDirectory}</span></div>
                )}
                {mode === "project" && githubRepo && (
                  <div><span className="text-gray-500">GitHub:</span> <span className="text-gray-300 font-mono">{githubRepo}</span></div>
                )}
              </div>
              <details className="text-[11px]">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-300">시스템 프롬프트 펼치기</summary>
                <pre className="mt-2 p-2 rounded bg-black/40 border border-gray-800 text-gray-400 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
{mode === "light" ? draft?.systemPromptMd : systemPromptMd || "(없음)"}
                </pre>
              </details>
              {serverError && (
                <div className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>서버 등록 실패: {serverError}</span>
                </div>
              )}
              <div className="text-[10px] text-gray-500 leading-relaxed">
                • 등록 후 즉시 채팅 가능 — 작업 명령은 채팅창에서<br />
                • CPO 와의 협업·핸드오프 자동 활성화<br />
                • 추후 설정에서 언제든 모델·역할 수정 가능
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-end gap-2 bg-gray-900/40">
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={submitting}>취소</Button>
              <Button onClick={create} disabled={submitting}>
                {submitting ? (
                  <>등록 중...</>
                ) : (
                  <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />이대로 생성</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
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
