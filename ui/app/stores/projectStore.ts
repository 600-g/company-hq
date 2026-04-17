"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Phase 7: 프로젝트(세션의 실제 작업 컨텍스트) 상태.
 *  팀메이커 projectStore + session 메타 필드 통합 버전.
 */
export interface ProjectState {
  /** 현재 활성 팀 ID */
  activeTeamId: string | null;
  /** 팀별 작업 디렉토리 (에이전트가 파일 조작 시 기준 경로) */
  workingDirectoryByTeam: Record<string, string>;
  /** 팀별 GitHub 레포 */
  githubRepoByTeam: Record<string, string>;
  /** 팀별 Supabase 프로젝트 id */
  supabaseProjectIdByTeam: Record<string, string>;

  setActiveTeam: (teamId: string | null) => void;
  setWorkingDirectory: (teamId: string, dir: string | null) => void;
  setGithubRepo: (teamId: string, repo: string | null) => void;
  setSupabaseProject: (teamId: string, projectId: string | null) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      activeTeamId: null,
      workingDirectoryByTeam: {},
      githubRepoByTeam: {},
      supabaseProjectIdByTeam: {},
      setActiveTeam: (teamId) => set({ activeTeamId: teamId }),
      setWorkingDirectory: (teamId, dir) => set((s) => {
        const next = { ...s.workingDirectoryByTeam };
        if (dir) next[teamId] = dir; else delete next[teamId];
        return { workingDirectoryByTeam: next };
      }),
      setGithubRepo: (teamId, repo) => set((s) => {
        const next = { ...s.githubRepoByTeam };
        if (repo) next[teamId] = repo; else delete next[teamId];
        return { githubRepoByTeam: next };
      }),
      setSupabaseProject: (teamId, pid) => set((s) => {
        const next = { ...s.supabaseProjectIdByTeam };
        if (pid) next[teamId] = pid; else delete next[teamId];
        return { supabaseProjectIdByTeam: next };
      }),
    }),
    { name: "hq-project-store" },
  ),
);
