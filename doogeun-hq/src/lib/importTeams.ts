"use client";

import { apiBase } from "@/lib/utils";
import { useAgentStore } from "@/stores/agentStore";

interface ServerTeam {
  id: string;
  name: string;
  emoji?: string;
  repo?: string;
  localPath?: string;
  category?: string;
  layer?: number;
  model?: string;
  pinned?: boolean;
  status?: string;
}

interface GuideResponse {
  ok: boolean;
  system_prompt?: string;
  claude_md?: string;
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  total: number;
  promptsFetched: number;
}

/** 서버 쪽 팀 삭제 (GitHub 레포 유지 옵션). teams.json + team_prompts.json 에서 제거 */
export async function deleteTeamOnServer(teamId: string, deleteRepo: boolean = false): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${apiBase()}/api/teams/${teamId}?delete_repo=${deleteRepo ? "1" : "0"}`, { method: "DELETE" });
    const j = await res.json();
    return j;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "연결 실패" };
  }
}

/** 팀 MD 프롬프트를 서버에 저장 (지속 동기화 — CLAUDE.md / team_prompts.json) */
export async function saveTeamPromptToServer(teamId: string, systemPromptMd: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${apiBase()}/api/teams/${teamId}/guide`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system_prompt: systemPromptMd }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "연결 실패" };
  }
}

/** 서버 teams.json + /api/teams/{id}/guide → 로컬 agentStore 동기화.
 *  - MD (system_prompt 또는 CLAUDE.md) 까지 가져와 systemPromptMd 로 저장
 *  - 같은 id: 이름/이모지/레포/프롬프트 갱신. position/floor/activity 는 보존
 *  - server-monitor 스킵 (캐릭터 없는 팀)
 */
export async function importTeamsFromServer(opts?: {
  includeSystemTeams?: boolean;
  fetchPrompts?: boolean;  // true (기본) — 각 팀별 /guide 호출
}): Promise<ImportResult> {
  const res = await fetch(`${apiBase()}/api/teams`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const teams: ServerTeam[] = await res.json();

  const skipIds = new Set(["server-monitor"]);
  const fetchPrompts = opts?.fetchPrompts !== false;
  const state = useAgentStore.getState();
  const existing = new Map(state.agents.map((a) => [a.id, a]));
  let added = 0, updated = 0, skipped = 0, promptsFetched = 0;

  for (const t of teams) {
    if (!opts?.includeSystemTeams && skipIds.has(t.id)) { skipped++; continue; }

    // MD 프롬프트 수집 (병렬이 아니라 순차 — 서버 부하 방지)
    let systemPromptMd = "";
    if (fetchPrompts) {
      try {
        const gr = await fetch(`${apiBase()}/api/teams/${t.id}/guide`);
        if (gr.ok) {
          const g: GuideResponse = await gr.json();
          if (g.ok) {
            // 기본: system_prompt 사용. CLAUDE.md 더 자세하면 그걸 부가 설명으로
            systemPromptMd = (g.system_prompt || "").trim();
            if (g.claude_md && g.claude_md.trim()) {
              systemPromptMd = `${systemPromptMd}\n\n---\n\n# CLAUDE.md (레포)\n\n${g.claude_md.trim()}`;
            }
            promptsFetched++;
          }
        }
      } catch { /* guide API 실패해도 팀 자체는 가져오기 */ }
    }

    const isCpo = t.id.toLowerCase().includes("cpo") || (t.name || "").includes("관리자");
    const cur = existing.get(t.id);
    if (cur) {
      const patch: Partial<typeof cur> = {
        name: t.name,
        emoji: t.emoji || cur.emoji,
        githubRepo: t.repo || cur.githubRepo,
      };
      if (systemPromptMd && !cur.systemPromptMd) patch.systemPromptMd = systemPromptMd;
      if (!cur.role && t.category) patch.role = t.category;
      if (!cur.description && t.status) patch.description = t.status;
      // CPO 는 항상 1F 강제 (이전 잘못 저장된 값 보정)
      if (isCpo && cur.floor !== 1) patch.floor = 1;
      state.updateAgent(t.id, patch);
      updated++;
    } else {
      const now = Date.now();
      // 전원 1F 로 배치 — 첫 화면(1F) 허전함 방지. 사용자가 수동으로 층 변경 가능.
      useAgentStore.setState({
        agents: [
          ...useAgentStore.getState().agents,
          {
            id: t.id,
            name: t.name,
            emoji: t.emoji || "🤖",
            role: t.category || "general",
            description: t.status || "",
            systemPromptMd,
            githubRepo: t.repo,
            status: "idle",
            floor: 1,
            createdAt: now,
            updatedAt: now,
            activity: [{
              ts: now,
              text: `서버에서 가져옴 · ${t.category || "general"}${systemPromptMd ? " (MD 포함)" : ""}`,
            }],
          },
        ],
      });
      added++;
    }
  }
  return { added, updated, skipped, total: teams.length, promptsFetched };
}
