"use client";

import { create } from "zustand";

/** VersionBanner 모달과 사이드바 VersionBadge 가 dismiss 상태 공유.
 *  사용자가 모달 [나중에]/X 로 닫아도, 사이드바 [업데이트] 칩 클릭 시 다시 열림.
 */
interface VersionState {
  dismissed: boolean;
  setDismissed: (v: boolean) => void;
}

export const useVersionStore = create<VersionState>((set) => ({
  dismissed: false,
  setDismissed: (v) => set({ dismissed: v }),
}));
