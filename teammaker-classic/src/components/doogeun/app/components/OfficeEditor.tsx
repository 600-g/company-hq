"use client";

import { useEffect, useRef, useState } from "react";
import { FURNITURE_CATALOG, FURNITURE_CATEGORIES, type FurnitureDef, type FurnitureCategory, updateFurnitureMeta, deleteFurniture, isHiddenFurniture, syncFurnitureOverridesToServer, fetchAndApplyFurnitureOverrides } from "../game/tm-furniture-catalog";
import { toKoreanLabel } from "../game/tm-label-ko";

// TM 바닥/벽 타일 — standalone PNG 사용 (1x1)
const TM_TILES = [
  { id: "hq_white_marble", label: "흰 마블 (기본)", special: true },
  { id: "floor_lavender_1", label: "라벤더 바닥" },
  { id: "floor_lavender_2", label: "라벤더 바닥2" },
  { id: "floor_gray_1", label: "회색 바닥" },
  { id: "floor_pink_1", label: "핑크 바닥" },
  { id: "floor_brick_1", label: "벽돌 바닥" },
  { id: "floor_wood", label: "나무 바닥(포켓몬)", special: true, poke: true },
  { id: "floor_carpet", label: "카펫(포켓몬)", special: true, poke: true },
  { id: "wall_lavender_A_c", label: "라벤더 벽" },
  { id: "wall_lavender_C_c", label: "라벤더 외벽" },
  { id: "wall_brick_A_c", label: "벽돌 벽" },
  { id: "wall_brick_A_t", label: "벽돌 벽(위)" },
  { id: "wall_pink_A_c", label: "핑크 벽" },
  { id: "wall_pink_A_t", label: "핑크 벽(위)" },
  { id: "wall_gray_A_c", label: "회색 벽" },
  { id: "wall_gray_A_t", label: "회색 벽(위)" },
  { id: "divider_vertical", label: "세로 가림막" },
  { id: "divider_horizontal", label: "가로 가림막" },
  { id: "divider_outer_tl", label: "모서리 좌상" },
  { id: "divider_outer_tr", label: "모서리 우상" },
  { id: "divider_outer_bl", label: "모서리 좌하" },
  { id: "divider_outer_br2", label: "모서리 우하" },
];

// 포켓몬 가구 — 검증된 것만 각 TM 카테고리에 병합
// (잘림/배경 검정 이슈 있는 항목 제외)
const POKEMON_EXTRAS: Array<{ id: string; label: string; category: FurnitureCategory }> = [
  // 의자 — id와 실제 이미지 불일치 정정
  { id: "chair_front", label: "의자 옆(P)", category: "chair" },  // 실제 옆모습
  { id: "chair_back", label: "의자 앞(P)", category: "chair" },   // 실제 앞모습
  // 스툴(P) — accessory로 이동 (앉는 기능 없음)
  { id: "stool_side", label: "스툴(P)", category: "accessory" },
  // 식물
  { id: "plant_1", label: "화분1(P)", category: "plant" },
  { id: "plant_2", label: "화분2(P)", category: "plant" },
  { id: "plant_large", label: "큰화분(P)", category: "plant" },
  // 수납
  { id: "bookshelf", label: "책장(P)", category: "storage" },
  { id: "cabinet", label: "캐비닛(P)", category: "storage" },
  // 가전 (stackable)
  { id: "laptop_v_half_left", label: "노트북(P,R회전)", category: "appliance" },
];

const LS_KEY = "hq-user-layout-v1";

type UserItem = { type: string; col: number; row: number; rotation?: 0|1|2|3; flipX?: boolean; source?: "tm"|"pokemon" };
export type UserLayout = { version: 1 | 2; items: UserItem[]; removed?: string[] };  // removed: TM 기본 가구 제거할 "col,row" 키

// 서버 API base (LoginPage 등과 동일 규칙)
function layoutApiBase(): string {
  if (typeof window === "undefined") return "https://api.600g.net";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h === "127.0.0.1" || h.endsWith(".local") || h.startsWith("192.168.");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

export function loadUserLayout(): UserLayout {
  // 동기 로드 — 캐시 우선 (씬 부팅 시 즉시 사용). 서버 동기화는 fetchAndSyncUserLayout으로 비동기 처리.
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { version: 2, items: p.items || [], removed: p.removed || [] };
    }
  } catch {}
  return { version: 2, items: [], removed: [] };
}

// 비동기 서버 페치 — 호출 후 변경 있으면 hq:layout-reload 디스패치
let lastSyncedHash = "";
function hashLayout(l: UserLayout): string {
  return JSON.stringify({ i: l.items, r: l.removed || [] });
}

function _isEditingNow(): boolean {
  if (typeof window === "undefined") return false;
  const until = (window as unknown as { __hqEditingUntil?: number }).__hqEditingUntil ?? 0;
  return until > Date.now();
}

export async function fetchAndSyncUserLayout(): Promise<void> {
  // 편집 중이면 폴링 자체 스킵 — 사용자 변경을 서버 옛날 버전으로 덮어쓰는 것 방지
  if (_isEditingNow()) return;
  try {
    const res = await fetch(`${layoutApiBase()}/api/layout/office`, { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    if (!j?.ok || !j.layout) return;
    const server: UserLayout = { version: 2, items: j.layout.items || [], removed: j.layout.removed || [] };
    const serverHash = hashLayout(server);
    const local = loadUserLayout();
    const localHash = hashLayout(local);
    if (serverHash === localHash) {
      lastSyncedHash = serverHash;
      return;
    }
    // 다시 한번 편집 중 체크 (fetch 도는 동안 사용자가 편집 시작했을 수 있음)
    if (_isEditingNow()) return;

    // ── 동기화 방향 결정 ──
    // 1) 서버가 비어있고 로컬에 데이터가 있으면 → 로컬을 서버에 PUSH (덮어쓰기 금지)
    if ((server.items.length === 0) && local.items.length > 0) {
      saveUserLayout(local);
      return;
    }
    // 2) 이미 한 번 싱크된 상태에서 로컬이 lastSyncedHash와 다르면 편집 중 → 서버 덮어쓰기 금지
    if (lastSyncedHash !== "" && localHash !== lastSyncedHash) return;
    // 3) 그 외 → 서버 값으로 로컬 갱신 (다른 기기 변경 받기)
    try { localStorage.setItem(LS_KEY, JSON.stringify(server)); } catch {}
    lastSyncedHash = serverHash;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("hq:layout-reload"));
    }
  } catch {}
}

let saveDebounce: ReturnType<typeof setTimeout> | null = null;
export function saveUserLayout(layout: UserLayout) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(layout)); } catch {}
  // 편집 중 플래그 갱신 (다른 폴링 차단)
  if (typeof window !== "undefined") {
    (window as unknown as { __hqEditingUntil?: number }).__hqEditingUntil = Date.now() + 30_000;
  }
  // 낙관적 해시 선반영 — 다음 폴링에서 로컬=서버로 판정되어 덮어쓰기 막힘.
  // 실제 PUT 성공하면 그대로 유지, 실패해도 다음 saveUserLayout이 다시 보정.
  lastSyncedHash = hashLayout(layout);
  // 서버 푸시 (디바운스 600ms) — 연속 배치/삭제 시 마지막만 PUT
  if (saveDebounce) clearTimeout(saveDebounce);
  saveDebounce = setTimeout(async () => {
    const h = hashLayout(layout);
    try {
      const res = await fetch(`${layoutApiBase()}/api/layout/office`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout }),
      });
      if (res.ok) lastSyncedHash = h;
    } catch {}
  }, 600);
}

// 포켓몬 소품 라벨 오버라이드 (localStorage)
function pokeLabelOverride(id: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem("hq-poke-label-overrides");
    if (!raw) return fallback;
    const o = JSON.parse(raw);
    return o[id] || fallback;
  } catch { return fallback; }
}
function isPokeHiddenByAdmin(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem("hq-poke-hidden");
    if (!raw) return false;
    return (JSON.parse(raw) as string[]).includes(id);
  } catch { return false; }
}
// 바닥/벽 타일 오버라이드 (localStorage)
function tileLabelOverride(id: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem("hq-tile-label-overrides");
    if (!raw) return fallback;
    const o = JSON.parse(raw);
    return o[id] || fallback;
  } catch { return fallback; }
}
function isTileHiddenByAdmin(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem("hq-tile-hidden");
    if (!raw) return false;
    return (JSON.parse(raw) as string[]).includes(id);
  } catch { return false; }
}

interface Props { apiBase: string; isAdmin?: boolean }

interface CatalogContextMenu {
  itemId: string;
  kind: "catalog" | "pokemon" | "tile";
  label: string;
  x: number;
  y: number;
}

export default function OfficeEditor({ apiBase: _a, isAdmin = false }: Props) {
  const [on, setOn] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rotation, setRotation] = useState<0|1|2|3>(0);
  const [flipX, setFlipX] = useState(false);
  // 관리자 컨텍스트 메뉴 — 우클릭으로 이름 변경/삭제
  const [ctxMenu, setCtxMenu] = useState<CatalogContextMenu | null>(null);
  const [, forceRefresh] = useState(0);
  const [layoutStats, setLayoutStats] = useState({ placed: 0, removed: 0 });
  const refreshStats = () => {
    const l = loadUserLayout();
    setLayoutStats({ placed: l.items.length, removed: (l.removed || []).length });
  };
  useEffect(() => {
    refreshStats();
    const onChange = () => refreshStats();
    // 매 씬 배치/삭제 후 토스트 이벤트로 카운트 업데이트
    window.addEventListener("hq:toast", onChange);
    window.addEventListener("hq:layout-reload", onChange);
    // 서버 동기화 — 진입 즉시 + 30초 폴링 (다른 기기 변경 감지)
    fetchAndSyncUserLayout();
    const poll = setInterval(() => fetchAndSyncUserLayout(), 30000);
    // 탭 다시 포커스 시 즉시 동기화
    const onFocus = () => fetchAndSyncUserLayout();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("hq:toast", onChange);
      window.removeEventListener("hq:layout-reload", onChange);
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);
  const [category, setCategory] = useState<FurnitureCategory | "all" | "tiles">("tiles");
  const [search, setSearch] = useState("");
  const sheetUrl = "/assets/teammaker/tiles/office/furniture-sheet.png";
  const sheetRef = useRef<HTMLImageElement | null>(null);

  // 에디트 모드 scene에 브로드캐스트
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("hq:edit-mode", { detail: { on, selectedId, rotation, flipX } }));
  }, [on, selectedId, rotation, flipX]);

  // R키=회전, F키=좌우반전, ESC=해제
  useEffect(() => {
    if (!on) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") setRotation(r => ((r + 1) % 4) as 0|1|2|3);
      if (e.key === "f" || e.key === "F") setFlipX(v => !v);
      if (e.key === "Escape") { setSelectedId(null); setRotation(0); setFlipX(false); }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [on]);

  // Scene에서 ctrl+click / right-click 등 이벤트 수신
  useEffect(() => {
    const onPlaced = () => {
      // 최신 layout 다시 로드 (서버 저장은 아직 X)
    };
    window.addEventListener("hq:layout-changed", onPlaced);
    return () => window.removeEventListener("hq:layout-changed", onPlaced);
  }, []);

  const clearLayout = () => {
    if (!confirm("내 배치 전부 삭제 (TM 기본 사무실은 유지)?")) return;
    saveUserLayout({ version: 2, items: [], removed: [] });
    window.dispatchEvent(new CustomEvent("hq:layout-reload"));
    window.dispatchEvent(new CustomEvent("hq:toast", { detail: { text: "🔄 내 배치 초기화", variant: "info" } }));
  };
  const wipeAll = () => {
    if (!confirm("⚠️ 전체 지우기 — TM 기본 사무실까지 모두 빈 방으로? (되돌릴 수 없음)")) return;
    // 모든 셀을 removed로 마킹: 32×23 그리드 전체
    const removed: string[] = [];
    for (let c = 0; c < 32; c++) for (let r = 0; r < 23; r++) removed.push(`${c},${r}`);
    saveUserLayout({ version: 2, items: [], removed });
    window.dispatchEvent(new CustomEvent("hq:layout-reload"));
    window.dispatchEvent(new CustomEvent("hq:toast", { detail: { text: "🗑 전체 지우기 완료", variant: "info" } }));
  };

  // 중복/오역 아이템 숨김 (반전·회전으로 대체 가능한 것들)
  // backpack_orange/brown = 프린터 옆모습
  // potted_plant_bushy/desk_plant_fern/office_chair_front_right_brown = 좌우 반전 중복 의자
  const HIDDEN_IDS = new Set([
    "backpack_orange", "backpack_brown",
    "potted_plant_bushy", "desk_plant_fern", "office_chair_front_right_brown",
    // 전화기로 라벨돼있지만 실제는 램프 (Floor Lamp 한 개로 대체)
    "desk_phone_a", "desk_phone_b", "desk_phone_c", "desk_phone_d", "small_monitor_b",
  ]);
  const filtered = FURNITURE_CATALOG.filter(f => {
    if (HIDDEN_IDS.has(f.id)) return false;
    if (isHiddenFurniture(f.id)) return false;  // 관리자 삭제
    if (category !== "all" && f.category !== category) return false;
    if (search && !f.id.includes(search.toLowerCase()) && !f.label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // 팔레트 아이템 우클릭 — 관리자만 컨텍스트 메뉴 열림
  const handleCatalogContextMenu = (e: React.MouseEvent, def: FurnitureDef) => {
    if (!isAdmin) return;
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ itemId: def.id, kind: "catalog", label: def.label, x: e.clientX, y: e.clientY });
  };
  const handlePokeContextMenu = (e: React.MouseEvent, id: string, label: string) => {
    if (!isAdmin) return;
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ itemId: id, kind: "pokemon", label, x: e.clientX, y: e.clientY });
  };
  const handleTileContextMenu = (e: React.MouseEvent, id: string, label: string) => {
    if (!isAdmin) return;
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ itemId: id, kind: "tile", label, x: e.clientX, y: e.clientY });
  };
  const applyRename = () => {
    if (!ctxMenu) return;
    const next = window.prompt("새 이름", ctxMenu.label);
    if (!next || next.trim() === "" || next === ctxMenu.label) { setCtxMenu(null); return; }
    if (ctxMenu.kind === "catalog") {
      updateFurnitureMeta(ctxMenu.itemId, { label: next.trim() });
    } else if (ctxMenu.kind === "pokemon") {
      try {
        const raw = localStorage.getItem("hq-poke-label-overrides");
        const o = raw ? JSON.parse(raw) : {};
        o[ctxMenu.itemId] = next.trim();
        localStorage.setItem("hq-poke-label-overrides", JSON.stringify(o));
      } catch {}
      try { syncFurnitureOverridesToServer(); } catch {}
    } else {  // tile
      try {
        const raw = localStorage.getItem("hq-tile-label-overrides");
        const o = raw ? JSON.parse(raw) : {};
        o[ctxMenu.itemId] = next.trim();
        localStorage.setItem("hq-tile-label-overrides", JSON.stringify(o));
      } catch {}
      try { syncFurnitureOverridesToServer(); } catch {}
    }
    forceRefresh(n => n + 1);
    setCtxMenu(null);
  };
  const applyDelete = () => {
    if (!ctxMenu) return;
    if (!confirm(`"${ctxMenu.label}" 아이템을 팔레트에서 숨길까요? (관리자 복구 가능)`)) { setCtxMenu(null); return; }
    if (ctxMenu.kind === "catalog") {
      deleteFurniture(ctxMenu.itemId);
    } else if (ctxMenu.kind === "pokemon") {
      try {
        const raw = localStorage.getItem("hq-poke-hidden");
        const arr = raw ? new Set(JSON.parse(raw) as string[]) : new Set<string>();
        arr.add(ctxMenu.itemId);
        localStorage.setItem("hq-poke-hidden", JSON.stringify([...arr]));
      } catch {}
      try { syncFurnitureOverridesToServer(); } catch {}
    } else {  // tile
      try {
        const raw = localStorage.getItem("hq-tile-hidden");
        const arr = raw ? new Set(JSON.parse(raw) as string[]) : new Set<string>();
        arr.add(ctxMenu.itemId);
        localStorage.setItem("hq-tile-hidden", JSON.stringify([...arr]));
      } catch {}
      try { syncFurnitureOverridesToServer(); } catch {}
    }
    forceRefresh(n => n + 1);
    setCtxMenu(null);
  };

  // 에디터 버튼을 전역 이벤트로 토글 (사이드바 버튼에서 발생)
  useEffect(() => {
    const fn = () => setOn(v => !v);
    window.addEventListener("hq:toggle-editor", fn);
    // 다른 관리자가 서버에서 바꾼 오버라이드 반영
    const onSync = () => forceRefresh(n => n + 1);
    window.addEventListener("hq:furniture-overrides-applied", onSync);
    return () => {
      window.removeEventListener("hq:toggle-editor", fn);
      window.removeEventListener("hq:furniture-overrides-applied", onSync);
    };
  }, []);

  // 에디터 켜질 때 서버 최신 오버라이드 페치 (다른 기기 변경 반영)
  useEffect(() => {
    if (on) fetchAndApplyFurnitureOverrides();
  }, [on]);

  return (
    <>
      {/* 편집 종료 버튼 — 크게, 우측 상단 */}
      {on && (
        <button
          onClick={() => setOn(false)}
          className="fixed top-3 right-3 z-[190] px-4 py-2 text-[13px] font-bold rounded-lg bg-red-500 text-white shadow-xl hover:bg-red-600 flex items-center gap-2"
          title="편집 종료 (ESC)"
        >
          ✕ 편집 종료
        </button>
      )}

      {on && (
        <aside className="fixed top-16 right-3 z-[180] w-[280px] max-h-[80vh] bg-[#0f0f1f]/98 border border-[#3a3a5a] rounded-lg shadow-2xl flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-[#2a2a4a]">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-bold text-yellow-400">🎨 에디터</div>
              <div className="text-[13px] text-green-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                자동저장
              </div>
            </div>
            <div className="text-[13px] text-gray-500 mb-1">클릭=배치 · 우클릭=삭제 · R=회전 · ESC=해제</div>
            <div className="text-[12px] text-gray-300 flex gap-2">
              <span>🟡 배치 <b className="text-yellow-300">{layoutStats.placed}</b></span>
              <span>🗑 숨김 <b className="text-red-300">{layoutStats.removed}</b></span>
            </div>
          </div>
          {/* 카테고리 탭 */}
          <div className="flex flex-wrap gap-0.5 px-2 py-1.5 border-b border-[#2a2a4a]">
            <button onClick={() => setCategory("tiles")} className={`text-[13px] px-1.5 py-0.5 rounded whitespace-nowrap ${category==="tiles"?"bg-blue-400/20 text-blue-300":"text-gray-500 hover:text-gray-300"}`}>🧱 바닥/벽</button>
            <button onClick={() => setCategory("all")} className={`text-[13px] px-1.5 py-0.5 rounded whitespace-nowrap ${category==="all"?"bg-yellow-400/20 text-yellow-300":"text-gray-500 hover:text-gray-300"}`}>전체</button>
            {FURNITURE_CATEGORIES.filter(c => FURNITURE_CATALOG.some(f => f.category === c.id && !HIDDEN_IDS.has(f.id))).map(c => (
              <button key={c.id} onClick={() => setCategory(c.id)}
                className={`text-[13px] px-1.5 py-0.5 rounded whitespace-nowrap ${category===c.id?"bg-yellow-400/20 text-yellow-300":"text-gray-500 hover:text-gray-300"}`}>
                {c.label}
              </button>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="검색..."
            className="mx-2 my-1 bg-[#1a1a2e] border border-[#3a3a5a] text-gray-200 text-[12px] px-2 py-1 rounded focus:outline-none focus:border-yellow-400/50" />
          {/* 팔레트 그리드 */}
          <div className="grid grid-cols-4 gap-1 px-2 py-1 overflow-y-auto flex-1">
            {category === "tiles" ? (
              TM_TILES.filter(t => {
                if (isTileHiddenByAdmin(t.id)) return false;
                if (search && !t.id.includes(search.toLowerCase()) && !t.label.includes(search)) return false;
                return true;
              }).map(t => {
                const placeId = t.poke ? `poke:${t.id}` : t.id;
                const lbl = tileLabelOverride(t.id, t.label);
                return (
                  <TilePaletteItem key={t.id} id={t.id} label={lbl}
                    poke={t.poke}
                    selected={selectedId === placeId}
                    onClick={() => setSelectedId(selectedId === placeId ? null : placeId)}
                    onContextMenu={(e) => handleTileContextMenu(e, t.id, lbl)} />
                );
              })
            ) : (
              <>
                {filtered.map(f => <PaletteItem key={f.id} def={f} selected={selectedId === f.id}
                  onClick={() => setSelectedId(f.id === selectedId ? null : f.id)}
                  onContextMenu={(e) => handleCatalogContextMenu(e, f)} />)}
                {/* 해당 카테고리의 포켓몬 에셋도 병합 */}
                {POKEMON_EXTRAS.filter(p => {
                  if (isPokeHiddenByAdmin(p.id)) return false;
                  if (!(category === "all" || p.category === category)) return false;
                  if (search && !p.id.includes(search.toLowerCase()) && !p.label.includes(search)) return false;
                  return true;
                }).map(p => {
                  const lbl = pokeLabelOverride(p.id, p.label);
                  return (
                    <span key={p.id} onContextMenu={(e) => handlePokeContextMenu(e, p.id, lbl)}>
                      <PokemonPaletteItem id={p.id} label={lbl}
                        selected={selectedId === `poke:${p.id}`}
                        onClick={() => setSelectedId(selectedId === `poke:${p.id}` ? null : `poke:${p.id}`)} />
                    </span>
                  );
                })}
              </>
            )}
          </div>
          {/* 현재 선택 표시 + 회전/반전 */}
          {selectedId && (
            <div className="px-3 py-1.5 border-t border-[#2a2a4a] bg-[#12122a] flex items-center gap-1">
              <span className="text-[12px] text-yellow-300 flex-1 truncate">{selectedId}</span>
              <button onClick={() => setRotation(r => ((r + 1) % 4) as 0|1|2|3)}
                className="text-[13px] px-1.5 py-0.5 bg-[#2a2a4a] rounded hover:bg-[#3a3a5a] text-gray-200">R {rotation*90}°</button>
              <button onClick={() => setFlipX(v => !v)}
                className={`text-[13px] px-1.5 py-0.5 rounded ${flipX ? "bg-yellow-500/30 text-yellow-200" : "bg-[#2a2a4a] text-gray-200 hover:bg-[#3a3a5a]"}`}>
                F {flipX ? "⇆" : "⇉"}
              </button>
            </div>
          )}
          {/* 액션 */}
          <div className="flex flex-col gap-1.5 px-2 py-2 border-t border-[#2a2a4a]">
            <div className="text-[13px] text-center text-gray-500 leading-tight">
              ☁️ 자동 서버 동기화 (PC·모바일 공유)
            </div>
            <div className="flex gap-1.5">
              <button onClick={clearLayout} className="flex-1 text-[12px] py-1.5 bg-[#1a1a2e] border border-yellow-500/30 rounded hover:border-yellow-500/60 text-yellow-300">
                🔄 초기화
              </button>
              <button onClick={wipeAll} className="flex-1 text-[12px] py-1.5 bg-[#1a1a2e] border border-red-500/30 rounded hover:border-red-500/60 text-red-300">
                🗑 전체 지우기
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* 관리자 컨텍스트 메뉴 (가구 우클릭) */}
      {ctxMenu && isAdmin && (
        <>
          <div className="fixed inset-0 z-[300]" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
          <div
            className="fixed z-[310] bg-[#0f0f1f] border border-yellow-500/40 rounded-lg shadow-2xl text-[13px] min-w-[160px] overflow-hidden"
            style={{ left: Math.min(ctxMenu.x, window.innerWidth - 180), top: Math.min(ctxMenu.y, window.innerHeight - 120) }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-[13px] text-gray-500 border-b border-[#2a2a4a] truncate">{ctxMenu.label}</div>
            <button onClick={applyRename}
              className="w-full text-left px-3 py-2 hover:bg-yellow-500/10 text-yellow-300 flex items-center gap-2">
              <span>✎</span> 이름 변경
            </button>
            <button onClick={applyDelete}
              className="w-full text-left px-3 py-2 hover:bg-red-500/10 text-red-300 flex items-center gap-2 border-t border-[#2a2a4a]">
              <span>🗑</span> 팔레트에서 숨김
            </button>
          </div>
        </>
      )}

      {/* furniture-sheet preload (hidden img) */}
      <img ref={sheetRef} src={sheetUrl} alt="" style={{ display: "none" }} />
    </>
  );
}

function TilePaletteItem({ id, label, selected, onClick, poke, onContextMenu }: { id: string; label: string; selected: boolean; onClick: () => void; poke?: boolean; onContextMenu?: (e: React.MouseEvent) => void }) {
  // 화이트 마블은 단색 CSS로 표시
  if (id === "hq_white_marble") {
    return (
      <button onClick={onClick} onContextMenu={onContextMenu} title={label}
        className={`relative h-14 rounded border flex items-center justify-center overflow-hidden ${
          selected ? "border-blue-400 ring-1 ring-blue-400" : "border-[#2a2a4a] hover:border-[#4a4a6a]"
        }`} style={{
          background: "repeating-linear-gradient(45deg, #f0f0f0 0 4px, #e0e0e0 4px 5px)",
        }}>
        <span className="absolute bottom-0 left-0 right-0 text-[13px] text-gray-700 bg-white/80 truncate px-0.5">{label}</span>
      </button>
    );
  }
  const url = poke
    ? `/assets/pokemon_furniture/${id}.png`
    : `/assets/teammaker/tiles/office/${id}.png`;
  return (
    <button onClick={onClick} onContextMenu={onContextMenu} title={label}
      className={`relative h-14 rounded border flex items-center justify-center bg-[#1a1a2e] overflow-hidden ${
        selected ? "border-blue-400 ring-1 ring-blue-400" : "border-[#2a2a4a] hover:border-[#4a4a6a]"
      }`}>
      <img src={url} alt={label} style={{ imageRendering: "pixelated", width: 32, height: 32, objectFit: "contain" }}
        onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }} />
      <span className="absolute bottom-0 left-0 right-0 text-[13px] text-gray-500 bg-black/60 truncate px-0.5">{label}</span>
    </button>
  );
}

function PokemonPaletteItem({ id, label, selected, onClick }: { id: string; label: string; selected: boolean; onClick: () => void }) {
  const url = `/assets/pokemon_furniture/${id}.png`;
  return (
    <button onClick={onClick} title={label}
      className={`relative h-14 rounded border flex items-center justify-center bg-[#1a1a2e] overflow-hidden ${
        selected ? "border-red-400 ring-1 ring-red-400" : "border-[#2a2a4a] hover:border-[#4a4a6a]"
      }`}>
      <img src={url} alt={label} style={{ imageRendering: "pixelated", maxWidth: 48, maxHeight: 48 }} />
      <span className="absolute bottom-0 left-0 right-0 text-[13px] text-gray-500 bg-black/60 truncate px-0.5">{label}</span>
    </button>
  );
}

function PaletteItem({ def, selected, onClick, onContextMenu }: { def: FurnitureDef; selected: boolean; onClick: () => void; onContextMenu?: (e: React.MouseEvent) => void }) {
  const sheet = "/assets/teammaker/tiles/office/furniture-sheet.png";
  const scale = Math.min(48 / def.sprite.w, 48 / def.sprite.h);
  const dw = def.sprite.w * scale;
  const dh = def.sprite.h * scale;
  return (
    <button onClick={onClick} onContextMenu={onContextMenu} title={toKoreanLabel(def.label)}
      className={`relative h-14 rounded border flex items-center justify-center bg-[#1a1a2e] overflow-hidden ${
        selected ? "border-yellow-400 ring-1 ring-yellow-400" : "border-[#2a2a4a] hover:border-[#4a4a6a]"
      }`}>
      <div style={{
        width: `${dw}px`, height: `${dh}px`,
        backgroundImage: `url(${sheet})`,
        backgroundPosition: `-${def.sprite.x * scale}px -${def.sprite.y * scale}px`,
        backgroundSize: `${512 * scale}px ${1696 * scale}px`,
        imageRendering: "pixelated",
      }} />
      <span className="absolute bottom-0 left-0 right-0 text-[13px] text-gray-500 bg-black/60 truncate px-0.5">{toKoreanLabel(def.label)}</span>
    </button>
  );
}
