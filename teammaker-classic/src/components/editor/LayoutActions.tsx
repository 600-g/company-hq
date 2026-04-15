"use client";

import { useRef, useState } from "react";
import { useOfficeStore } from "@/stores/officeStore";

export default function LayoutActions() {
  const exportLayout = useOfficeStore((s) => s.exportLayout);
  const importLayout = useOfficeStore((s) => s.importLayout);
  const resetLayout = useOfficeStore((s) => s.resetLayout);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute bottom-3 left-3 z-50 bg-white/90 backdrop-blur border border-gray-300 rounded-lg px-2 py-1 shadow-sm text-xs text-gray-400 hover:bg-white transition-colors"
        title="Show actions"
      >
        Actions ▼
      </button>
    );
  }

  const handleExport = () => {
    const json = exportLayout();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "office-layout.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") {
        const ok = importLayout(text);
        if (!ok) {
          alert("Invalid layout file");
        }
      }
    };
    reader.readAsText(file);

    e.target.value = "";
  };

  const handleLoadPreset = async () => {
    if (!confirm("Load Office Design 2 preset? Current layout will be replaced.")) return;
    try {
      const res = await fetch("/layouts/office-design-2.json");
      const text = await res.text();
      const ok = importLayout(text);
      if (!ok) alert("Failed to load preset");
    } catch {
      alert("Failed to fetch preset file");
    }
  };

  const handleNew = () => {
    if (confirm("Create a new layout? Current layout will be lost.")) {
      resetLayout();
    }
  };

  return (
    <div className="absolute bottom-3 left-3 z-50 flex gap-1">
      <button
        onClick={handleLoadPreset}
        className="bg-blue-500/90 backdrop-blur border border-blue-600 rounded-lg px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-600 transition-colors"
      >
        Preset
      </button>
      <button
        onClick={handleExport}
        className="bg-white/90 backdrop-blur border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-white transition-colors"
      >
        Export
      </button>
      <button
        onClick={handleImport}
        className="bg-white/90 backdrop-blur border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-white transition-colors"
      >
        Import
      </button>
      <button
        onClick={handleNew}
        className="bg-white/90 backdrop-blur border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-red-50 text-red-600 transition-colors"
      >
        New
      </button>
      <button
        onClick={() => setCollapsed(true)}
        className="bg-white/90 backdrop-blur border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-400 shadow-sm hover:bg-white transition-colors"
        title="Hide actions"
      >
        ▲
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
