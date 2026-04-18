"use client";

import { useMemo } from "react";
import MarkdownContent from "@/components/chat/MarkdownContent";
import ArtifactCard from "@/components/chat/ArtifactCard";
import { parseArtifacts } from "@/lib/parseArtifacts";
import { Badge } from "@/components/ui/badge";

interface Props {
  content: string;
  agentName?: string;
  agentEmoji?: string;
}

/** 에이전트 응답 메시지 — 요약(마크다운) + 아티팩트 카드 자동 분리 */
export default function AgentResultCard({ content, agentName, agentEmoji }: Props) {
  const parsed = useMemo(() => parseArtifacts(content), [content]);

  return (
    <div className="space-y-2">
      {(agentName || agentEmoji) && (
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
          {agentEmoji && <span className="text-base">{agentEmoji}</span>}
          {agentName && <span className="font-bold">{agentName}</span>}
          {parsed.artifacts.length > 0 && (
            <Badge variant="default">산출물 {parsed.artifacts.length}</Badge>
          )}
        </div>
      )}
      {parsed.summary && <MarkdownContent content={parsed.summary} />}
      {parsed.artifacts.length > 0 && (
        <div className="space-y-1.5">
          {parsed.artifacts.map((a, i) => <ArtifactCard key={i} artifact={a} />)}
        </div>
      )}
    </div>
  );
}
