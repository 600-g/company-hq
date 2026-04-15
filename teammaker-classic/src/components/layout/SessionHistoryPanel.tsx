"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useSessionStore } from "@/stores/sessionStore";
import { useChatStore } from "@/stores/chatStore";
import { downloadAsMarkdown } from "@/lib/download";
import { useBillingStore } from "@/stores/billingStore";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Eye, Plus, Trash2 } from "lucide-react";
import ArtifactViewer from "@/components/chat/ArtifactViewer";
import type { Artifact } from "@/types/artifact";
import type { Session } from "@/types/session";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Collect all unique artifacts from a session's messages, deduped by title (latest wins). */
function collectArtifacts(session: Session): Artifact[] {
  const map = new Map<string, Artifact>();
  for (const msg of session.messages) {
    if (!msg.artifacts) continue;
    for (const a of msg.artifacts) {
      map.set(a.title, a);
    }
  }
  return Array.from(map.values());
}

export default function SessionHistoryPanel({ open, onClose }: Props) {
  const t = useTranslations("session");
  const tDownload = useTranslations("download");
  const locale = useLocale();
  const router = useRouter();
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const switchSession = useSessionStore((s) => s.switchSession);
  const createSession = useSessionStore((s) => s.createSession);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const setExpanded = useChatStore((s) => s.setExpanded);
  const billingStatus = useBillingStore((s) => s.status);
  const sessionLimit = useBillingStore((s) => s.getSessionLimit());
  const [viewerSession, setViewerSession] = useState<Session | null>(null);

  const viewerArtifacts = useMemo(
    () => (viewerSession ? collectArtifacts(viewerSession) : []),
    [viewerSession],
  );

  const handleNewSession = () => {
    createSession();
    setExpanded(true);
    onClose();
  };

  const handleSwitch = (sessionId: string) => {
    switchSession(sessionId);
    setExpanded(true);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="left" className="w-[360px] p-0 flex flex-col">
        <SheetHeader className="p-4 pb-2">
          <SheetTitle>{t("title")}</SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleNewSession}
            disabled={sessions.length >= sessionLimit}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("newSession")}
          </Button>
          {sessions.length >= sessionLimit && (
            <div className="mt-2 space-y-2 text-center">
              <p className="text-xs text-muted-foreground">
                {t("limitReached", { max: sessionLimit })}
              </p>
              {/* TODO: beta 이후 결제 연동 시 업그레이드 안내 복원
              {billingStatus !== "active" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    onClose();
                    router.push("/settings");
                  }}
                >
                  {t("upgradePrompt")}
                </Button>
              )}
              */}
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 overflow-hidden px-4">
          <div className="space-y-2 pb-4">
            {sessions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("empty")}
              </p>
            )}
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const date = new Date(session.updatedAt).toLocaleDateString(
                locale === "ko" ? "ko-KR" : "en-US"
              );
              const msgCount = session.messages.filter(
                (m) => m.type === "user"
              ).length;

              return (
                <div
                  key={session.id}
                  className={`rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                    isActive ? "border-primary bg-muted/30" : ""
                  }`}
                  onClick={() => handleSwitch(session.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-2 break-words">
                        {session.title || t("newSession")}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {date}
                        </span>
                        <Badge variant="secondary" className="text-xs h-4">
                          {t("messageCount", { count: msgCount })}
                        </Badge>
                        {isActive && (
                          <Badge variant="default" className="text-xs h-4">
                            {t("current")}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {session.messages.some((m) => m.artifacts?.length) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewerSession(session);
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadAsMarkdown(session, locale, {
                            untitled: tDownload("untitled"),
                            sessionFallback: tDownload("sessionFallback"),
                            created: tDownload("created"),
                            request: tDownload("request"),
                            result: tDownload("result"),
                          });
                        }}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          const msg = session.workingDirectory
                            ? t("deleteWithFolder", { name: session.projectName })
                            : t("deleteConfirm");
                          if (window.confirm(msg)) {
                            deleteSession(session.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>

      {viewerSession && viewerArtifacts.length > 0 && (
        <ArtifactViewer
          open={true}
          onClose={() => setViewerSession(null)}
          artifacts={viewerArtifacts}
          agentName={viewerSession.title || viewerSession.projectName}
        />
      )}
    </Sheet>
  );
}
