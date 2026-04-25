"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Trash2, Search, Grid3x3, Edit2, EyeOff, RotateCcw } from "lucide-react";
import {
  FURNITURE_CATEGORIES,
  getVisibleFurnitureList,
  updateFurnitureMeta,
  deleteFurniture,
  restoreFurniture,
  isHiddenFurniture,
  type FurnitureCategory,
  type FurnitureDef,
} from "@/game/tm-furniture-catalog";
import { useLayoutStore, type PlacedFurniture } from "@/stores/layoutStore";
import LayoutActions from "@/components/office/LayoutActions";
import { useAuthStore } from "@/stores/authStore";

const EMPTY: PlacedFurniture[] = [];

interface Props {
  floor: number;
  onClose: () => void;
}

/**
 * 가구 팔레트.
 *  - 카테고리 탭 + 검색
 *  - 드래그 시작 → draggingDefId 설정 (캔버스가 드롭 처리)
 *  - 현재 층 가구 목록 + 삭제
 *  - "바닥 비우기" 버튼
 */
export default function FurniturePalette({ floor, onClose }: Props) {
  const [category, setCategory] = useState<FurnitureCategory | "all">("desk");
  const [query, setQuery] = useState("");
  // ⚠️ 빈 배열 fallback은 매 렌더 새 참조 → 무한 루프. floors 전체 구독 후 파생.
  const floors = useLayoutStore((s) => s.floors);
  const placedOnFloor = floors[floor] ?? EMPTY;
  const setDraggingDef = useLayoutStore((s) => s.setDraggingDef);
  const placingDefId = useLayoutStore((s) => s.placingDefId);
  const setPlacingDef = useLayoutStore((s) => s.setPlacingDef);
  const remove = useLayoutStore((s) => s.remove);
  const clearFloor = useLayoutStore((s) => s.clearFloor);

  const [rev, setRev] = useState(0); // 이름/숨김 변경 후 리렌더 트리거
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "owner" || user?.role === "admin";
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; def: FurnitureDef } | null>(null);

  useEffect(() => {
    const h = () => setRev((r) => r + 1);
    window.addEventListener("hq:furniture-overrides-applied", h);
    return () => window.removeEventListener("hq:furniture-overrides-applied", h);
  }, []);

  const list = useMemo(() => {
    void rev; // 의존성
    let items: FurnitureDef[] = getVisibleFurnitureList();
    if (category !== "all") items = items.filter((f) => f.category === category);
    if (query) {
      const q = query.toLowerCase();
      items = items.filter((f) => f.label.toLowerCase().includes(q) || f.id.toLowerCase().includes(q));
    }
    return items.slice(0, 200);
  }, [category, query, rev]);

  const handleCtx = (e: React.MouseEvent, f: FurnitureDef) => {
    if (!isAdmin) return;
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, def: f });
  };

  const renameItem = () => {
    if (!ctxMenu) return;
    const next = prompt(`"${ctxMenu.def.label}" 새 이름`, ctxMenu.def.label);
    if (next && next.trim() && next !== ctxMenu.def.label) {
      updateFurnitureMeta(ctxMenu.def.id, { label: next.trim() });
      setRev((r) => r + 1);
    }
    setCtxMenu(null);
  };

  const hideItem = () => {
    if (!ctxMenu) return;
    if (confirm(`"${ctxMenu.def.label}" 팔레트에서 숨김?`)) {
      deleteFurniture(ctxMenu.def.id);
      setRev((r) => r + 1);
    }
    setCtxMenu(null);
  };

  const restoreItem = () => {
    if (!ctxMenu) return;
    restoreFurniture(ctxMenu.def.id);
    setRev((r) => r + 1);
    setCtxMenu(null);
  };

  return (
    <div className="w-full rounded-xl border border-gray-800 bg-gray-950/95 backdrop-blur-md shadow-2xl flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="h-11 shrink-0 flex items-center gap-2 px-3 border-b border-gray-800/70">
        <Grid3x3 className="w-4 h-4 text-sky-300" />
        <span className="text-[14px] font-bold text-gray-200">가구 팔레트 · {floor}F</span>
        <span className="ml-auto text-[12px] text-gray-500">{placedOnFloor.length}개</span>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-200" title="닫기 (ESC)">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 카테고리 탭 */}
      <div className="px-2 py-1.5 border-b border-gray-800/50 flex flex-wrap gap-1">
        <CatBtn active={category === "all"} onClick={() => setCategory("all")}>전체</CatBtn>
        {FURNITURE_CATEGORIES.map((c) => (
          <CatBtn key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
            {shortLabel(c.id)}
          </CatBtn>
        ))}
      </div>

      {/* 검색 */}
      <div className="px-2 py-1.5 border-b border-gray-800/50 flex items-center gap-1">
        <Search className="w-3.5 h-3.5 text-gray-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="가구 검색"
          className="flex-1 h-7 rounded border border-gray-800 bg-gray-900/60 px-2 text-[11px] text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
        />
      </div>

      {/* 가구 그리드 — 4열 고정 크기로 통일 */}
      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-4 gap-1.5 min-h-[200px]">
        {list.length === 0 ? (
          <div className="col-span-3 text-center text-[13px] text-gray-500 py-6">검색 결과 없음</div>
        ) : (
          list.map((f) => {
            const picking = placingDefId === f.id;
            const hidden = isHiddenFurniture(f.id);
            return (
              <button
                key={f.id}
                draggable
                onDragStart={() => setDraggingDef(f.id)}
                onDragEnd={() => setDraggingDef(null)}
                onClick={() => setPlacingDef(picking ? null : f.id)}
                onContextMenu={(e) => handleCtx(e, f)}
                title={`${f.label} (${f.widthCells}×${f.heightCells})${isAdmin ? " · 우클릭=이름변경/숨김" : ""}`}
                className={`h-[74px] rounded border cursor-grab active:cursor-grabbing p-1 flex flex-col items-center gap-1 transition-colors overflow-hidden ${
                  picking
                    ? "border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/40"
                    : hidden
                    ? "border-gray-700 bg-gray-900/30 opacity-50"
                    : "border-gray-800 bg-gray-900/60 hover:border-sky-400 hover:bg-sky-500/10"
                }`}
              >
                <SpriteThumb def={f} />
                <span className="text-[10px] leading-tight text-gray-300 truncate w-full text-center">{f.label}</span>
              </button>
            );
          })
        )}
      </div>

      {/* 액션 툴바 */}
      <LayoutActions floor={floor} />

      {/* 관리자 컨텍스트 메뉴 (팔레트 우클릭) */}
      {ctxMenu && isAdmin && (
        <>
          <div className="fixed inset-0 z-[300]"
               onClick={() => setCtxMenu(null)}
               onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
          <div
            className="fixed z-[301] w-44 rounded-lg border border-gray-700 bg-gray-950 shadow-2xl overflow-hidden"
            style={{ left: Math.min(ctxMenu.x, window.innerWidth - 180), top: Math.min(ctxMenu.y, window.innerHeight - 150) }}
          >
            <div className="px-3 py-2 border-b border-gray-800 text-[11px] text-gray-400 truncate">{ctxMenu.def.label}</div>
            <button onClick={renameItem} className="w-full px-3 py-2 text-left text-[12px] text-gray-200 hover:bg-gray-800 flex items-center gap-2">
              <Edit2 className="w-3.5 h-3.5" /> 이름 변경
            </button>
            {isHiddenFurniture(ctxMenu.def.id) ? (
              <button onClick={restoreItem} className="w-full px-3 py-2 text-left text-[12px] text-green-300 hover:bg-gray-800 flex items-center gap-2">
                <RotateCcw className="w-3.5 h-3.5" /> 숨김 해제
              </button>
            ) : (
              <button onClick={hideItem} className="w-full px-3 py-2 text-left text-[12px] text-red-300 hover:bg-gray-800 flex items-center gap-2">
                <EyeOff className="w-3.5 h-3.5" /> 팔레트에서 숨김
              </button>
            )}
          </div>
        </>
      )}

      {/* 현재 층 배치된 목록 */}
      {placedOnFloor.length > 0 && (
        <div className="border-t border-gray-800/60 p-2 max-h-48 overflow-y-auto space-y-1">
          <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
            <span>{floor}F 배치 ({placedOnFloor.length})</span>
            <button
              onClick={() => { if (confirm(`${floor}F 가구 전부 제거?`)) clearFloor(floor); }}
              className="text-red-400 hover:text-red-300 flex items-center gap-0.5"
            >
              <Trash2 className="w-2.5 h-2.5" /> 전부 지우기
            </button>
          </div>
          {placedOnFloor.map((it) => {
            const list = getVisibleFurnitureList();
            const def = list.find((d) => d.id === it.defId);
            if (!def) return null;
            return (
              <div key={it.id} className="flex items-center gap-1.5 text-[10px] text-gray-400 px-1 py-0.5 hover:bg-gray-900/50 rounded">
                <span className="flex-1 truncate">{def.label}</span>
                <span className="text-gray-600 font-mono">{it.col},{it.row}</span>
                <button onClick={() => remove(floor, it.id)} className="text-red-400 hover:text-red-300">
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CatBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-[12px] rounded transition-colors ${
        active ? "bg-sky-500/20 text-sky-200 font-bold" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/40"
      }`}
    >
      {children}
    </button>
  );
}

function shortLabel(id: string): string {
  const map: Record<string, string> = {
    accessory: "소품", appliance: "가전", board: "보드", chair: "의자",
    desk: "책상", divider: "파티션", floor_decor: "바닥", floor_tile: "바닥타일",
    partition: "파티션", plant: "식물", seating: "소파", storage: "수납",
    wall_decor: "벽장식", wall_tile: "벽타일",
  };
  return map[id] || id;
}

/** 스프라이트 썸네일 — 전부 동일 44x44 박스에 contain 으로 맞춤 (그리드 정렬 일관성) */
function SpriteThumb({ def }: { def: FurnitureDef }) {
  const src = def.sheetPath || "/assets/teammaker/tiles/office/furniture-sheet.png";
  const isSinglePng = def.sheetPath && def.sprite.x === 0 && def.sprite.y === 0 && def.sheetPath !== "/assets/teammaker/tiles/office/Room_Builder_Office_32x32.png";
  const BOX = 44;
  const { x, y, w, h } = def.sprite;

  if (isSinglePng) {
    return (
      <div
        className="shrink-0 rounded-sm border border-gray-800/40"
        style={{
          width: BOX,
          height: BOX,
          backgroundImage: `url(${src})`,
          backgroundSize: `${BOX}px ${BOX}px`,
          imageRendering: "pixelated",
        }}
      />
    );
  }

  // 시트 크롭 썸네일 — BOX 안에 contain 비율 유지
  const scale = Math.min(BOX / w, BOX / h, 2);
  const dispW = w * scale;
  const dispH = h * scale;
  return (
    <div
      className="shrink-0 flex items-center justify-center"
      style={{ width: BOX, height: BOX }}
    >
      <div
        style={{
          width: dispW,
          height: dispH,
          backgroundImage: `url(${src})`,
          backgroundPosition: `-${x * scale}px -${y * scale}px`,
          backgroundSize: `${512 * scale}px auto`,
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}
