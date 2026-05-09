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
  /* 외부 사이트 (Cloudflare DNS 자동 발급) */
  const [publicSite, setPublicSite] = useState(false);
  const [subdomain, setSubdomain] = useState("");
  const [repoName, setRepoName] = useState("");
  const [cfTokenOk, setCfTokenOk] = useState<boolean | null>(null);
  /* 카테고리: web | game | other — 토큰 라벨링 */
  type CfCategory = "web" | "game" | "other";
  const [cfCategory, setCfCategory] = useState<CfCategory>("web");
  const [cfCategoryAuto, setCfCategoryAuto] = useState(true);  // 사용자 수동 변경 후엔 false
  const [cfTokensByCat, setCfTokensByCat] = useState<Record<string, { configured: boolean }>>({});

  // 서브도메인 키워드 → 카테고리 자동 추천 (백엔드 cf_dns.suggest_category 와 동일 로직)
  const suggestCategory = (sub: string): CfCategory => {
    const s = sub.toLowerCase();
    const gameKeywords = ["puzzle", "game", "play", "arcade", "rpg", "quiz", "tetris", "match"];
    const webKeywords = ["blog", "shop", "exam", "map", "doc", "wiki", "portfolio", "lab", "study", "edu"];
    const otherKeywords = ["trading", "bot", "api", "admin", "dash", "cron", "tool", "mon", "ops"];
    if (gameKeywords.some((k) => s.includes(k))) return "game";
    if (otherKeywords.some((k) => s.includes(k))) return "other";
    if (webKeywords.some((k) => s.includes(k))) return "web";
    return "web";
  };

  // 서브도메인 변경 시 자동 추천 (사용자가 수동 변경 안 했을 때만)
  const onSubdomainChange = (next: string) => {
    setSubdomain(next);
    if (cfCategoryAuto && next.length >= 3) {
      setCfCategory(suggestCategory(next));
    }
  };
  const onCategoryChange = (cat: CfCategory) => {
    setCfCategory(cat);
    setCfCategoryAuto(false);
  };

  const cfCategoryLabels: Record<CfCategory, { emoji: string; label: string; desc: string }> = {
    web:   { emoji: "🌐", label: "웹",   desc: "정보·도구 사이트 (블로그·쇼핑·시험 등)" },
    game:  { emoji: "🎮", label: "게임", desc: "퍼즐·아케이드·RPG 등 인터랙티브" },
    other: { emoji: "📦", label: "기타", desc: "그 외 분류 안 되는 사이트" },
  };
  const selectedCatTokenOk = cfTokensByCat[cfCategory]?.configured ?? null;

  // 외부 사이트 토글 ON 시 CF 토큰 상태 확인 → 가이드 인라인 표시
  useState(() => null);  // 더미 (no-op, useEffect 같은 효과는 toggle 이벤트에서 처리)

  /* 확인 단계 */
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  /* 성공 가이드 팝업 — 외부 사이트 발급 시 한 번 더 안내 */
  const [successInfo, setSuccessInfo] = useState<null | {
    agentId: string;
    agentName: string;
    publicUrl?: string;
    repoUrl?: string;
    subdomainOk: boolean;
    subdomainError?: string;
  }>(null);

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

      // 외부 사이트 토글이면 풀 /api/teams (GitHub 레포 + 자동 도메인), 아니면 light (sandbox)
      const useFullTeam = mode === "project" && publicSite && subdomain.trim();
      const finalRepo = (repoName.trim() || subdomain.trim() || "").toLowerCase();

      const r = useFullTeam
        ? await fetch(`${apiBase()}/api/teams`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: name.trim(),
              repo: finalRepo,
              emoji: emoji.trim() || "🤖",
              description: finalDesc,
              project_type: "general",
              category: "product",
              subdomain: subdomain.trim().toLowerCase(),
              subdomain_category: cfCategory,  // 'web' | 'game' | 'other' — 토큰 라벨링
            }),
          })
        : await fetch(`${apiBase()}/api/teams/light`, {
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

      // 외부 사이트 발급 시도가 있었으면 → 성공 팝업으로 한 번 더 안내
      if (useFullTeam) {
        const sdInfo = data?.subdomain_info as { ok?: boolean; error?: string; url?: string } | undefined;
        setSuccessInfo({
          agentId: agent.id,
          agentName: name.trim(),
          publicUrl: data?.public_url || sdInfo?.url,
          repoUrl: data?.repo_url,
          subdomainOk: !!sdInfo?.ok,
          subdomainError: sdInfo?.ok ? undefined : sdInfo?.error,
        });
        return;  // onDone 은 사용자가 [채팅 시작] 클릭 시 호출
      }

      onDone(agent.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "서버 등록 실패";
      setServerError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── 성공 팝업 — 외부 사이트 발급 직후 한 번 더 안내 ──
  if (successInfo) {
    const { agentName, publicUrl, repoUrl, subdomainOk, subdomainError, agentId } = successInfo;
    return (
      <div className="p-6 space-y-4 max-w-xl mx-auto">
        <div className="text-center space-y-2">
          <div className="text-5xl">🎉</div>
          <div className="text-[18px] font-bold text-gray-100">{agentName} 생성 완료!</div>
          <div className="text-[12px] text-gray-400">
            {subdomainOk ? "GitHub 레포 + 도메인 자동 발급 성공" : "GitHub 레포 생성 성공"}
          </div>
        </div>

        {subdomainOk && publicUrl ? (
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-400/30 space-y-3">
            <div className="flex items-center gap-2 text-emerald-200">
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-bold text-[13px]">도메인 발급 완료</span>
            </div>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center py-3 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 transition-colors"
            >
              <div className="text-[16px] font-mono text-emerald-100 font-bold">{publicUrl.replace(/^https?:\/\//, "")}</div>
              <div className="text-[10px] text-emerald-300/70 mt-1">클릭하면 새 탭에서 열림 ↗</div>
            </a>
            <div className="text-[12px] text-gray-300 space-y-1.5 pt-1">
              <div>📌 <strong>지금 바로 접속해도</strong> SSL 발급 중일 수 있어요. 5분~1시간 후 정상 작동.</div>
              <div>📌 첫 빌드는 <code className="text-emerald-300">index.html</code> 같은 파일이 레포에 push 된 후부터.</div>
              <div>📌 사이트 콘텐츠는 <strong>채팅으로 이 에이전트에게 요청</strong>하면 자동 작성·푸시.</div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-400/30 space-y-2">
            <div className="flex items-center gap-2 text-amber-200">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-bold text-[13px]">레포는 생성됐지만 도메인 발급은 실패</span>
            </div>
            {subdomainError && (
              <div className="text-[11px] text-amber-200/80 font-mono p-2 rounded bg-black/40 border border-amber-400/20">
                {subdomainError}
              </div>
            )}
            <div className="text-[12px] text-gray-300">
              💡 보통 <strong>Cloudflare 토큰 미설정</strong> 때문이에요. {" "}
              <a href="/settings" target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:underline">
                설정 페이지에서 등록 ↗
              </a>
            </div>
          </div>
        )}

        {repoUrl && (
          <div className="text-[12px] text-gray-400 text-center">
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-300 hover:underline"
            >
              ⌥ GitHub 레포 보기 ↗
            </a>
          </div>
        )}

        <div className="space-y-2 pt-2">
          <Button
            className="w-full"
            onClick={() => { onDone(agentId); }}
          >
            💬 이 에이전트와 채팅 시작
          </Button>
          <button
            onClick={() => { onDone(); }}
            className="w-full text-[11px] text-gray-500 hover:text-gray-300"
          >
            나중에 (모달 닫기)
          </button>
        </div>
      </div>
    );
  }

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
                <label className="text-[12px] text-gray-400 mb-1 block" title="에이전트가 파일 수정 시 기준이 되는 절대/상대 경로">
                  <span className="font-bold border-b border-dotted border-gray-500">작업 디렉토리</span>
                </label>
                <input value={workingDirectory} onChange={(e) => setWorkingDirectory(e.target.value)} placeholder="예: ~/Projects/my-app" className="w-full h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500 font-mono" />
              </div>
              <div>
                <label className="text-[12px] text-gray-400 mb-1 block" title="배포/푸시할 GitHub 레포지토리. 비워두면 로컬 폴더만 사용">
                  <span className="font-bold border-b border-dotted border-gray-500">GitHub 레포</span>
                </label>
                <input value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} placeholder="owner/repo-name" className="w-full h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500 font-mono" />
              </div>

              {/* 외부 공개 사이트 — 자체 GitHub 레포 + 600g.net 서브도메인 자동 발급 */}
              <div className="pt-2 border-t border-gray-800/50">
                <label className="flex items-center gap-2 cursor-pointer text-[12px] text-gray-300">
                  <input
                    type="checkbox"
                    checked={publicSite}
                    onChange={async (e) => {
                      setPublicSite(e.target.checked);
                      if (e.target.checked && cfTokenOk === null) {
                        try {
                          const r = await fetch(`${apiBase()}/api/settings/tokens`);
                          const d = await r.json();
                          setCfTokenOk(!!d?.tokens?.CF_TOKEN?.configured);
                          const byCat = d?.tokens?.CF_TOKEN_BY_CATEGORY || {};
                          setCfTokensByCat(byCat);
                        } catch { setCfTokenOk(false); }
                      }
                    }}
                    className="accent-sky-500"
                  />
                  <span className="font-bold border-b border-dotted border-gray-500" title="자체 GitHub 레포 + 도메인 자동 발급. CF_TOKEN 설정 시 즉시 작동.">
                    🚀 프로덕트로 만들기
                  </span>
                </label>
                <div className="text-[11px] text-gray-500 mt-1 ml-5">
                  자체 GitHub 레포 + <code>{"{name}"}.600g.net</code> 도메인 자동 발급 (예: <code>puzzle.600g.net</code>)
                </div>

                {/* 미니 가이드 — 처음 만드는 사용자용. 토큰 1번만 발급하면 그 다음부턴 도메인만 발행. */}
                {publicSite && (
                  <details className="mt-2 ml-5 group">
                    <summary className="cursor-pointer text-[11px] text-sky-300 hover:text-sky-200 select-none">
                      💡 프로덕트는 어떻게 작동해? (처음이면 펼쳐보기)
                    </summary>
                    <div className="mt-2 p-2.5 rounded bg-sky-500/5 border border-sky-400/20 text-[11px] text-gray-300 leading-relaxed space-y-1.5">
                      <div className="text-gray-200 font-bold mb-1">📌 한 번 셋업, 무한 발행</div>
                      <ol className="list-decimal list-inside space-y-1 text-gray-300">
                        <li>
                          <strong className="text-emerald-300">CF 토큰은 평생 1번만</strong> — 이미 등록됨{" "}
                          {cfTokenOk ? <span className="text-emerald-400">✓</span> : (
                            <a href="/settings" target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">설정에서 등록 ↗</a>
                          )}
                        </li>
                        <li>그 다음부터는 <strong className="text-sky-200">서브도메인 이름만 입력</strong> — DNS · CNAME · GitHub Pages 자동 연결</li>
                        <li><strong>카테고리는 라벨링용</strong> — 토큰 1개로 web/game/other 다 작동 (감사·회수 분리 원할 때만 카테고리별 토큰 추가)</li>
                        <li>발행 후 <strong className="text-amber-300">SSL 5분~1시간 발급 대기</strong> — 그동안 https 접속 시 "비공개 경고" 정상</li>
                      </ol>
                      <div className="pt-1.5 border-t border-sky-400/20 text-[10px] text-gray-400">
                        예: <code className="text-emerald-300">trading</code> 입력 → <code>trading.600g.net</code> 자동 발급 (카테고리 자동 = 기타)
                      </div>
                    </div>
                  </details>
                )}

                {publicSite && cfTokenOk === false && (
                  <div className="mt-2 ml-5 p-3 rounded-md bg-amber-500/10 border border-amber-400/40 text-[11px] text-amber-100 space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Cloudflare 토큰이 설정 안 됐어요
                    </div>
                    <div className="text-amber-200/90">
                      도메인 자동 발급은 안 됩니다. 레포만 만들어요.
                      <br />
                      <a
                        href="/settings"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-sky-300 hover:text-sky-200 font-bold"
                      >
                        ⚙️ 설정 페이지에서 토큰 등록 (3분) ↗
                      </a>
                    </div>
                  </div>
                )}
                {publicSite && (
                  <div className="mt-2 ml-5 space-y-2 p-2.5 rounded-md bg-sky-500/5 border border-sky-400/20">
                    <div>
                      <label className="text-[11px] text-gray-400 mb-1 block" title="GitHub 레포 이름. 영문 소문자/숫자/하이픈만">
                        <span className="font-bold border-b border-dotted border-gray-500">레포 이름</span>
                      </label>
                      <input
                        value={repoName}
                        onChange={(e) => setRepoName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                        placeholder="예: puzzle-game"
                        className="w-full h-8 rounded border border-gray-700 bg-gray-900/60 px-2.5 text-[12px] text-gray-100 placeholder:text-gray-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400 mb-1 block" title="600g.net 앞에 붙을 서브도메인 이름 (영문 소문자/숫자만 추천)">
                        <span className="font-bold border-b border-dotted border-gray-500">서브도메인</span>
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          value={subdomain}
                          onChange={(e) => onSubdomainChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                          placeholder="puzzle"
                          className="flex-1 h-8 rounded border border-gray-700 bg-gray-900/60 px-2.5 text-[12px] text-gray-100 placeholder:text-gray-500 font-mono"
                        />
                        <span className="text-[12px] text-gray-400 font-mono">.600g.net</span>
                      </div>
                      {subdomain && (
                        <div className="text-[10px] text-emerald-300 mt-1">
                          → 만들어질 주소: <code className="text-emerald-200">https://{subdomain}.600g.net</code>
                        </div>
                      )}
                    </div>

                    {/* 카테고리 선택 — 토큰 라벨링용 */}
                    <div>
                      <label className="text-[11px] text-gray-400 mb-1 block">
                        <span
                          className="font-bold border-b border-dotted border-gray-500"
                          title="CF 토큰 라벨링용. 같은 zone 권한이라 보안상 차이는 없고, 관리/감사용으로 분리"
                        >
                          카테고리
                        </span>
                        {cfCategoryAuto && (
                          <span className="ml-1.5 text-[9px] text-sky-400/80">(자동 추천 — 직접 변경 가능)</span>
                        )}
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(["web", "game", "other"] as CfCategory[]).map((cat) => {
                          const meta = cfCategoryLabels[cat];
                          const tokenOk = cfTokensByCat[cat]?.configured;
                          const active = cfCategory === cat;
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => onCategoryChange(cat)}
                              className={`relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded border transition-all ${
                                active
                                  ? "border-sky-400 bg-sky-500/15 text-sky-100"
                                  : "border-gray-700 bg-gray-900/40 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                              }`}
                              title={meta.desc + (tokenOk ? " · 전용 토큰 등록됨" : " · 폴백 CF_TOKEN 사용 (전용 토큰 미설정)")}
                            >
                              <span className="text-[14px] leading-none">{meta.emoji}</span>
                              <span className="text-[10px] font-bold">{meta.label}</span>
                              {/* 토큰 상태 점 — 우상단 */}
                              <span
                                className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${
                                  tokenOk ? "bg-emerald-400" : "bg-gray-600"
                                }`}
                              />
                            </button>
                          );
                        })}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1 leading-tight">
                        💡 {cfCategoryLabels[cfCategory].desc}
                      </div>
                      {selectedCatTokenOk === false && cfTokenOk && (
                        <div className="text-[10px] text-amber-300/80 mt-1 p-1.5 rounded bg-amber-500/5 border border-amber-400/20 leading-tight">
                          전용 <code>CF_TOKEN_{cfCategory.toUpperCase()}</code> 미등록 →{" "}
                          폴백 <code>CF_TOKEN</code> 사용 (작동은 함). 분리 관리하려면{" "}
                          <a href="/settings" target="_blank" rel="noopener noreferrer" className="underline text-sky-300">
                            설정에서 추가 ↗
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="text-[10px] text-amber-300/80 leading-relaxed">
                      ⚠️ 작동 조건: <code>설정</code> 페이지에서 <strong>Cloudflare 토큰</strong> 입력됨 + GitHub 토큰 정상.
                      미설정 시 레포만 만들고 도메인은 수동 작업 안내.
                    </div>
                  </div>
                )}
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
