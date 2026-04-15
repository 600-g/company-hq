"use client";

import { useState } from "react";
import { useOfficeStore } from "@/stores/officeStore";
import { getFurnitureByCategory, type FurnitureDef } from "@/config/furniture-catalog";

const ROOM_BUILDER_SHEET = "/tiles/office/Room_Builder_Office_32x32.png";

/** Render a spritesheet-based thumbnail for a tile */
function TileThumbnail({ def, size = 48 }: { def: FurnitureDef; size?: number }) {
  const { sprite, sheetPath } = def;
  const sheet = sheetPath ?? ROOM_BUILDER_SHEET;
  const scale = size / sprite.w;

  return (
    <div
      style={{
        width: size,
        height: size,
        overflow: "hidden",
        imageRendering: "pixelated",
      }}
    >
      <div
        style={{
          width: sprite.w,
          height: sprite.h,
          backgroundImage: `url(${sheet})`,
          backgroundPosition: `-${sprite.x}px -${sprite.y}px`,
          backgroundSize: "auto",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}

function TileGrid({
  label,
  tiles,
  selectedId,
  onSelect,
}: {
  label: string;
  tiles: FurnitureDef[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (tiles.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {label} ({tiles.length})
      </div>
      <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto">
        {tiles.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`relative rounded-md overflow-hidden border-2 transition-all ${
              selectedId === t.id
                ? "border-blue-500 ring-1 ring-blue-300"
                : "border-transparent hover:border-gray-300"
            }`}
            title={t.label}
          >
            <TileThumbnail def={t} size={48} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TileSelector() {
  const [open, setOpen] = useState(false);
  const { tileSelection, setTileSelection, editorMode } = useOfficeStore();

  if (editorMode !== "floor" && editorMode !== "wall" && editorMode !== "divider") return null;

  const wallTiles = getFurnitureByCategory("wall_tile");
  const floorTiles = getFurnitureByCategory("floor_tile");
  const dividerTiles = getFurnitureByCategory("divider");

  return (
    <div className="absolute bottom-3 right-3 z-50">
      <button
        onClick={() => setOpen(!open)}
        className="bg-white/90 backdrop-blur border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-white transition-colors"
      >
        {open ? "Close" : "Tiles"}
      </button>

      {open && (
        <div className="absolute bottom-10 right-0 bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-lg p-3 w-72 max-h-[70vh] overflow-y-auto">
          {editorMode === "wall" && (
            <TileGrid
              label="Wall"
              tiles={wallTiles}
              selectedId={tileSelection.wallTileId}
              onSelect={(id) => setTileSelection({ wallTileId: id })}
            />
          )}
          {editorMode === "floor" && (
            <TileGrid
              label="Floor"
              tiles={floorTiles}
              selectedId={tileSelection.floorTileId}
              onSelect={(id) => setTileSelection({ floorTileId: id })}
            />
          )}
          {editorMode === "divider" && (
            <TileGrid
              label="Divider"
              tiles={dividerTiles}
              selectedId={tileSelection.dividerTileId}
              onSelect={(id) => setTileSelection({ dividerTileId: id })}
            />
          )}
        </div>
      )}
    </div>
  );
}
