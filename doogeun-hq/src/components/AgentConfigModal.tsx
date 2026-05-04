"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, Trash2, Save, AlertTriangle } from "lucide-react";
import { useAgentStore, type Agent, type AgentModel } from "@/stores/agentStore";
import EmojiPicker from "@/components/EmojiPicker";
import { useConfirm } from "@/components/Confirm";
import { deleteTeamOnServer, saveTeamPromptToServer } from "@/lib/importTeams";
import { apiBase } from "@/lib/utils";

interface Props {
  agent: Agent;
  onClose: () => void;
}

/**
 * 에이전트 편집 모달.
 *  - 이름/이모지/역할/설명/MD 프롬프트/레포/작업디렉토리 편집
 *  - 삭제 (확인)
 *  - 복제 (새 ID, 이름 뒤에 " (복사)")
 *  - 활동 로그 타임라인 표시
 */
export default function AgentConfigModal({ agent, onClose }: Props) {
  const updateAgent = useAgentStore((s) => s.updateAgent);
  const removeAgent = useAgentStore((s) => s.removeAgent);
  const confirm = useConfirm();

  const [name, setName] = useState(agent.name);
  const [emoji, setEmoji] = useState(agent.emoji);
  const [role, setRole] = useState(agent.role);
  const [description, setDescription] = useState(agent.description);
  const [systemPromptMd, setSystemPromptMd] = useState(agent.systemPromptMd);
  const [workingDirectory, setWorkingDirectory] = useState(agent.workingDirectory ?? "");
  const [githubRepo, setGithubRepo] = useState(agent.githubRepo ?? "");
  const [floorChoice, setFloorChoice] = useState(agent.floor ?? 1);
  const [modelChoice, setModelChoice] = useState<AgentModel>(agent.model ?? "sonnet");
  const [spriteChoice, setSpriteChoice] = useState<string>(agent.spriteKey ?? "");
  const [languageChoice, setLanguageChoice] = useState<"ko" | "en" | "ja" | "zh" | "">(agent.language ?? "");
  const [roleGroupChoice, setRoleGroupChoice] = useState<"system" | "dev" | "agent">(agent.roleGroup ?? "dev");
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dirty =
    name !== agent.name || emoji !== agent.emoji || role !== agent.role ||
    description !== agent.description || systemPromptMd !== agent.systemPromptMd ||
    workingDirectory !== (agent.workingDirectory ?? "") ||
    githubRepo !== (agent.githubRepo ?? "") ||
    floorChoice !== (agent.floor ?? 1) ||
    modelChoice !== (agent.model ?? "sonnet") ||
    spriteChoice !== (agent.spriteKey ?? "") ||
    languageChoice !== (agent.language ?? "") ||
    roleGroupChoice !== (agent.roleGroup ?? "dev");

  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    updateAgent(agent.id, {
      name: name.trim(),
      emoji,
      role: role.trim(),
      description: description.trim(),
      systemPromptMd,
      workingDirectory: workingDirectory.trim() || undefined,
      githubRepo: githubRepo.trim() || undefined,
      floor: floorChoice,
      model: modelChoice,
      spriteKey: spriteChoice || undefined,
      language: languageChoice || undefined,
      roleGroup: roleGroupChoice,
      position: floorChoice !== (agent.floor ?? 1) ? undefined : agent.position,
    });
    // 서버 동기화 — MD 프롬프트 + 모델 변경 시 서버에도 반영
    const jobs: Promise<unknown>[] = [];
    if (systemPromptMd !== agent.systemPromptMd && systemPromptMd.trim()) {
      jobs.push(saveTeamPromptToServer(agent.id, systemPromptMd));
    }
    if (modelChoice !== (agent.model ?? "sonnet")) {
      jobs.push(fetch(`${apiBase()}/api/agents/${agent.id}/model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelChoice }),
      }).catch(() => {}));
    }
    if (jobs.length > 0) await Promise.all(jobs);
    setSaving(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const del = async () => {
    const ok = await confirm({
      title: "에이전트 삭제",
      message: `"${agent.name}" 을(를) 서버에서도 완전 삭제합니다.\n(teams.json · team_prompts.json · chat_history 폴더 삭제)\n복구 불가.`,
      confirmText: "완전 삭제",
      destructive: true,
    });
    if (!ok) return;
    const res = await deleteTeamOnServer(agent.id, false);
    removeAgent(agent.id);
    if (!res.ok) {
      console.warn("[AgentConfigModal] server delete 실패:", res.error);
    }
    onClose();
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <Card className="max-h-[90vh] flex flex-col overflow-hidden">
          <CardHeader className="flex-row items-start justify-between shrink-0 border-b border-gray-800/60">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <span className="text-2xl">{emoji}</span>
                <span className="truncate">{name || "이름 없음"}</span>
                {dirty && <Badge variant="warning" className="text-[9px]">수정됨</Badge>}
              </CardTitle>
              <CardDescription className="mt-0.5 font-mono text-[11px] text-gray-500 truncate">
                {agent.id}
              </CardDescription>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-200">
              <X className="w-4 h-4" />
            </button>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto space-y-4 py-4">
            {/* 이름 + 이모지 */}
            <div className="flex gap-2 items-start">
              <EmojiPicker value={emoji} onChange={setEmoji} />
              <div className="flex-1">
                <label className="text-[11px] text-gray-400 block mb-1">표시 이름</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100"
                />
              </div>
            </div>

            <Field label="역할 · 카테고리">
              <div className="flex gap-1.5">
                <input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="예: 프론트엔드 담당"
                  className="flex-1 h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500"
                />
                {([
                  { v: "system", label: "🛠", title: "시스템 그룹 — 관리자·모니터·스태프 등" },
                  { v: "dev",    label: "💻", title: "개발 그룹 — 프론트·백엔드·디자인·QA 등" },
                  { v: "agent",  label: "🤖", title: "에이전트 그룹 — 경량 자동화 봇 등" },
                ] as const).map((g) => (
                  <button
                    key={g.v}
                    onClick={() => setRoleGroupChoice(g.v)}
                    title={g.title}
                    className={`w-9 h-9 rounded-md border text-base shrink-0 transition-colors ${
                      roleGroupChoice === g.v
                        ? "bg-sky-500/15 border-sky-400/50"
                        : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-200 bg-gray-900/40"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">역할명은 시스템 프롬프트에 주입 · 우측 아이콘은 사이드바 그룹 분류</div>
            </Field>

            <Field label="설명 (한 줄)">
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100"
              />
            </Field>

            <Field label="배치 층">
              <div className="flex gap-1">
                {[1, 2, 3].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFloorChoice(f)}
                    className={`flex-1 h-9 rounded-md border text-[12px] font-bold transition-colors ${
                      floorChoice === f
                        ? "bg-sky-500/15 text-gray-100 border-sky-400/50"
                        : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200 bg-gray-900/40"
                    }`}
                  >
                    {f}F
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                층 변경 시 위치 초기화 — 해당 층에서 자동 재배치
              </div>
            </Field>

            <Field label="캐릭터 스프라이트">
              <SpritePicker value={spriteChoice} onChange={setSpriteChoice} />
              <div className="text-[10px] text-gray-500 mt-0.5">
                미선택(자동) 시 ID 해시 기반 자동 할당. CPO 키워드 매칭되면 char_cpo 로.
              </div>
            </Field>

            <Field label="AI 모델 (좌→우 능력 상승)">
              <div className="flex gap-1">
                {([
                  { v: "gemma_e4b",    label: "Gemma E4B",  paid: false, speed: 5, reason: 1, code: 1, title: "Gemma 4 E4B — 로컬 무한, 빠름. 코딩 약함" },
                  { v: "haiku",        label: "Haiku",       paid: true,  speed: 5, reason: 2, code: 3, title: "Claude Haiku — 빠르고 저렴, 짧은 코딩 작업 OK" },
                  { v: "gemma_main",   label: "Gemma 26B",  paid: false, speed: 1, reason: 3, code: 2, title: "Gemma 4 26B — 로컬 무한, 깊이 추론. 코딩은 보통" },
                  { v: "gemini_flash", label: "Gemini",      paid: false, speed: 5, reason: 3, code: 3, title: "Gemini 2.5 Flash — 클라우드 무료, 분15/일1500" },
                  { v: "sonnet",       label: "Sonnet",      paid: true,  speed: 3, reason: 4, code: 5, title: "Claude Sonnet — 균형, 다파일 코딩 톱티어" },
                  { v: "opus",         label: "Opus",        paid: true,  speed: 1, reason: 5, code: 5, title: "Claude Opus — 최고 품질" },
                ] as const).map((m) => (
                  <ModelButton
                    key={m.v}
                    label={m.label}
                    paid={m.paid}
                    speed={m.speed}
                    reason={m.reason}
                    code={m.code}
                    title={m.title}
                    selected={modelChoice === m.v}
                    onClick={() => setModelChoice(m.v as AgentModel)}
                    tone={
                      m.v === "haiku" ? "green" :
                      m.v === "sonnet" ? "sky" :
                      m.v === "opus" ? "purple" :
                      "emerald"
                    }
                  />
                ))}
              </div>
              <div className="text-[10px] text-gray-500 mt-1.5 leading-relaxed">
                • <span className="text-emerald-400">무료</span> 표시 = Claude 토큰 0 소비.<br />
                • 코드 작업은 <span className="text-sky-300">Claude</span> 권장 (Gemma/Gemini 는 일반 대화·요약·분류 적합).<br />
                • 에이전트마다 독립 설정.
              </div>
            </Field>

            <Field label="시스템 프롬프트 (MD)">
              <textarea
                value={systemPromptMd}
                onChange={(e) => setSystemPromptMd(e.target.value)}
                rows={10}
                className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-[12px] text-gray-100 font-mono"
              />
              <div className="text-[10px] text-gray-500 mt-1">
                {systemPromptMd.length} 자 · 이 내용이 매 대화 시스템 프롬프트로 주입됨
              </div>
            </Field>

            <details className="border border-gray-800/60 rounded-md">
              <summary className="cursor-pointer px-3 py-2 text-[12px] text-gray-400 hover:text-gray-200">고급 옵션 (레포·작업 디렉토리)</summary>
              <div className="p-3 pt-0 space-y-3">
                <Field label="GitHub 레포 (owner/name)">
                  <input
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    placeholder="600-g/my-repo"
                    className="w-full h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500 font-mono"
                  />
                </Field>
                <Field label="작업 디렉토리">
                  <input
                    value={workingDirectory}
                    onChange={(e) => setWorkingDirectory(e.target.value)}
                    placeholder="ui/app/components"
                    className="w-full h-9 rounded-md border border-gray-700 bg-gray-900/60 px-3 text-sm text-gray-100 placeholder:text-gray-500 font-mono"
                  />
                </Field>
              </div>
            </details>

            {/* 활동 로그 */}
            {Array.isArray(agent.activity) && agent.activity.length > 0 && (
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">활동 로그 (최근 {Math.min(agent.activity.length, 10)})</label>
                <div className="max-h-40 overflow-y-auto space-y-0.5 bg-gray-900/30 rounded-md border border-gray-800/60 p-2">
                  {agent.activity.slice(-10).reverse().map((a, i) => (
                    <div key={i} className="text-[10px] text-gray-400 flex gap-2">
                      <span className="text-gray-600 font-mono shrink-0">
                        {a.ts ? new Date(a.ts).toISOString().slice(5, 16).replace("T", " ") : "?"}
                      </span>
                      <span className="truncate">{a.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>

          {/* 푸터 */}
          <div className="shrink-0 border-t border-gray-800/60 p-3 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={del} className="text-red-300 hover:text-red-200 hover:bg-red-500/10">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> 삭제
            </Button>
            <div className="ml-auto flex items-center gap-2">
              {savedFlash && (
                <span className="text-[11px] text-green-300 flex items-center gap-1">
                  ✓ 저장됨
                </span>
              )}
              <Button variant="ghost" onClick={onClose}>닫기</Button>
              <Button onClick={save} disabled={!dirty || !name.trim() || saving}>
                <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-gray-400 block mb-1">{label}</label>
      {children}
    </div>
  );
}

/** 캐릭 스프라이트 썸네일 버튼 — 첫 프레임(정면 down) 만 보여줌 */
function SpriteBtn({ active, onClick, src, label }: { active: boolean; onClick: () => void; src: string; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`h-14 rounded border flex items-center justify-center overflow-hidden ${
        active
          ? "border-sky-400 bg-sky-500/15 ring-2 ring-sky-400/40"
          : "border-gray-700 hover:border-sky-400/50 bg-gray-900/40"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label}
        className="h-12 w-8 object-none object-left-top"
        style={{ imageRendering: "pixelated", objectPosition: "0 0" }}
      />
    </button>
  );
}

// 스프라이트 풀 크기 (HubOffice.tsx 와 동기화 필요)
const STAFF_COUNT = 241;  // char_0 ~ char_240 (중복 제거 후)
const NPC_COUNT = 28;     // npc_01 ~ npc_28 (누워있는 할아버지 npc_29 제거)

/** 스프라이트 피커 — 탭 (특수 / 직원 / NPC) */
function SpritePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [tab, setTab] = useState<"special" | "staff" | "npc">("staff");
  return (
    <div className="rounded-md border border-gray-700 bg-gray-900/40 overflow-hidden">
      <div className="flex gap-0 border-b border-gray-800 bg-gray-900/60">
        <TabBtn active={tab === "special"} onClick={() => setTab("special")}>✨ 특수</TabBtn>
        <TabBtn active={tab === "staff"} onClick={() => setTab("staff")}>👔 직원</TabBtn>
        <TabBtn active={tab === "npc"} onClick={() => setTab("npc")}>🙂 NPC</TabBtn>
      </div>
      <div className="grid grid-cols-8 gap-1 p-2 max-h-72 overflow-y-auto">
        {tab === "special" && (
          <>
            <button
              onClick={() => onChange("")}
              className={`h-14 rounded border text-[10px] flex items-center justify-center ${
                !value
                  ? "border-sky-400/50 bg-sky-500/15 text-sky-200 font-bold"
                  : "border-gray-700 text-gray-400 hover:border-gray-500"
              }`}
              title="ID 해시 기반 자동 할당"
            >
              자동
            </button>
            <SpriteBtn
              active={value === "char_cpo"}
              onClick={() => onChange("char_cpo")}
              src="/assets/chars/char_cpo.png"
              label="CPO"
            />
          </>
        )}
        {tab === "staff" && Array.from({ length: STAFF_COUNT }).map((_, i) => (
          <SpriteBtn
            key={i}
            active={value === `char_${i}`}
            onClick={() => onChange(`char_${i}`)}
            src={`/assets/chars/char_${i}.png`}
            label={`#${i}`}
          />
        ))}
        {tab === "npc" && Array.from({ length: NPC_COUNT }).map((_, i) => {
          const num = String(i + 1).padStart(2, "0");
          const key = `npc_${num}`;
          return (
            <SpriteBtn
              key={key}
              active={value === key}
              onClick={() => onChange(key)}
              src={`/assets/npcs/${key}.png`}
              label={`NPC ${num}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2 text-[12px] font-bold transition-colors ${
        active ? "bg-sky-500/15 text-sky-200" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/40"
      }`}
    >
      {children}
    </button>
  );
}

type ModelTone = "green" | "sky" | "purple" | "emerald";

interface ModelButtonProps {
  label: string;
  paid: boolean;
  speed: 1 | 2 | 3 | 4 | 5;
  reason: 1 | 2 | 3 | 4 | 5;
  code: 1 | 2 | 3 | 4 | 5;
  title: string;
  selected: boolean;
  onClick: () => void;
  tone: ModelTone;
}

function ModelButton({ label, paid, speed, reason, code, title, selected, onClick, tone }: ModelButtonProps) {
  const selectedCls =
    tone === "green"   ? "model-btn--green   bg-green-500/20   text-gray-100 border-green-400/60"
    : tone === "purple" ? "model-btn--purple  bg-purple-500/25  text-gray-100 border-purple-400/60"
    : tone === "sky"    ? "model-btn--sky     bg-sky-500/20     text-gray-100 border-sky-400/60"
    :                     "model-btn--emerald bg-emerald-500/20 text-gray-100 border-emerald-400/60";
  const idleCls =
    tone === "emerald"
      ? "border-gray-700 text-gray-500 hover:border-emerald-500/40 hover:text-emerald-200 bg-gray-900/40"
      : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-200 bg-gray-900/40";
  const tagCls = paid
    ? "text-amber-400 border border-amber-500/40 bg-amber-500/10"
    : "text-emerald-400 border border-emerald-500/40 bg-emerald-500/10";

  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex-1 min-w-0 h-[80px] px-1 rounded-md border transition-colors flex flex-col items-center justify-center gap-0.5 ${
        selected ? selectedCls : idleCls
      }`}
    >
      <span className="text-[11px] font-bold leading-none truncate w-full text-center">{label}</span>
      <span className={`text-[8px] leading-none px-1 py-[1px] rounded-sm ${tagCls}`}>
        {paid ? "Claude" : "무료"}
      </span>
      <span className="text-[9px] font-mono leading-none tracking-tight">
        속 {dots(speed)}
      </span>
      <span className="text-[9px] font-mono leading-none tracking-tight">
        추 {dots(reason)}
      </span>
      <span className="text-[9px] font-mono leading-none tracking-tight">
        코 {dots(code)}
      </span>
    </button>
  );
}

function dots(n: 1 | 2 | 3 | 4 | 5) {
  return "●".repeat(n) + "○".repeat(5 - n);
}
