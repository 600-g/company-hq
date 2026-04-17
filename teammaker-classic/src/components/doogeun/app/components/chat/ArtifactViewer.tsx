"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Copy, Download, FileCode, FileText, ListChecks, Check, X } from "lucide-react";
import MarkdownContent from "./MarkdownContent";
import CodeBlock from "./CodeBlock";
import type { Artifact } from "./AgentHandoffCard";

const typeIcons = { code: FileCode, document: FileText, action_items: ListChecks };
const typeLabels = { code: "코드", document: "문서", action_items: "할 일" } as const;

interface Props {
  open: boolean;
  onClose: () => void;
  artifacts: Artifact[];
  agentName?: string;
}

export default function ArtifactViewer({ open, onClose, artifacts, agentName }: Props) {
  const [selectedId, setSelectedId] = useState<string>(artifacts[0]?.id ?? "");
  const [copied, setCopied] = useState(false);

  const selected = artifacts.find((a) => a.id === selectedId) ?? artifacts[0];

  const handleCopy = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (a: Artifact) => {
    const ext = a.type === "code"
      ? ({ typescript: "ts", javascript: "js", python: "py", tsx: "tsx", jsx: "jsx" } as Record<string, string>)[(a.language || "txt").toLowerCase()] || (a.language || "txt")
      : a.type === "document" ? "md" : "txt";
    const blob = new Blob([a.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url; el.download = `${a.title || a.id}.${ext}`; el.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a4a]">
          <div className="text-sm font-bold text-yellow-400">산출물 — {agentName || "에이전트"}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 min-h-0 flex">
          <aside className="w-48 border-r border-[#2a2a4a] overflow-y-auto">
            {artifacts.map((a) => {
              const Icon = typeIcons[a.type];
              const active = selected?.id === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 text-xs border-b border-[#1a1a2e] text-left ${active ? "bg-[#252540] text-yellow-300" : "text-gray-300 hover:bg-[#1a1a3a]"}`}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate flex-1">{a.title}</span>
                  <Badge variant="secondary" className="text-[13px] flex-shrink-0">{typeLabels[a.type]}</Badge>
                </button>
              );
            })}
          </aside>
          <main className="flex-1 min-w-0 flex flex-col">
            {selected ? (
              <>
                <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[#2a2a4a] bg-[#12122a]">
                  <div className="text-xs font-medium text-gray-200 truncate flex-1">{selected.title}</div>
                  <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={handleCopy} title="복사">
                    {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => handleDownload(selected)} title="다운로드">
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex-1 min-h-0 overflow-auto p-3 bg-[#0a0a1a]">
                  {selected.type === "code" ? (
                    <CodeBlock code={selected.content} language={selected.language || "text"} />
                  ) : (
                    <MarkdownContent content={selected.content} />
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">선택된 산출물 없음</div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
