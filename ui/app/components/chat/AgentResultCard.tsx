"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Copy, Check, Download, FileCode, FileText, ListChecks, ChevronDown, ChevronRight, Wrench, Play, Maximize2, FolderDown, Archive } from "lucide-react";
import MarkdownContent from "./MarkdownContent";
import type { Artifact } from "./AgentHandoffCard";

function extOf(a: Artifact): string {
  return a.type === "code"
    ? ({ typescript: "ts", javascript: "js", python: "py", bash: "sh", zsh: "sh" } as Record<string, string>)[(a.language || "txt").toLowerCase()] || (a.language || "txt")
    : a.type === "document" ? "md" : "txt";
}

const typeIcons = { code: FileCode, document: FileText, action_items: ListChecks };
const typeLabels = { code: "코드", document: "문서", action_items: "할 일" } as const;

function ArtifactBlock({ artifact, onFixRequest, onFullscreen }: { artifact: Artifact; onFixRequest?: (a: Artifact, error: string) => void; onFullscreen?: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const Icon = typeIcons[artifact.type];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleDownload = () => {
    const blob = new Blob([artifact.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifact.title || artifact.id}.${extOf(artifact)}`;
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
            <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={handleDownload} title="파일 다운로드">
              <Download className="h-3 w-3" />
            </Button>
            {onFullscreen && (
              <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={onFullscreen} title="전체 보기">
                <Maximize2 className="h-3 w-3" />
              </Button>
            )}
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
  const [fullscreen, setFullscreen] = useState<Artifact | null>(null);

  const downloadZip = async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    artifacts.forEach(a => {
      zip.file(`${a.title || a.id}.${extOf(a)}`, a.content);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${agentName || "artifacts"}-${Date.now()}.zip`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const saveToFolder = async () => {
    // File System Access API (Chrome/Edge/Whale)
    interface WindowWithFS { showDirectoryPicker?: (options?: { mode?: "readwrite" }) => Promise<FileSystemDirectoryHandle> }
    const w = window as unknown as WindowWithFS;
    if (!w.showDirectoryPicker) {
      window.dispatchEvent(new CustomEvent("hq:toast", { detail: { text: "이 브라우저는 폴더 저장 미지원 — ZIP 다운로드 사용", variant: "error", center: true, ms: 2500 } }));
      return;
    }
    try {
      const dir = await w.showDirectoryPicker({ mode: "readwrite" });
      let ok = 0;
      for (const a of artifacts) {
        const fh = await dir.getFileHandle(`${a.title || a.id}.${extOf(a)}`, { create: true });
        const ws = await fh.createWritable();
        await ws.write(a.content);
        await ws.close();
        ok++;
      }
      window.dispatchEvent(new CustomEvent("hq:toast", { detail: { text: `✅ 폴더에 ${ok}개 저장 완료`, variant: "success", center: true, ms: 2000 } }));
    } catch {
      // 사용자 취소 or 에러
    }
  };

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
            {artifacts.map((a) => <ArtifactBlock key={a.id} artifact={a} onFixRequest={onFixRequest} onFullscreen={() => setFullscreen(a)} />)}
          </div>
          {/* 일괄 액션 툴바 */}
          {artifacts.length > 1 && (
            <div className="flex items-center gap-1.5 pt-1">
              <Button variant="ghost" size="sm" onClick={downloadZip} className="text-[11px] gap-1 h-7">
                <Archive className="h-3 w-3" /> ZIP 다운로드
              </Button>
              <Button variant="ghost" size="sm" onClick={saveToFolder} className="text-[11px] gap-1 h-7">
                <FolderDown className="h-3 w-3" /> 폴더에 저장
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 전체 보기 모달 */}
      {fullscreen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4" onClick={() => setFullscreen(null)}>
          <div className="w-full max-w-5xl h-[90vh] bg-[#0f0f1f] border border-[#3a3a5a] rounded-xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 bg-[#1a1a3a] border-b border-[#2a2a5a] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">{fullscreen.type === "code" ? "📄" : fullscreen.type === "document" ? "📝" : "✓"}</span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-yellow-400 truncate">{fullscreen.title}</div>
                  <div className="text-[10px] text-gray-500">{typeLabels[fullscreen.type]}{fullscreen.language ? ` · ${fullscreen.language}` : ""}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7" onClick={async () => { await navigator.clipboard.writeText(fullscreen.content); window.dispatchEvent(new CustomEvent("hq:toast", { detail: { text: "📋 복사됨", variant: "success", center: true, ms: 1200 } })); }}>복사</Button>
                <Button variant="ghost" size="sm" className="h-7" onClick={() => {
                  const blob = new Blob([fullscreen.content], { type: "text/plain;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = `${fullscreen.title || fullscreen.id}.${extOf(fullscreen)}`; a.click();
                  URL.revokeObjectURL(url);
                }}>다운로드</Button>
                <button onClick={() => setFullscreen(null)} className="text-gray-400 hover:text-white text-lg ml-1">✕</button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto font-mono text-[12px] text-green-200 bg-[#0a0a1a] p-4 whitespace-pre-wrap break-words">{fullscreen.content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
