"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Download, Eye, FileCode, FileText, FolderDown, ListChecks, Play } from "lucide-react";
import type { Artifact } from "./AgentHandoffCard";

const typeIcons = { code: FileCode, document: FileText, action_items: ListChecks };

interface Props {
  artifacts: Artifact[];
  agentName?: string;
  onRun?: (artifacts: Artifact[]) => void;
  onView?: (artifacts: Artifact[]) => void;
}

function extFor(a: Artifact): string {
  if (a.type === "code") {
    const l = (a.language || "txt").toLowerCase();
    return ({ typescript: "ts", javascript: "js", tsx: "tsx", jsx: "jsx", python: "py", rust: "rs", go: "go" } as Record<string, string>)[l] || l;
  }
  if (a.type === "document") return "md";
  return "txt";
}

function downloadSingle(a: Artifact) {
  const blob = new Blob([a.content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${a.title || a.id}.${extFor(a)}`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadAllAsZip(artifacts: Artifact[], agentName = "agent") {
  // 간단 구현 — 각 파일 개별 다운로드 (브라우저 네이티브만 사용, JSZip 없음)
  void agentName;
  artifacts.forEach((a) => setTimeout(() => downloadSingle(a), 50));
}

export default function ArtifactCard({ artifacts, agentName, onRun, onView }: Props) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const preview = artifacts.slice(0, 3);
  const remaining = artifacts.length - preview.length;
  const hasCode = artifacts.some((a) => a.type === "code");

  return (
    <>
      <div className="mt-2 rounded-lg border border-[#2a2a4a] bg-[#1a1a2e] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">산출물 {artifacts.length}개</Badge>
        </div>

        <div className="space-y-1">
          {preview.map((a) => {
            const Icon = typeIcons[a.type];
            return (
              <div key={a.id} className="flex items-center gap-2 text-xs text-gray-400">
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{a.title}</span>
              </div>
            );
          })}
          {remaining > 0 && (
            <p className="text-xs text-gray-500 pl-5">외 {remaining}개 더</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => { setViewerOpen(true); onView?.(artifacts); }}>
            <Eye className="h-3.5 w-3.5 mr-1" />상세 보기
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => downloadAllAsZip(artifacts, agentName)}>
            <Download className="h-3.5 w-3.5 mr-1" />전부 다운로드
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => artifacts.forEach(downloadSingle)}>
            <FolderDown className="h-3.5 w-3.5 mr-1" />폴더로 저장
          </Button>
          {hasCode && onRun && (
            <Button size="sm" className="h-7 text-xs" onClick={() => onRun(artifacts)}>
              <Play className="h-3.5 w-3.5 mr-1" />실행
            </Button>
          )}
        </div>
      </div>

      {viewerOpen && (
        <div className="fixed inset-0 z-[140] bg-black/80 flex items-center justify-center p-4" onClick={() => setViewerOpen(false)}>
          <div className="bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a4a]">
              <div className="text-sm font-bold text-yellow-400">산출물 — {agentName || "에이전트"}</div>
              <button className="text-gray-400 hover:text-white text-xs" onClick={() => setViewerOpen(false)}>닫기</button>
            </div>
            <div className="overflow-y-auto p-3 space-y-3">
              {artifacts.map((a) => {
                const Icon = typeIcons[a.type];
                return (
                  <div key={a.id} className="rounded border border-[#2a2a4a] bg-[#1a1a2e] overflow-hidden">
                    <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[#2a2a4a]">
                      <Icon className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-xs font-medium text-gray-200 truncate flex-1">{a.title}</span>
                      <button className="text-[12px] px-2 py-0.5 rounded bg-[#2a2a4a] text-gray-200" onClick={() => downloadSingle(a)}>💾</button>
                      <button className="text-[12px] px-2 py-0.5 rounded bg-[#2a2a4a] text-gray-200" onClick={() => navigator.clipboard.writeText(a.content)}>📋</button>
                    </div>
                    <pre className="p-3 text-[13px] font-mono text-green-200 bg-[#0a0a1a] max-h-[300px] overflow-auto whitespace-pre-wrap">{a.content}</pre>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
