"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 오피스 가구 배치 (layout). 각 층(1~3) 별로 가구 인스턴스 리스트 유지 */

export interface PlacedFurniture {
  id: string;              // 고유 인스턴스 id
  defId: string;           // FURNITURE_CATALOG의 def id
  col: number;             // 그리드 좌표 (32px 단위)
  row: number;
  rotation?: 0 | 90 | 180 | 270;
  flipX?: boolean;         // 좌우 대칭
}

interface LayoutState {
  /** 층별 가구 배치 */
  floors: Record<number, PlacedFurniture[]>;
  /** 편집 모드 ON/OFF */
  editMode: boolean;
  /** 현재 선택된 가구 인스턴스 (이동/삭제 대상) */
  selectedInstanceId: string | null;
  /** 팔레트에서 "드래그 중" 인 defId (preview용) */
  draggingDefId: string | null;
  /** 클릭 배치 모드 — 이 defId 선택된 상태에서 오피스 클릭 시 해당 위치에 배치 */
  placingDefId: string | null;

  setEditMode: (on: boolean) => void;
  setDraggingDef: (id: string | null) => void;
  setPlacingDef: (id: string | null) => void;
  selectInstance: (id: string | null) => void;

  place: (floor: number, defId: string, col: number, row: number, opts?: { rotation?: 0 | 90 | 180 | 270; flipX?: boolean }) => string;
  move: (floor: number, instanceId: string, col: number, row: number) => void;
  remove: (floor: number, instanceId: string) => void;
  clearFloor: (floor: number) => void;
  rotateInstance: (floor: number, instanceId: string) => void;
  flipInstance: (floor: number, instanceId: string) => void;
  /** 배치 모드에서 미리보기 회전/대칭 */
  placingRotation: 0 | 90 | 180 | 270;
  placingFlipX: boolean;
  cyclePlacingRotation: () => void;
  togglePlacingFlip: () => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      floors: {},
      editMode: false,
      selectedInstanceId: null,
      draggingDefId: null,
      placingDefId: null,
      placingRotation: 0,
      placingFlipX: false,

      setEditMode: (on) => set({ editMode: on, selectedInstanceId: null, draggingDefId: null, placingDefId: null, placingRotation: 0, placingFlipX: false }),
      setDraggingDef: (id) => set({ draggingDefId: id }),
      setPlacingDef: (id) => set({ placingDefId: id, placingRotation: 0, placingFlipX: false }),
      selectInstance: (id) => set({ selectedInstanceId: id }),
      cyclePlacingRotation: () =>
        set((s) => ({ placingRotation: ((s.placingRotation + 90) % 360) as 0 | 90 | 180 | 270 })),
      togglePlacingFlip: () => set((s) => ({ placingFlipX: !s.placingFlipX })),

      place: (floor, defId, col, row, opts) => {
        const instanceId = `f${floor}-${defId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        set((s) => {
          const cur = s.floors[floor] || [];
          return {
            floors: {
              ...s.floors,
              [floor]: [...cur, {
                id: instanceId, defId, col, row,
                rotation: opts?.rotation ?? s.placingRotation,
                flipX: opts?.flipX ?? s.placingFlipX,
              }],
            },
          };
        });
        return instanceId;
      },
      rotateInstance: (floor, instanceId) =>
        set((s) => ({
          floors: {
            ...s.floors,
            [floor]: (s.floors[floor] || []).map((it) =>
              it.id === instanceId
                ? { ...it, rotation: (((it.rotation ?? 0) + 90) % 360) as 0 | 90 | 180 | 270 }
                : it,
            ),
          },
        })),
      flipInstance: (floor, instanceId) =>
        set((s) => ({
          floors: {
            ...s.floors,
            [floor]: (s.floors[floor] || []).map((it) =>
              it.id === instanceId ? { ...it, flipX: !it.flipX } : it,
            ),
          },
        })),
      move: (floor, instanceId, col, row) =>
        set((s) => ({
          floors: {
            ...s.floors,
            [floor]: (s.floors[floor] || []).map((it) => (it.id === instanceId ? { ...it, col, row } : it)),
          },
        })),
      remove: (floor, instanceId) =>
        set((s) => ({
          floors: {
            ...s.floors,
            [floor]: (s.floors[floor] || []).filter((it) => it.id !== instanceId),
          },
          selectedInstanceId: s.selectedInstanceId === instanceId ? null : s.selectedInstanceId,
        })),
      clearFloor: (floor) =>
        set((s) => ({ floors: { ...s.floors, [floor]: [] } })),
    }),
    {
      name: "doogeun-hq-layout",
      partialize: (state) => ({ floors: state.floors }),
    },
  ),
);
