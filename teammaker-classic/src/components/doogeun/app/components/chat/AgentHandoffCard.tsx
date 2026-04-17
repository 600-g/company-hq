"use client";

import { useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import {
  ArrowRight, Check, ChevronDown, ChevronRight,
  FileCode, FileText, ListChecks, MessageSquare, Paperclip,
} from "lucide-react";

export interface Artifact {
  id: string;
  type: "code" | "document" | "action_items";
  title: string;
  content: string;
  language?: string;
}

const typeIcons = {
  code: FileCode,
  document: FileText,
  action_items: ListChecks,
};

const typeLabels = {
  code: "코드",
  document: "문서",
  action_items: "할 일",
};

interface Props {
  fromTo: string;
  summary: string;
  artifacts: Artifact[];
  isPendingReview?: boolean;
  onApprove?: (feedback?: string) => void;
}

export default function AgentHandoffCard({ fromTo, summary, artifacts, isPendingReview, onApprove }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");

  const parts = fromTo.split(" → ");
  const from = parts[0] || fromTo;
  const to = parts[1] || "";

  const cleanSummary = summary.split(/\n\n\[(?:Previous Agent Output|이전 에이전트 생성 결과물)\]/)[0].trim();
  const previewLines = cleanSummary.split("\n").slice(0, 2).join("\n");
  const hasMore = cleanSummary.split("\n").length > 2 || cleanSummary.length > 120;

  const handleApprove = () => {
    onApprove?.(showFeedback && feedback.trim() ? feedback.trim() : undefined);
  };

  return (
    <div className="w-[85%] rounded-lg border-l-2 border-yellow-400/40 bg-[#1a1a2e]/60 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#1a1a3a] transition-colors"
      >
        <Paperclip className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        <span className="text-xs font-medium text-gray-200">{from}</span>
        <ArrowRight className="h-3 w-3 text-gray-500 flex-shrink-0" />
        <span className="text-xs font-medium text-gray-200">{to}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {artifacts.length > 0 && (
            <Badge variant="secondary" className="text-[13px] h-4">
              {artifacts.length}
            </Badge>
          )}
          {expanded ? <ChevronDown className="h-3 w-3 text-gray-400" /> : <ChevronRight className="h-3 w-3 text-gray-400" />}
        </div>
      </button>

      {!expanded && (
        <div className="px-3 pb-2">
          <p className="text-[13px] text-gray-400 line-clamp-2">
            {previewLines}{hasMore && " ..."}
          </p>
          {artifacts.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {artifacts.map((a) => {
                const Icon = typeIcons[a.type];
                return (
                  <span key={a.id} className="inline-flex items-center gap-1 text-[12px] text-gray-300 bg-[#0f0f1f] rounded px-1.5 py-0.5">
                    <Icon className="h-2.5 w-2.5" />
                    {a.title}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-xs text-gray-200 whitespace-pre-wrap">{cleanSummary}</p>
          {artifacts.length > 0 && (
            <div className="space-y-1">
              <p className="text-[12px] text-gray-500 font-medium uppercase tracking-wide">첨부</p>
              {artifacts.map((a) => {
                const Icon = typeIcons[a.type];
                return (
                  <div key={a.id} className="rounded border border-[#2a2a4a] bg-[#0f0f1f] overflow-hidden">
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                      <span className="text-xs font-medium truncate text-gray-200">{a.title}</span>
                      <Badge variant="secondary" className="text-[13px] ml-auto flex-shrink-0">
                        {typeLabels[a.type]}
                        {a.language && ` \u00b7 ${a.language}`}
                      </Badge>
                    </div>
                    <pre className="px-2 py-1.5 text-[12px] leading-relaxed border-t border-[#2a2a4a] bg-[#1a1a2e]/60 max-h-[120px] overflow-y-auto overflow-x-auto font-mono text-green-200">
                      {a.content.length > 500 ? a.content.slice(0, 500) + "\n..." : a.content}
                    </pre>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isPendingReview && (
        <div className="border-t border-[#2a2a4a] px-3 py-2.5 space-y-2 bg-yellow-400/5">
          <p className="text-[13px] text-gray-400">{to}에게 넘기기 전 확인</p>
          {showFeedback && (
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="피드백을 입력하면 재작업됩니다"
              className="text-xs min-h-[60px]"
              autoFocus
            />
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-7 text-xs flex-1" onClick={handleApprove}>
              <Check className="h-3 w-3 mr-1" />
              {showFeedback && feedback.trim() ? "피드백 주고 재작업" : "확인하고 진행"}
            </Button>
            {!showFeedback && (
              <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => setShowFeedback(true)}>
                <MessageSquare className="h-3 w-3 mr-1" />
                피드백
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
