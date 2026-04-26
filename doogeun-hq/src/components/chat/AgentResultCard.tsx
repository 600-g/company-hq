"use client";

import { useMemo } from "react";
import MarkdownContent from "@/components/chat/MarkdownContent";
import ArtifactCard from "@/components/chat/ArtifactCard";
import ChoiceButtons from "@/components/chat/ChoiceButtons";
import HireProposalCard from "@/components/chat/HireProposalCard";
import { parseArtifacts, type Artifact, type HireProposal } from "@/lib/parseArtifacts";
import { Badge } from "@/components/ui/badge";
import { Download, Copy } from "lucide-react";

interface Props {
  content: string;
  agentName?: string;
  agentEmoji?: string;
  onChooseAnswer?: (answer: string) => void;
  onHireAgent?: (proposal: HireProposal) => Promise<{ ok: boolean; error?: string }>;
}

/** 에이전트 응답 메시지 — 요약(마크다운) + 아티팩트 카드 자동 분리 + 일괄 다운로드 */
export default function AgentResultCard({ content, agentName, agentEmoji, onChooseAnswer, onHireAgent }: Props) {
  const parsed = useMemo(() => parseArtifacts(content), [content]);

  const downloadAll = () => {
    // 단일 번들 파일 — 경계 구분자로 묶어서 내려줌
    // (jszip 없이도 각 파일을 식별 가능한 형태로)
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const parts: string[] = [];
    parts.push(`# Artifacts bundle — ${agentName || "agent"} · ${ts}`);
    parts.push(`# Total: ${parsed.artifacts.length} files\n`);
    for (const a of parsed.artifacts) {
      parts.push(`\n==================== FILE: ${a.title} ====================`);
      parts.push(`# language: ${a.language || "text"}`);
      parts.push("");
      parts.push(a.content);
    }
    const blob = new Blob([parts.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `artifacts-${ts}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadEach = () => {
    parsed.artifacts.forEach((a: Artifact, i) => {
      setTimeout(() => {
        const filename = a.title.includes(".") ? a.title.replace(/[\\/]/g, "_") : `${a.title}.${a.language || "txt"}`;
        const blob = new Blob([a.content], { type: "text/plain;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
      }, i * 120); // 브라우저 다운로드 throttle 회피
    });
  };

  const copyAll = async () => {
    const txt = parsed.artifacts.map((a) =>
      `### ${a.title}\n\`\`\`${a.language || ""}\n${a.content}\n\`\`\``
    ).join("\n\n");
    await navigator.clipboard.writeText(txt);
  };

  return (
    <div className="space-y-2">
      {(agentName || agentEmoji) && (
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
          {agentEmoji && <span className="text-base">{agentEmoji}</span>}
          {agentName && <span className="font-bold">{agentName}</span>}
          {parsed.artifacts.length > 0 && (
            <Badge variant="default">산출물 {parsed.artifacts.length}</Badge>
          )}
          {parsed.artifacts.length >= 2 && (
            <div className="ml-auto flex items-center gap-1">
              <button onClick={copyAll} className="text-[10px] text-gray-500 hover:text-sky-300 flex items-center gap-0.5" title="전체 복사">
                <Copy className="w-3 h-3" /> 전체
              </button>
              <button onClick={downloadEach} className="text-[10px] text-gray-500 hover:text-sky-300 flex items-center gap-0.5" title="파일별로 다운로드">
                <Download className="w-3 h-3" /> 낱개
              </button>
              <button onClick={downloadAll} className="text-[10px] text-sky-300 hover:text-sky-200 flex items-center gap-0.5" title="번들 1파일로">
                <Download className="w-3 h-3" /> 번들
              </button>
            </div>
          )}
        </div>
      )}
      {parsed.summary && <MarkdownContent content={parsed.summary} />}
      {parsed.artifacts.length > 0 && (
        <div className="space-y-1.5">
          {parsed.artifacts.map((a, i) => <ArtifactCard key={i} artifact={a} />)}
        </div>
      )}
      {parsed.choice && onChooseAnswer && (
        <ChoiceButtons
          question={parsed.choice.question}
          options={parsed.choice.options}
          onChoose={(opt) => {
            if (opt === "직접 입력") return; // 유저가 입력창 사용
            onChooseAnswer(opt);
          }}
        />
      )}
      {parsed.hire && onHireAgent && (
        <HireProposalCard proposal={parsed.hire} onHire={onHireAgent} />
      )}
    </div>
  );
}
