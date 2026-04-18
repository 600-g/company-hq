"use client";

import { useState } from "react";
import { FileCode, FileText, ListChecks, ChevronDown, ChevronRight, Copy, Download, Check } from "lucide-react";
import CodeBlock from "@/components/chat/CodeBlock";
import type { Artifact } from "@/lib/parseArtifacts";

const typeIcons = {
  code: FileCode,
  document: FileText,
  action_items: ListChecks,
};

export default function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const Icon = typeIcons[artifact.type];

  const copy = async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const download = () => {
    const filename = artifact.title.includes(".") ? artifact.title.replace(/[\\/]/g, "_") : `${artifact.title}.${artifact.language || "txt"}`;
    const blob = new Blob([artifact.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-gray-800/60 bg-gray-900/30 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-800/40 transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
        <Icon className="w-3.5 h-3.5 text-sky-300 shrink-0" />
        <span className="text-[12px] text-gray-200 font-bold truncate flex-1 text-left">{artifact.title}</span>
        {artifact.language && (
          <span className="text-[10px] text-gray-500 font-mono">{artifact.language}</span>
        )}
        <span className="text-[10px] text-gray-600 font-mono">{artifact.content.split("\n").length}줄</span>
      </button>
      {open && (
        <div className="border-t border-gray-800/60">
          <div className="flex items-center gap-1 px-2 py-1 bg-gray-900/60 border-b border-gray-800/40">
            <button onClick={copy} className="text-[11px] text-gray-400 hover:text-sky-200 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-gray-800/60">
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              {copied ? "복사됨" : "복사"}
            </button>
            <button onClick={download} className="text-[11px] text-gray-400 hover:text-sky-200 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-gray-800/60">
              <Download className="w-3 h-3" />
              다운로드
            </button>
          </div>
          <CodeBlock code={artifact.content} language={artifact.language} />
        </div>
      )}
    </div>
  );
}
