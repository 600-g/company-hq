"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** VersionBanner 모달과 사이드바 VersionBadge 가 dismiss 상태 공유.
 *
 *  핵심: dismiss 는 **commit 단위로 영속화**. 사용자가 commit A 에 [나중에]
 *  누르면 새로고침/탭/디바이스 어디서도 같은 A 로는 모달 다시 안 뜸.
 *  새 commit B 가 push 되면 dismissedCommit !== B 이니 모달 한 번 노출.
 *  사이드바 [업데이트] 칩 클릭 시 강제로 모달 다시 열림 (dismissedCommit 리셋).
 */
/** Banner/Badge 공유 데이터 — Banner 가 60초 polling 으로 set, Badge 는 read 만.
 *  결과: Badge 는 자체 fetch 제거 → 매분 fetch 2 → 1 (50% 절감)
 */
export interface VersionInfoCache {
  build: string;       // production build "{commit}-{ts}"
  version: string;     // "4.39.5" 등
  commit: string;      // 9자 git HEAD commit
  nextVersion?: string;
  ts: number;          // 마지막 갱신 시각 (ms)
}

interface VersionState {
  dismissedCommit: string;            // commit-단위 dismiss 영속
  setDismissedCommit: (sha: string) => void;
  /** 사이드바 칩 클릭 — 강제로 모달 다시 열기 (dismiss 무효화) */
  reopen: () => void;
  /** 호환성 — 기존 컴포넌트가 부르던 setDismissed(false) 매핑 */
  setDismissed: (v: boolean, currentCommit?: string) => void;
  /** 호환성 — Banner 가 hasPending 계산 시 사용 */
  isDismissedFor: (currentCommit: string) => boolean;
  /** Banner→Badge 공유 캐시 (persist X — 메모리만, 새로고침마다 갱신) */
  cache: VersionInfoCache | null;
  setCache: (c: VersionInfoCache) => void;
}

export const useVersionStore = create<VersionState>()(
  persist(
    (set, get) => ({
      dismissedCommit: "",
      cache: null,
      setDismissedCommit: (sha) => set({ dismissedCommit: sha }),
      reopen: () => set({ dismissedCommit: "" }),
      setDismissed: (v, currentCommit) => {
        if (v && currentCommit) set({ dismissedCommit: currentCommit });
        else if (!v) set({ dismissedCommit: "" });
      },
      isDismissedFor: (currentCommit) => {
        const d = get().dismissedCommit;
        return !!(d && currentCommit && d === currentCommit);
      },
      setCache: (c) => set({ cache: c }),
    }),
    {
      name: "doogeun-hq-version-dismiss",
      version: 1,
      // dismissedCommit 만 영속 — cache 는 매번 갱신되니 메모리만
      partialize: (s) => ({ dismissedCommit: s.dismissedCommit }) as Partial<VersionState>,
    }
  )
);
