"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Artifact } from "@/types/artifact";
import {
  downloadArtifactsAsZip,
  downloadSingleArtifact,
  saveArtifactsToDisk,
} from "@/lib/download";
import { detectRunCommand } from "@/lib/detectRunCommand";
import { useProjectStore } from "@/stores/projectStore";
import { useTerminalStore } from "@/stores/terminalStore";
import { useUIStore } from "@/stores/uiStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Check,
  Download,
  FileCode,
  FileText,
  FolderDown,
  ListChecks,
  ChevronDown,
  ChevronRight,
  Eye,
  Play,
} from "lucide-react";
import ArtifactViewer from "@/components/chat/ArtifactViewer";
import MarkdownContent from "@/components/chat/MarkdownContent";
import { runTerminalSSE } from "@/components/terminal/TerminalPanel";

const typeIcons = {
  code: FileCode,
  document: FileText,
  action_items: ListChecks,
};

interface Props {
  summary: string;
  artifacts: Artifact[];
  agentName?: string;
}

function ArtifactBlock({ artifact }: { artifact: Artifact }) {
  const t = useTranslations("artifact");
  const tCommon = useTranslations("common");
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const Icon = typeIcons[artifact.type];

  const typeLabels = {
    code: t("code"),
    document: t("document"),
    action_items: t("action"),
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const maxLines = 20;
  const lines = artifact.content.split("\n");
  const truncated = lines.length > maxLines;
  const displayContent = truncated
    ? lines.slice(0, maxLines).join("\n") + "\n..."
    : artifact.content;

  return (
    <div className="rounded-md border bg-background overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        )}
        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="font-medium truncate">{artifact.title}</span>
        <Badge variant="secondary" className="text-[9px] ml-auto flex-shrink-0">
          {typeLabels[artifact.type]}
          {artifact.language && ` · ${artifact.language}`}
        </Badge>
      </button>

      {expanded && (
        <div className="border-t">
          <div className="flex items-center justify-end gap-0.5 px-2 py-0.5 bg-muted/20">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleCopy}
              title={tCommon("copy")}
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => downloadSingleArtifact(artifact)}
              title={tCommon("download")}
            >
              <Download className="h-3 w-3" />
            </Button>
          </div>
          {artifact.type === "code" ? (
            <pre className="px-3 py-2 text-xs leading-relaxed font-mono bg-muted/20 overflow-x-auto max-h-[300px] overflow-y-auto">
              {displayContent}
            </pre>
          ) : (
            <div className="px-3 py-2 max-h-[300px] overflow-y-auto">
              <MarkdownContent content={displayContent} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentResultCard({
  summary,
  artifacts,
  agentName,
}: Props) {
  const t = useTranslations("artifact");
  const tCommon = useTranslations("common");
  const tDownload = useTranslations("download");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const setWorkingDirectory = useProjectStore((s) => s.setWorkingDirectory);
  const workingDirectory = useProjectStore((s) => s.workingDirectory);
  const addProcess = useTerminalStore((s) => s.addProcess);
  const appendLine = useTerminalStore((s) => s.appendLine);
  const setExited = useTerminalStore((s) => s.setExited);
  const setDetectedUrl = useTerminalStore((s) => s.setDetectedUrl);
  const openTerminalPanel = useUIStore((s) => s.openTerminalPanel);

  const hasCode = artifacts.some((a) => a.type === "code");

  const handleSaveToDisk = async () => {
    setSaving(true);
    try {
      const dir = await saveArtifactsToDisk(artifacts, null, tDownload("enterDirectory"));
      if (dir) setWorkingDirectory(dir);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndRun = async () => {
    setSaving(true);
    let dir = workingDirectory;
    try {
      dir = await saveArtifactsToDisk(artifacts, dir, tDownload("enterDirectory"));
      if (dir) setWorkingDirectory(dir);
    } catch (err) {
      console.error("[handleSaveAndRun] save failed:", err);
    } finally {
      setSaving(false);
    }
    if (!dir) return;

    try {
      const command = await detectRunCommand(dir, artifacts);

      const id = crypto.randomUUID();
      addProcess({ id, command, cwd: dir, sourceArtifacts: artifacts });
      openTerminalPanel();
      runTerminalSSE(
        { id, command, cwd: dir },
        {
          onStdout(id, data) {
            appendLine(id, {
              text: data,
              stream: "stdout",
              timestamp: Date.now(),
            });
            const urlMatch = data.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/);
            if (urlMatch) setDetectedUrl(id, urlMatch[0]);
          },
          onStderr(id, data) {
            appendLine(id, {
              text: data,
              stream: "stderr",
              timestamp: Date.now(),
            });
          },
          onExit(id, code) {
            setExited(id, code ?? 1);
          },
        },
      );
    } catch (err) {
      console.error("[handleSaveAndRun] run failed:", err);
    }
  };

  const INLINE_LIMIT = 3;
  const shown = artifacts.slice(0, INLINE_LIMIT);
  const hidden = artifacts.length - INLINE_LIMIT;

  return (
    <>
      <div className="mt-2 space-y-2">
        <MarkdownContent content={summary} />

        {artifacts.length > 0 && (
          <div className="space-y-1.5">
            {shown.map((a) => (
              <ArtifactBlock key={a.id} artifact={a} />
            ))}

            {hidden > 0 && (
              <button
                onClick={() => setViewerOpen(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors pl-1"
              >
                {t("moreResults", { count: hidden })}
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {artifacts.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px]"
                onClick={() => setViewerOpen(true)}
              >
                <Eye className="h-3 w-3 mr-1" />
                {t("viewAll")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px]"
                onClick={() =>
                  downloadArtifactsAsZip(artifacts, agentName || t("resultsTitle"))
                }
              >
                <Download className="h-3 w-3 mr-1" />
                {t("zipDownload")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px]"
                onClick={handleSaveToDisk}
                disabled={saving}
              >
                <FolderDown className="h-3 w-3 mr-1" />
                {saving ? tCommon("saving") : t("saveToFolder")}
              </Button>
              {hasCode && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-6 text-[11px]"
                  onClick={handleSaveAndRun}
                  disabled={saving}
                >
                  <Play className="h-3 w-3 mr-1" />
                  {tCommon("run")}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <ArtifactViewer
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        artifacts={artifacts}
        agentName={agentName}
      />
    </>
  );
}
