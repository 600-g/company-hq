"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Artifact } from "@/types/artifact";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  FileCode,
  FileText,
  ListChecks,
  MessageSquare,
  Paperclip,
} from "lucide-react";

const typeIcons = {
  code: FileCode,
  document: FileText,
  action_items: ListChecks,
};

const typeLabels = {
  code: "code",
  document: "document",
  action_items: "action",
};

interface Props {
  fromTo: string;
  summary: string;
  artifacts: Artifact[];
  /** Whether this handoff is waiting for user approval */
  isPendingReview?: boolean;
  /** Called when user approves the handoff */
  onApprove?: (feedback?: string) => void;
}

export default function AgentHandoffCard({
  fromTo,
  summary,
  artifacts,
  isPendingReview,
  onApprove,
}: Props) {
  const t = useTranslations("agentHandoff");
  const [expanded, setExpanded] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");

  // Split "Design Agent → Dev Agent" format into from/to
  const parts = fromTo.split(" → ");
  const from = parts[0] || fromTo;
  const to = parts[1] || "";

  // Strip artifact text from summary to show clean summary only
  const cleanSummary = summary
    .split(/\n\n\[(?:Previous Agent Output|이전 에이전트 생성 결과물)\]/)[0]
    .trim();
  const previewLines = cleanSummary.split("\n").slice(0, 2).join("\n");
  const hasMore = cleanSummary.split("\n").length > 2 || cleanSummary.length > 120;

  const handleApprove = () => {
    onApprove?.(showFeedback && feedback.trim() ? feedback.trim() : undefined);
  };

  return (
    <div className="w-[85%] rounded-lg border-l-2 border-primary/30 bg-muted/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/80 transition-colors"
      >
        <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-medium">{from}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-medium">{to}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {artifacts.length > 0 && (
            <Badge variant="secondary" className="text-[9px] h-4">
              {artifacts.length}
            </Badge>
          )}
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Preview (always shown) */}
      {!expanded && (
        <div className="px-3 pb-2">
          <p className="text-[11px] text-muted-foreground line-clamp-2">
            {previewLines}
            {hasMore && " ..."}
          </p>
          {artifacts.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {artifacts.map((a) => {
                const Icon = typeIcons[a.type];
                return (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-background rounded px-1.5 py-0.5"
                  >
                    <Icon className="h-2.5 w-2.5" />
                    {a.title}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-xs text-foreground whitespace-pre-wrap">
            {cleanSummary}
          </p>

          {artifacts.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                Attachments
              </p>
              {artifacts.map((a) => {
                const Icon = typeIcons[a.type];
                return (
                  <div
                    key={a.id}
                    className="rounded border bg-background overflow-hidden"
                  >
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="text-xs font-medium truncate">
                        {a.title}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[9px] ml-auto flex-shrink-0"
                      >
                        {typeLabels[a.type]}
                        {a.language && ` \u00b7 ${a.language}`}
                      </Badge>
                    </div>
                    <pre className="px-2 py-1.5 text-[10px] leading-relaxed border-t bg-muted/20 max-h-[120px] overflow-y-auto overflow-x-auto font-mono">
                      {a.content.length > 500
                        ? a.content.slice(0, 500) + "\n..."
                        : a.content}
                    </pre>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Handoff Review Controls */}
      {isPendingReview && (
        <div className="border-t px-3 py-2.5 space-y-2 bg-primary/5">
          <p className="text-[11px] text-muted-foreground">
            {t("confirmBeforeHandoff", { to })}
          </p>

          {showFeedback && (
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={t("feedbackPlaceholder")}
              className="text-xs min-h-[60px] resize-none"
              autoFocus
            />
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={handleApprove}
            >
              <Check className="h-3 w-3 mr-1" />
              {showFeedback && feedback.trim() ? t("feedbackAndRework") : t("confirmAndProceed")}
            </Button>
            {!showFeedback && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setShowFeedback(true)}
              >
                <MessageSquare className="h-3 w-3 mr-1" />
                {t("feedback")}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
