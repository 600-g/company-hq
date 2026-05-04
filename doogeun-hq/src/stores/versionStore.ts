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
interface VersionState {
  dismissedCommit: string;            // commit-단위 dismiss 영속
  setDismissedCommit: (sha: string) => void;
  /** 사이드바 칩 클릭 — 강제로 모달 다시 열기 (dismiss 무효화) */
  reopen: () => void;
  /** 호환성 — 기존 컴포넌트가 부르던 setDismissed(false) 매핑 */
  setDismissed: (v: boolean, currentCommit?: string) => void;
  /** 호환성 — Banner 가 hasPending 계산 시 사용 */
  isDismissedFor: (currentCommit: string) => boolean;
}

export const useVersionStore = create<VersionState>()(
  persist(
    (set, get) => ({
      dismissedCommit: "",
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
    }),
    {
      name: "doogeun-hq-version-dismiss",
      version: 1,
    }
  )
);
