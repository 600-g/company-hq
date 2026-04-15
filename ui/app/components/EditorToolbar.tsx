"use client";
import { useEffect, useState, useRef } from "react";
import { Button } from "./ui/button";
import {
  canUndo,
  canRedo,
  undo,
  redo,
  exportLayout,
  importLayout,
  resetToDefaults,
  getHistoryStats,
} from "../lib/office-editor";

interface Props {
  onApplied?: () => void;
}

export default function EditorToolbar({ onApplied }: Props) {
  const [, force] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = () => force((n) => n + 1);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Ctrl+Z / Ctrl+Shift+Z 단축키
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo()) {
            redo();
            showToast("↪ Redo");
            onApplied?.();
            refresh();
          }
        } else {
          if (canUndo()) {
            undo();
            showToast("↩ Undo");
            onApplied?.();
            refresh();
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onApplied]);

  const onUndo = () => {
    if (!canUndo()) return;
    undo();
    showToast("↩ Undo 적용");
    onApplied?.();
    refresh();
  };
  const onRedo = () => {
    if (!canRedo()) return;
    redo();
    showToast("↪ Redo 적용");
    onApplied?.();
    refresh();
  };
  const onExport = async () => {
    const json = exportLayout();
    try {
      await navigator.clipboard.writeText(json);
      showToast("📋 레이아웃 JSON 클립보드에 복사됨");
    } catch {
      // fallback: 다운로드
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hq-layout-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("⬇ 레이아웃 파일 다운로드");
    }
  };
  const onImport = () => fileInputRef.current?.click();
  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importLayout(String(reader.result ?? ""));
      if (result.ok) {
        showToast("✅ 레이아웃 가져오기 완료 — 새로고침하면 반영");
        onApplied?.();
        refresh();
      } else {
        showToast(`❌ 가져오기 실패: ${result.error}`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };
  const onReset = () => {
    if (!confirm("사무실 레이아웃을 기본값으로 되돌립니다. Undo로 복구 가능합니다.")) return;
    resetToDefaults();
    showToast("🔄 기본값 복구됨 — 새로고침하면 반영");
    onApplied?.();
    refresh();
  };

  const stats = getHistoryStats();

  return (
    <div className="relative flex items-center gap-1 font-mono text-[10px]">
      <Button size="sm" variant="ghost" onClick={onUndo} disabled={!canUndo()} title={`Ctrl+Z (${stats.past})`}>
        ↩
      </Button>
      <Button size="sm" variant="ghost" onClick={onRedo} disabled={!canRedo()} title={`Ctrl+Shift+Z (${stats.future})`}>
        ↪
      </Button>
      <span className="text-gray-700 select-none">|</span>
      <Button size="sm" variant="ghost" onClick={onExport} title="레이아웃 내보내기">
        ⬆ Export
      </Button>
      <Button size="sm" variant="ghost" onClick={onImport} title="레이아웃 가져오기">
        ⬇ Import
      </Button>
      <Button size="sm" variant="ghost" onClick={onReset} title="기본값 복구">
        🔄 Reset
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        hidden
        onChange={onImportFile}
      />
      {toast && (
        <span className="absolute top-full right-0 mt-1 px-2 py-0.5 rounded bg-[#0f0f1f] border border-yellow-400/40 text-yellow-300 text-[10px] whitespace-nowrap shadow">
          {toast}
        </span>
      )}
    </div>
  );
}
