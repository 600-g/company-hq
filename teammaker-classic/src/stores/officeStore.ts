import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Viewport, DragState } from "@/types/canvas";
import {
  TileType,
  createDefaultLayout,
  type OfficeLayout,
  type EditorMode,
  type TileSelection,
  type PlacedFurniture,
  type FloorColor,
} from "@/types/office-layout";
import { getFurnitureDef } from "@/config/furniture-catalog";
import { agentOccKey } from "@/lib/grid";

const MAX_UNDO = 10;

interface OfficeState {
  // --- Existing ---
  viewport: Viewport;
  dragState: DragState;
  occupiedCells: Map<string, string>;

  // --- Layout ---
  layout: OfficeLayout;
  layoutHistory: OfficeLayout[];
  editorMode: EditorMode;
  tileSelection: TileSelection;
  selectedFurnitureType: string | null;
  managerPosition: { x: number; y: number } | null;
  /** View-mode zoom multiplier (persisted) */
  viewZoom: number;

  // --- Existing actions ---
  setViewport: (viewport: Partial<Viewport>) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  startDrag: (source: "palette" | "canvas") => void;
  updateDrag: (position: { x: number; y: number }) => void;
  endDrag: () => void;
  occupyCell: (x: number, y: number, agentId: string) => void;
  freeCell: (x: number, y: number) => void;
  isCellOccupied: (x: number, y: number) => boolean;
  restoreOccupiedCells: (agents: { id: string; position: { x: number; y: number } }[]) => void;

  // --- Layout actions ---
  setEditorMode: (mode: EditorMode) => void;
  setTileSelection: (sel: Partial<TileSelection>) => void;
  setSelectedFurnitureType: (type: string | null) => void;

  setTile: (col: number, row: number, type: TileType) => void;
  setTileColor: (col: number, row: number, color: FloorColor) => void;
  placeFurniture: (item: PlacedFurniture) => void;
  removeFurniture: (uid: string) => void;
  moveFurniture: (uid: string, col: number, row: number) => void;
  moveFurnitureBatch: (moves: { uid: string; col: number; row: number }[]) => void;
  rotateFurniture: (uid: string) => void;
  rotateFurnitureBatch: (uids: string[]) => void;
  bringForward: (uids: string[]) => void;
  sendBackward: (uids: string[]) => void;

  setManagerPosition: (pos: { x: number; y: number }) => void;
  setViewZoom: (zoom: number) => void;

  /** Erase a tile + furniture without pushing undo (for mid-drag batch operations) */
  eraseTileNoHistory: (col: number, row: number) => void;
  /** Push a single undo snapshot (call before starting a batch erase drag) */
  pushUndoSnapshot: () => void;

  resizeLayout: (newCols: number, newRows: number) => void;
  resetLayout: (cols?: number, rows?: number) => void;
  importLayout: (json: string) => boolean;
  exportLayout: () => string;
  undo: () => void;
}

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2.0;

const DEFAULT_TILE_SELECTION: TileSelection = {
  wallSetId: "wall_lavender_A",
  floorSetId: "floor_lavender_1",
  floorTileType: TileType.FLOOR_1,
  dividerTileId: "divider_single",
  wallTileId: "wall_lavender_A_c",
  floorTileId: "floor_lavender_1",
};

/** Push current layout to undo history (call before mutating layout) */
function pushHistory(state: OfficeState): { layoutHistory: OfficeLayout[] } {
  const history = [...state.layoutHistory, state.layout];
  if (history.length > MAX_UNDO) history.shift();
  return { layoutHistory: history };
}

/** Check if editor mode is enabled via localStorage flag */
export function isEditorEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("EDITOR_MODE") === "true";
}

export const useOfficeStore = create<OfficeState>()(
  persist(
    (set, get) => ({
      // --- Existing state ---
      viewport: { x: 0, y: 0, zoom: 1 },
      dragState: { isDragging: false, source: null, position: null },
      occupiedCells: new Map(),

      // --- Layout state ---
      layout: createDefaultLayout(),
      layoutHistory: [] as OfficeLayout[],
      editorMode: "view" as EditorMode,
      tileSelection: { ...DEFAULT_TILE_SELECTION },
      selectedFurnitureType: null,
      managerPosition: null,
      viewZoom: 1.4,

      // --- Existing actions ---
      setViewport: (viewport) =>
        set((state) => ({ viewport: { ...state.viewport, ...viewport } })),

      zoomIn: () =>
        set((state) => ({
          viewport: {
            ...state.viewport,
            zoom: Math.min(state.viewport.zoom + ZOOM_STEP, ZOOM_MAX),
          },
        })),

      zoomOut: () =>
        set((state) => ({
          viewport: {
            ...state.viewport,
            zoom: Math.max(state.viewport.zoom - ZOOM_STEP, ZOOM_MIN),
          },
        })),

      zoomReset: () =>
        set((state) => ({
          viewport: { ...state.viewport, zoom: 1 },
        })),

      startDrag: (source) =>
        set({ dragState: { isDragging: true, source, position: null } }),

      updateDrag: (position) =>
        set((state) => ({
          dragState: { ...state.dragState, position },
        })),

      endDrag: () =>
        set({
          dragState: { isDragging: false, source: null, position: null },
        }),

      occupyCell: (x, y, agentId) =>
        set((state) => {
          const cells = new Map(state.occupiedCells);
          cells.set(`${x},${y}`, agentId);
          return { occupiedCells: cells };
        }),

      freeCell: (x, y) =>
        set((state) => {
          const cells = new Map(state.occupiedCells);
          cells.delete(`${x},${y}`);
          return { occupiedCells: cells };
        }),

      isCellOccupied: (x, y) => get().occupiedCells.has(`${x},${y}`),

      restoreOccupiedCells: (agents) => {
        const cells = new Map<string, string>();
        for (const agent of agents) {
          const { gx, gy } = agentOccKey(agent.position.x, agent.position.y);
          cells.set(`${gx},${gy}`, agent.id);
        }
        set({ occupiedCells: cells });
      },

      // --- Layout actions ---
      setEditorMode: (mode) => set({ editorMode: mode }),

      setTileSelection: (sel) =>
        set((state) => ({
          tileSelection: { ...state.tileSelection, ...sel },
        })),

      setSelectedFurnitureType: (type) =>
        set({ selectedFurnitureType: type }),

      setManagerPosition: (pos) => set({ managerPosition: pos }),
      setViewZoom: (zoom) => set({ viewZoom: zoom }),

      setTile: (col, row, type) =>
        set((state) => {
          const { layout, tileSelection } = state;
          if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows)
            return state;
          const i = row * layout.cols + col;
          const newWallSetId = type === TileType.WALL ? tileSelection.wallSetId : "";
          const oldWallSetId = layout.wallSetIds?.[i] ?? "";
          // Skip if nothing changed
          if (layout.tiles[i] === type && oldWallSetId === newWallSetId) return state;
          const tiles = [...layout.tiles];
          tiles[i] = type;
          const wallSetIds = [...(layout.wallSetIds ?? [])];
          while (wallSetIds.length < layout.cols * layout.rows) wallSetIds.push("");
          wallSetIds[i] = newWallSetId;
          return { ...pushHistory(state), layout: { ...layout, tiles, wallSetIds } };
        }),

      setTileColor: (col, row, color) =>
        set((state) => {
          const { layout } = state;
          if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows)
            return state;
          const i = row * layout.cols + col;
          const tileColors = [...layout.tileColors];
          tileColors[i] = { ...color };
          return { ...pushHistory(state), layout: { ...layout, tileColors } };
        }),

      placeFurniture: (item) =>
        set((state) => ({
          ...pushHistory(state),
          layout: {
            ...state.layout,
            furniture: [...state.layout.furniture, item],
          },
        })),

      removeFurniture: (uid) =>
        set((state) => ({
          ...pushHistory(state),
          layout: {
            ...state.layout,
            furniture: state.layout.furniture.filter((f) => f.uid !== uid),
          },
        })),

      moveFurniture: (uid, col, row) =>
        set((state) => ({
          ...pushHistory(state),
          layout: {
            ...state.layout,
            furniture: state.layout.furniture.map((f) =>
              f.uid === uid ? { ...f, col, row } : f
            ),
          },
        })),

      moveFurnitureBatch: (moves) =>
        set((state) => {
          const moveMap = new Map(moves.map((m) => [m.uid, m]));
          return {
            ...pushHistory(state),
            layout: {
              ...state.layout,
              furniture: state.layout.furniture.map((f) => {
                const m = moveMap.get(f.uid);
                return m ? { ...f, col: m.col, row: m.row } : f;
              }),
            },
          };
        }),

      rotateFurniture: (uid) =>
        set((state) => ({
          ...pushHistory(state),
          layout: {
            ...state.layout,
            furniture: state.layout.furniture.map((f) =>
              f.uid === uid ? { ...f, rotation: ((f.rotation ?? 0) + 1) % 4 } : f
            ),
          },
        })),

      rotateFurnitureBatch: (uids) =>
        set((state) => {
          const uidSet = new Set(uids);
          return {
            ...pushHistory(state),
            layout: {
              ...state.layout,
              furniture: state.layout.furniture.map((f) =>
                uidSet.has(f.uid) ? { ...f, rotation: ((f.rotation ?? 0) + 1) % 4 } : f
              ),
            },
          };
        }),

      bringForward: (uids) =>
        set((state) => {
          const uidSet = new Set(uids);
          return {
            ...pushHistory(state),
            layout: {
              ...state.layout,
              furniture: state.layout.furniture.map((f) =>
                uidSet.has(f.uid) ? { ...f, zOrder: (f.zOrder ?? 0) + 1 } : f
              ),
            },
          };
        }),

      sendBackward: (uids) =>
        set((state) => {
          const uidSet = new Set(uids);
          return {
            ...pushHistory(state),
            layout: {
              ...state.layout,
              furniture: state.layout.furniture.map((f) =>
                uidSet.has(f.uid) ? { ...f, zOrder: (f.zOrder ?? 0) - 1 } : f
              ),
            },
          };
        }),

      pushUndoSnapshot: () =>
        set((state) => pushHistory(state)),

      eraseTileNoHistory: (col, row) =>
        set((state) => {
          const { layout } = state;
          if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows)
            return state;
          const i = row * layout.cols + col;

          // Remove all furniture at this position (dividers, furniture, wall/floor tiles)
          const furniture = layout.furniture.filter((f) => {
            const def = getFurnitureDef(f.type);
            if (!def) return true;
            return !(col >= f.col && col < f.col + def.widthCells &&
                     row >= f.row && row < f.row + def.heightCells);
          });

          // Set tile to VOID
          if (layout.tiles[i] === TileType.VOID && furniture.length === layout.furniture.length)
            return state; // nothing to erase
          const tiles = [...layout.tiles];
          tiles[i] = TileType.VOID;
          const wallSetIds = [...(layout.wallSetIds ?? [])];
          while (wallSetIds.length < layout.cols * layout.rows) wallSetIds.push("");
          wallSetIds[i] = "";
          return { layout: { ...layout, tiles, wallSetIds, furniture } };
        }),

      resizeLayout: (newCols, newRows) =>
        set((state) => {
          const { layout } = state;
          // Only expand, never shrink
          if (newCols <= layout.cols && newRows <= layout.rows) return state;
          const cols = Math.max(newCols, layout.cols);
          const rows = Math.max(newRows, layout.rows);
          const total = cols * rows;
          const tiles: TileType[] = new Array(total).fill(TileType.FLOOR_1);
          const tileColors: FloorColor[] = new Array(total);
          const wallSetIds: string[] = new Array(total).fill("");
          const defaultColor = { h: 0, s: 0, b: 1, contrast: 0 };
          for (let i = 0; i < total; i++) tileColors[i] = { ...defaultColor };
          const oldWallSetIds = layout.wallSetIds ?? [];

          // Copy existing data
          for (let r = 0; r < layout.rows; r++) {
            for (let c = 0; c < layout.cols; c++) {
              const oldIdx = r * layout.cols + c;
              const newIdx = r * cols + c;
              tiles[newIdx] = layout.tiles[oldIdx];
              tileColors[newIdx] = layout.tileColors[oldIdx];
              wallSetIds[newIdx] = oldWallSetIds[oldIdx] ?? "";
            }
          }

          // Extend wall rows for new columns
          const wallRows = Math.min(3, layout.rows);
          const defaultWallSet = state.tileSelection.wallSetId;
          for (let r = 0; r < wallRows; r++) {
            for (let c = layout.cols; c < cols; c++) {
              const idx = r * cols + c;
              tiles[idx] = TileType.WALL;
              wallSetIds[idx] = defaultWallSet;
            }
          }

          return {
            layout: { ...layout, cols, rows, tiles, tileColors, wallSetIds },
          };
        }),

      resetLayout: (cols, rows) =>
        set((state) => ({
          ...pushHistory(state),
          layout: createDefaultLayout(cols, rows),
        })),

      importLayout: (json) => {
        try {
          const parsed = JSON.parse(json) as OfficeLayout;
          if (
            parsed.version !== 1 ||
            !Array.isArray(parsed.tiles) ||
            !Array.isArray(parsed.tileColors) ||
            !Array.isArray(parsed.furniture) ||
            typeof parsed.cols !== "number" ||
            typeof parsed.rows !== "number"
          ) {
            return false;
          }
          if (parsed.tiles.length !== parsed.cols * parsed.rows) return false;
          if (parsed.tileColors.length !== parsed.cols * parsed.rows)
            return false;
          // Clean up furniture items without catalog definitions
          parsed.furniture = parsed.furniture.filter(
            (f) => getFurnitureDef(f.type) !== undefined
          );
          // Migrate: add wallSetIds if missing
          if (!Array.isArray(parsed.wallSetIds) || parsed.wallSetIds.length !== parsed.cols * parsed.rows) {
            const total = parsed.cols * parsed.rows;
            const wallSetIds: string[] = new Array(total).fill("");
            const defaultWall = get().tileSelection.wallSetId;
            for (let i = 0; i < total; i++) {
              if (parsed.tiles[i] === TileType.WALL) wallSetIds[i] = defaultWall;
            }
            parsed.wallSetIds = wallSetIds;
          }
          // Fix VOID tiles that have floor_tile furniture → set to FLOOR_1
          for (const f of parsed.furniture) {
            const def = getFurnitureDef(f.type);
            if (!def || def.category !== "floor_tile") continue;
            for (let tr = 0; tr < def.heightCells; tr++) {
              for (let tc = 0; tc < def.widthCells; tc++) {
                const x = f.col + tc;
                const y = f.row + tr;
                if (x < 0 || x >= parsed.cols || y < 0 || y >= parsed.rows) continue;
                const idx = y * parsed.cols + x;
                if (parsed.tiles[idx] === TileType.VOID) {
                  parsed.tiles[idx] = TileType.FLOOR_1;
                }
              }
            }
          }
          set((state) => ({ ...pushHistory(state), layout: parsed }));
          return true;
        } catch {
          return false;
        }
      },

      exportLayout: () => {
        return JSON.stringify(get().layout, null, 2);
      },

      undo: () =>
        set((state) => {
          if (state.layoutHistory.length === 0) return state;
          const history = [...state.layoutHistory];
          const prev = history.pop()!;
          return { layoutHistory: history, layout: prev };
        }),
    }),
    {
      name: "teammaker-office",
      partialize: (state) => ({
        layout: state.layout,
        tileSelection: state.tileSelection,
        managerPosition: state.managerPosition,
        viewZoom: state.viewZoom,
      }),
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<OfficeState>) };
        // Clean up furniture items without catalog definitions
        const layout = merged.layout;
        if (layout?.furniture) {
          const before = layout.furniture.length;
          layout.furniture = layout.furniture.filter(
            (f: PlacedFurniture) => getFurnitureDef(f.type) !== undefined
          );
          const removed = before - layout.furniture.length;
          if (removed > 0) {
          }
        }
        // Migrate: ensure wallSetIds exists on loaded layout
        if (layout && (!Array.isArray(layout.wallSetIds) || layout.wallSetIds.length !== layout.cols * layout.rows)) {
          const total = layout.cols * layout.rows;
          const wallSetIds: string[] = new Array(total).fill("");
          const defaultWall = merged.tileSelection?.wallSetId ?? DEFAULT_TILE_SELECTION.wallSetId;
          for (let i = 0; i < total; i++) {
            if (layout.tiles[i] === TileType.WALL) wallSetIds[i] = defaultWall;
          }
          merged.layout = { ...layout, wallSetIds };
        }
        // Migrate: fix VOID tiles that have floor_tile furniture → set to FLOOR_1
        if (merged.layout?.furniture && merged.layout.tiles) {
          const l = merged.layout;
          let fixed = false;
          for (const f of l.furniture) {
            const def = getFurnitureDef(f.type);
            if (!def) continue;
            if (def.category !== "floor_tile") continue;
            for (let tr = 0; tr < def.heightCells; tr++) {
              for (let tc = 0; tc < def.widthCells; tc++) {
                const x = f.col + tc;
                const y = f.row + tr;
                if (x < 0 || x >= l.cols || y < 0 || y >= l.rows) continue;
                const idx = y * l.cols + x;
                if (l.tiles[idx] === TileType.VOID) {
                  l.tiles[idx] = TileType.FLOOR_1;
                  fixed = true;
                }
              }
            }
          }
          if (fixed) merged.layout = { ...l };
        }
        return merged;
      },
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          return JSON.parse(str);
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);

/** Load default preset if no layout has been persisted yet */
export async function loadDefaultPresetIfNeeded() {
  const stored = localStorage.getItem("teammaker-office");
  if (stored) return; // already has saved layout
  try {
    const res = await fetch("/layouts/default.json");
    const text = await res.text();
    useOfficeStore.getState().importLayout(text);
  } catch {
  }
}
