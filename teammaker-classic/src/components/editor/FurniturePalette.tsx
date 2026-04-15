"use client";

import { useState, useRef, useEffect } from "react";
import { useOfficeStore } from "@/stores/officeStore";
import {
  FURNITURE_CATALOG,
  FURNITURE_CATEGORIES,
  updateFurnitureMeta,
  exportOverrides,
  getOverrideCount,
  type FurnitureDef,
  type FurnitureCategory,
} from "@/config/furniture-catalog";

const DEFAULT_SHEET = "/tiles/office/furniture-sheet.png";
const SHEET_SIZES: Record<string, { w: number; h: number }> = {
  [DEFAULT_SHEET]: { w: 512, h: 1696 },
  "/tiles/office/room-builder-sheet.png": { w: 512, h: 448 },
};

function SpriteThumb({ item, size }: { item: FurnitureDef; size: number }) {
  const { x, y, w, h } = item.sprite;
  const sheet = item.sheetPath ?? DEFAULT_SHEET;
  const sheetSize = SHEET_SIZES[sheet] ?? { w: 512, h: 512 };
  const scale = size / Math.max(w, h);
  const thumbW = Math.round(w * scale);
  const thumbH = Math.round(h * scale);

  return (
    <div
      className="mx-auto"
      style={{
        width: thumbW,
        height: thumbH,
        backgroundImage: `url(${sheet})`,
        backgroundPosition: `-${x * scale}px -${y * scale}px`,
        backgroundSize: `${sheetSize.w * scale}px ${sheetSize.h * scale}px`,
        imageRendering: "pixelated",
      }}
    />
  );
}

/** Inline edit form for a furniture item */
function EditForm({
  item,
  onDone,
}: {
  item: FurnitureDef;
  onDone: () => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [category, setCategory] = useState<FurnitureCategory>(item.category);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSave = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    updateFurnitureMeta(item.id, { label: trimmed, category });
    onDone();
  };

  return (
    <div
      className="bg-white border border-blue-300 rounded-lg shadow-lg p-2 space-y-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="shrink-0 w-9 h-9 flex items-center justify-center">
          <SpriteThumb item={item} size={32} />
        </div>
        <span className="text-[9px] text-gray-400 font-mono truncate">
          {item.id}
        </span>
      </div>

      {/* Label */}
      <input
        ref={inputRef}
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") onDone();
        }}
        className="w-full px-2 py-1 rounded border border-gray-200 text-xs focus:outline-none focus:border-blue-400"
        placeholder="Name"
      />

      {/* Category */}
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as FurnitureCategory)}
        className="w-full px-2 py-1 rounded border border-gray-200 text-xs focus:outline-none focus:border-blue-400 bg-white"
      >
        {FURNITURE_CATEGORIES.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.label}
          </option>
        ))}
      </select>

      {/* Actions */}
      <div className="flex gap-1 justify-end pt-0.5">
        <button
          onClick={onDone}
          className="px-2 py-0.5 rounded text-[10px] text-gray-500 hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-2 py-0.5 rounded text-[10px] bg-blue-500 text-white hover:bg-blue-600"
        >
          Save
        </button>
      </div>
    </div>
  );
}

export default function FurniturePalette() {
  const editorMode = useOfficeStore((s) => s.editorMode);
  const selectedFurnitureType = useOfficeStore((s) => s.selectedFurnitureType);
  const setSelectedFurnitureType = useOfficeStore(
    (s) => s.setSelectedFurnitureType
  );
  const [activeCategory, setActiveCategory] =
    useState<FurnitureCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Force re-render after edit saves
  const [rev, setRev] = useState(0);

  if (editorMode !== "furniture") return null;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute top-14 right-3 z-50 bg-white/90 backdrop-blur border border-gray-300 rounded-lg px-2 py-1 shadow-sm text-xs text-gray-400 hover:bg-white transition-colors"
        title="Show catalog"
      >
        Catalog ▼
      </button>
    );
  }

  const filtered = FURNITURE_CATALOG.filter((f) => {
    if (activeCategory !== "all" && f.category !== activeCategory) return false;
    if (search && !f.label.toLowerCase().includes(search.toLowerCase()) && !f.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="absolute top-14 right-3 z-50 bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-lg w-72 max-h-[70vh] flex flex-col">
      {/* Header with close */}
      <div className="flex items-center justify-between px-2 pt-2 pb-1 shrink-0">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Catalog</span>
        <div className="flex items-center gap-1">
          {getOverrideCount() > 0 && (
            <button
              onClick={() => {
                const json = exportOverrides();
                if (!json) return;
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "furniture-overrides.json";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="text-[10px] text-blue-500 hover:text-blue-700 transition-colors px-1"
              title="Export overrides as JSON"
            >
              Export ({getOverrideCount()})
            </button>
          )}
          <button
            onClick={() => setCollapsed(true)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-1"
            title="Hide catalog"
          >
            ▲
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-2 pb-2 border-b border-gray-100 shrink-0">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search furniture..."
          className="w-full px-2 py-1 rounded-md border border-gray-200 text-xs focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1 p-2 border-b border-gray-100 shrink-0">
        <button
          onClick={() => setActiveCategory("all")}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
            activeCategory === "all"
              ? "bg-blue-500 text-white"
              : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          All
        </button>
        {FURNITURE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              activeCategory === cat.id
                ? "bg-blue-500 text-white"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Items list */}
      <div className="flex flex-col gap-0.5 p-1.5 overflow-y-auto min-h-0">
        {filtered.map((item) => (
          <div key={`${item.id}-${rev}`}>
            {editingId === item.id ? (
              <EditForm
                item={item}
                onDone={() => {
                  setEditingId(null);
                  setRev((r) => r + 1);
                }}
              />
            ) : (
              <button
                onClick={() =>
                  setSelectedFurnitureType(
                    selectedFurnitureType === item.id ? null : item.id
                  )
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  setEditingId(item.id);
                }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  setEditingId(item.id);
                }}
                className={`w-full flex items-center gap-2 rounded-md border-2 transition-all bg-gray-50 px-2 py-1 ${
                  selectedFurnitureType === item.id
                    ? "border-blue-500 ring-1 ring-blue-300"
                    : "border-transparent hover:border-gray-300"
                }`}
              >
                <div className="shrink-0 w-10 h-10 flex items-center justify-center">
                  <SpriteThumb item={item} size={36} />
                </div>
                <div className="text-[11px] text-gray-700 leading-snug text-left truncate">
                  {item.label}
                </div>
                <div className="ml-auto text-[9px] text-gray-400 shrink-0">
                  {item.widthCells}x{item.heightCells}
                </div>
              </button>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center text-gray-400 text-xs py-4">
            No items
          </div>
        )}
      </div>
    </div>
  );
}
