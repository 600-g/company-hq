"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Copy, Check, Download, FileCode, FileText, ListChecks, ChevronDown, ChevronRight, Wrench, Play } from "lucide-react";
import MarkdownContent from "./MarkdownContent";
import type { Artifact } from "./AgentHandoffCard";

const typeIcons = { code: FileCode, document: FileText, action_items: ListChecks };
const typeLabels = { code: "코드", document: "문서", action_items: "할 일" } as const;

function ArtifactBlock({ artifact, onFixRequest }: { artifact: Artifact; onFixRequest?: (a: Artifact, error: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const Icon = typeIcons[artifact.type];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleDownload = () => {
    const ext = artifact.type === "code"
      ? ({ typescript: "ts", javascript: "js", python: "py" } as Record<string, string>)[(artifact.language || "txt").toLowerCase()] || (artifact.language || "txt")
      : artifact.type === "document" ? "md" : "txt";
    const blob = new Blob([artifact.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifact.title || artifact.id}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maxLines = 20;
  const lines = artifact.content.split("\n");
  const truncated = lines.length > maxLines;
  const displayContent = truncated ? lines.slice(0, maxLines).join("\n") + "\n..." : artifact.content;

  return (
    <div className="rounded-md border border-[#2a2a4a] bg-[#1a1a2e] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-[#252540] transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-gray-400" /> : <ChevronRight className="h-3 w-3 flex-shrink-0 text-gray-400" />}
        <Icon className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
        <span className="font-medium truncate text-gray-200">{artifact.title}</span>
        <Badge variant="secondary" className="text-[13px] ml-auto flex-shrink-0">
          {typeLabels[artifact.type]}
          {artifact.language && ` · ${artifact.language}`}
        </Badge>
      </button>

      {expanded && (
        <div className="border-t border-[#2a2a4a]">
          <div className="flex items-center justify-end gap-0.5 px-2 py-0.5 bg-[#0f0f1f]">
            <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={handleCopy} title="복사">
              {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={handleDownload} title="다운로드">
              <Download className="h-3 w-3" />
            </Button>
            {(artifact.language === "sh" || artifact.language === "bash" || artifact.language === "zsh") && (
              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-green-300 hover:text-green-200" title="터미널에서 실행"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("hq:open-terminal", { detail: { command: artifact.content, cwd: "~/Developer/my-company/company-hq" } }));
                }}>
                <Play className="h-3 w-3" />
              </Button>
            )}
            {onFixRequest && (
              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-orange-300 hover:text-orange-200" title="에러 수정 요청"
                onClick={() => {
                  const err = window.prompt("에러/문제 내용을 붙여넣으세요 (에이전트가 이 코드와 함께 수정):");
                  if (err && err.trim()) onFixRequest(artifact, err.trim());
                }}>
                <Wrench className="h-3 w-3" />
              </Button>
            )}
          </div>
          <pre className="p-2 text-[13px] font-mono text-green-200 bg-[#0a0a1a] max-h-[280px] overflow-auto whitespace-pre-wrap break-words">{displayContent}</pre>
          {truncated && <div className="px-2 py-1 text-[12px] text-gray-500 border-t border-[#2a2a4a]">{lines.length - maxLines}줄 생략됨 — 다운로드로 전체 보기</div>}
        </div>
      )}
    </div>
  );
}

interface Props {
  summary: string;
  artifacts: Artifact[];
  agentName?: string;
  onFixRequest?: (a: Artifact, error: string) => void;
}

export default function AgentResultCard({ summary, artifacts, agentName, onFixRequest }: Props) {
  return (
    <div className="space-y-2">
      {summary && (
        <div className="rounded-md border border-[#2a2a4a] bg-[#1a1a2e]/80 p-2.5">
          <MarkdownContent content={summary} />
        </div>
      )}
      {artifacts.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[12px] text-gray-400 uppercase tracking-wide">
            <span>산출물 {artifacts.length}개{agentName ? ` · ${agentName}` : ""}</span>
          </div>
          <div className="space-y-1.5">
            {artifacts.map((a) => <ArtifactBlock key={a.id} artifact={a} onFixRequest={onFixRequest} />)}
          </div>
        </div>
      )}
    </div>
  );
}
