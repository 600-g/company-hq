"use client";

import { useState, useEffect } from "react";
import { useOfficeStore } from "@/stores/officeStore";
import type { EditorMode } from "@/types/office-layout";

const TOOLS: { mode: EditorMode; label: string; icon: string; key: string }[] = [
  { mode: "view", label: "View", icon: "👁", key: "V" },
  { mode: "floor", label: "Floor", icon: "⬛", key: "F" },
  { mode: "wall", label: "Wall", icon: "🧱", key: "W" },
  { mode: "divider", label: "Divider", icon: "┼", key: "D" },
  { mode: "furniture", label: "Furniture", icon: "🪑", key: "G" },
  { mode: "eraser", label: "Eraser", icon: "✕", key: "E" },
];

const KEY_TO_MODE: Record<string, EditorMode> = {};
for (const t of TOOLS) KEY_TO_MODE[t.key.toLowerCase()] = t.mode;

export default function EditorToolbar() {
  const editorMode = useOfficeStore((s) => s.editorMode);
  const setEditorMode = useOfficeStore((s) => s.setEditorMode);
  const undo = useOfficeStore((s) => s.undo);
  const viewZoom = useOfficeStore((s) => s.viewZoom);
  const setViewZoom = useOfficeStore((s) => s.setViewZoom);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const mode = KEY_TO_MODE[e.key.toLowerCase()];
      if (mode) {
        e.preventDefault();
        setEditorMode(mode);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setEditorMode, undo]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-white/90 backdrop-blur border border-gray-300 rounded-lg px-2 py-1 shadow-sm text-xs text-gray-400 hover:bg-white transition-colors"
        title="Show toolbar"
      >
        Tools ▼
      </button>
    );
  }

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-white/90 backdrop-blur border border-gray-300 rounded-lg px-1.5 py-1 shadow-sm">
      {TOOLS.map((tool) => (
        <button
          key={tool.mode}
          onClick={() => setEditorMode(tool.mode)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            editorMode === tool.mode
              ? "bg-blue-500 text-white shadow-sm"
              : "text-gray-600 hover:bg-gray-100"
          }`}
          title={`${tool.label} (${tool.key})`}
        >
          <span className="text-sm">{tool.icon}</span>
          <span>{tool.label}</span>
          <kbd className="text-[9px] opacity-50 ml-0.5">{tool.key}</kbd>
        </button>
      ))}
      <div className="w-px h-5 bg-gray-300 mx-1" />
      <div className="flex items-center gap-1.5 px-1">
        <label htmlFor="editor-zoom" className="text-[10px] text-gray-500 whitespace-nowrap">Zoom</label>
        <input
          id="editor-zoom"
          aria-label="Editor zoom"
          type="range"
          min={0.5}
          max={4.0}
          step={0.1}
          value={viewZoom ?? 1.4}
          onChange={(e) => setViewZoom(parseFloat(e.target.value))}
          className="w-16 h-1 accent-blue-500 cursor-pointer"
          title={`View zoom: ${((viewZoom ?? 1.4) * 100).toFixed(0)}%`}
        />
        <span className="text-[10px] text-gray-500 w-7 text-right">{((viewZoom ?? 1.4) * 100).toFixed(0)}%</span>
      </div>
      <button
        onClick={() => setCollapsed(true)}
        className="px-1.5 py-1 rounded-md text-xs text-gray-400 hover:bg-gray-100 transition-colors"
        title="Hide toolbar"
      >
        ▲
      </button>
    </div>
  );
}
