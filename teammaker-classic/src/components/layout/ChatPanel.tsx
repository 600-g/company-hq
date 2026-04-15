"use client";

import { useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import { usePipelineStore } from "@/stores/pipelineStore";
import { useChatSend } from "@/hooks/useChatSend";
import { downloadAsMarkdown, downloadAllPipelineArtifacts } from "@/lib/download";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Send, FolderDown, RotateCcw, ExternalLink, Copy, Check, Loader2, Rocket } from "lucide-react";
import AgentResultCard from "@/components/chat/AgentResultCard";
import AgentHandoffCard from "@/components/chat/AgentHandoffCard";
import DeployGuideCard from "@/components/chat/DeployGuideCard";
import SupabaseSetupCard from "@/components/chat/SupabaseSetupCard";
import MarkdownContent from "@/components/chat/MarkdownContent";
import SystemCheckDialog from "@/components/setup/SystemCheckDialog";

export default function ChatPanel() {
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  const tDownload = useTranslations("download");
  const locale = useLocale();
  const { messages, isExpanded, setExpanded, isTyping, typingStatus, phase, addMessage } = useChatStore();
  const activeSession = useSessionStore((s) => s.activeSession());
  const pendingHandoffReview = usePipelineStore((s) => s.pendingHandoffReview);
  const activePipeline = usePipelineStore((s) => s.activePipeline);
  const clearPipeline = usePipelineStore((s) => s.clearPipeline);
  const approveHandoff = usePipelineStore((s) => s.approveHandoff);
  const { input, setInput, handleSend, handleKeyDown, resumePipeline, startDeploy, resolveSupabaseSetup, showSystemCheck, systemCheckResult, onSystemCheckResolved } = useChatSend();
  const canResume = activePipeline && (activePipeline.status === "failed" || activePipeline.steps.some((s) => s.status === "failed"));
  const bottomRef = useRef<HTMLDivElement>(null);

  // Force sync with activeSession messages when panel opens (prevents empty chat after rehydrate)
  useEffect(() => {
    if (isExpanded && messages.length === 0 && activeSession?.messages?.length) {
      useChatStore.setState({ messages: activeSession.messages });
    }
  }, [isExpanded, activeSession, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Scroll to bottom when session opens
  useEffect(() => {
    if (isExpanded) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "instant" }), 0);
    }
  }, [isExpanded]);

  return (
    <>
    {systemCheckResult && (
      <SystemCheckDialog
        open={showSystemCheck}
        platform={systemCheckResult.platform}
        tools={systemCheckResult.tools}
        onResolved={onSystemCheckResolved}
      />
    )}
    <Sheet open={isExpanded} onOpenChange={setExpanded}>
      <SheetContent side="right" className="w-[380px] p-0 flex flex-col">
        <SheetHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SheetTitle>{t("title")}</SheetTitle>
              {phase === "refining" && (
                <Badge variant="secondary" className="text-xs">{t("talkingToManager")}</Badge>
              )}
              {phase === "executing" && (
                <Badge variant="default" className="text-xs">{t("executing")}</Badge>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4">
          <div className="space-y-3 pb-4">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("emptyState")}
              </p>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.type === "user"
                    ? "justify-end"
                    : msg.type === "system"
                    ? "justify-center"
                    : "justify-start"
                }`}
              >
                {msg.type === "system" ? (
                  msg.taskId === "agent-handoff" && msg.artifacts ? (
                    <AgentHandoffCard
                      fromTo={msg.agentName || ""}
                      summary={msg.content}
                      artifacts={msg.artifacts}
                      isPendingReview={
                        !!pendingHandoffReview &&
                        msg.id ===
                          [...messages]
                            .reverse()
                            .find((m) => m.taskId === "agent-handoff")?.id
                      }
                      onApprove={(feedback) => approveHandoff(feedback)}
                    />
                  ) : msg.taskId === "supabase-setup" ? (
                    <SupabaseSetupCard
                      projectName={activeSession?.projectName || "project"}
                      onComplete={(config) => resolveSupabaseSetup(config)}
                      onSkip={() => resolveSupabaseSetup(null)}
                    />
                  ) : msg.taskId === "deploy-suggest" ? (
                    <div className="w-[90%] rounded-lg border bg-card p-4 space-y-2">
                      <p className="text-sm">{t("shareWebsite")}</p>
                      <Button
                        size="sm"
                        className="w-full h-9"
                        onClick={() => {
                          addMessage({
                            type: "system",
                            content: t("startDeployGuide"),
                            taskId: "deploy-guide",
                          });
                        }}
                      >
                        <Rocket className="h-4 w-4 mr-2" />
                        {t("deploy")}
                      </Button>
                    </div>
                  ) : msg.taskId === "deploy-guide" ? (
                    <DeployGuideCard
                      onDeploy={startDeploy}
                      storageType={activeSession?.storageType}
                      githubRepo={activeSession?.githubRepo}
                    />
                  ) : msg.taskId === "deploy-complete" ? (
                    <div className="w-[90%] rounded-lg border bg-card p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        <p className="text-sm font-medium">{t("deployComplete")}</p>
                      </div>
                      {msg.content.match(/https:\/\/[^\s]+/) && (
                        <>
                          <a
                            href={msg.content.match(/https:\/\/[^\s]+/)?.[0]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-sm text-blue-500 hover:underline break-all"
                          >
                            {msg.content.match(/https:\/\/[^\s]+/)?.[0]}
                          </a>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-8 text-xs"
                              onClick={() => navigator.clipboard.writeText(msg.content.match(/https:\/\/[^\s]+/)?.[0] || "")}
                            >
                              <Copy className="h-3.5 w-3.5 mr-1" />
                              {t("copyUrl")}
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 h-8 text-xs"
                              onClick={() => window.open(msg.content.match(/https:\/\/[^\s]+/)?.[0], "_blank", "noopener,noreferrer")}
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              {t("openSite")}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : msg.taskId === "deploy-failed" ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1">
                        <p className="text-xs text-destructive">
                          {msg.content}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => startDeploy()}
                        disabled={phase === "executing"}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        {t("retryDeploy")}
                      </Button>
                    </div>
                  ) : msg.taskId === "pipeline-complete" ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1">
                        <p className="text-xs text-muted-foreground">
                          {msg.content}
                        </p>
                      </div>
                      {messages.filter(
                        (m) => m.type === "ai" && m.artifacts && m.artifacts.length > 0
                      ).length > 1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() =>
                            downloadAllPipelineArtifacts(messages, "all-artifacts")
                          }
                        >
                          <FolderDown className="h-3.5 w-3.5 mr-1" />
                          {t("downloadProject")}
                        </Button>
                      )}
                    </div>
                  ) : msg.taskId === "pipeline-paused" && canResume ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1">
                        <p className="text-xs text-muted-foreground">
                          {msg.content}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => resumePipeline()}
                          disabled={phase === "executing"}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          {t("resume")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => clearPipeline()}
                        >
                          {tc("cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1">
                      {msg.agentName && (
                        <Badge variant="secondary" className="text-xs">
                          {msg.agentName}
                        </Badge>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {msg.content}
                      </p>
                    </div>
                  )
                ) : (
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 ${
                      msg.type === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.type === "ai" && msg.agentName && (
                      <Badge variant="outline" className="mb-1 text-xs">
                        {msg.agentName}
                      </Badge>
                    )}
                    {msg.type === "ai" && msg.artifacts && msg.artifacts.length > 0 ? (
                      <AgentResultCard
                        summary={msg.content}
                        artifacts={msg.artifacts}
                        agentName={msg.agentName}
                      />
                    ) : msg.type === "ai" ? (
                      <MarkdownContent content={msg.content} />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2">
                  <p className="text-sm text-muted-foreground animate-pulse">{typingStatus || t("typing")}</p>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t p-3 flex items-center gap-2">
          <Input
            placeholder={
              pendingHandoffReview
                ? t("placeholderHandoff")
                : phase === "refining"
                ? t("placeholderRefining")
                : t("placeholderDefault")
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={phase === "executing" && !pendingHandoffReview}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || (phase === "executing" && !pendingHandoffReview)}
            className="h-8 w-8"
          >
            <Send className="h-4 w-4" />
          </Button>
          {activeSession && activeSession.messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => downloadAsMarkdown(activeSession, locale, {
                untitled: tDownload("untitled"),
                sessionFallback: tDownload("sessionFallback"),
                created: tDownload("created"),
                request: tDownload("request"),
                result: tDownload("result"),
              })}
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}
