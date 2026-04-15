"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Artifact } from "@/types/artifact";
import { downloadArtifactsAsZip, saveArtifactsToDisk } from "@/lib/download";
import { detectRunCommand } from "@/lib/detectRunCommand";
import { useProjectStore } from "@/stores/projectStore";
import { useTerminalStore } from "@/stores/terminalStore";
import { useUIStore } from "@/stores/uiStore";
import { useChatStore } from "@/stores/chatStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Eye, FileCode, FileText, FolderDown, ListChecks, Play } from "lucide-react";
import ArtifactViewer from "@/components/chat/ArtifactViewer";
import { runTerminalSSE } from "@/components/terminal/TerminalPanel";

const typeIcons = {
  code: FileCode,
  document: FileText,
  action_items: ListChecks,
};

interface Props {
  artifacts: Artifact[];
  agentName?: string;
}

export default function ArtifactCard({ artifacts, agentName }: Props) {
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
  const openTerminalPanel = useUIStore((s) => s.openTerminalPanel);
  const phase = useChatStore((s) => s.phase);

  const preview = artifacts.slice(0, 3);
  const remaining = artifacts.length - preview.length;

  const handleSaveToDisk = async () => {
    setSaving(true);
    try {
      const dir = await saveArtifactsToDisk(artifacts, null, tDownload("enterDirectory"));
      if (dir) setWorkingDirectory(dir);
    } finally {
      setSaving(false);
    }
  };

  const hasCode = artifacts.some((a) => a.type === "code");

  const handleSaveAndRun = async () => {
    let dir = workingDirectory;
    if (!dir) {
      setSaving(true);
      try {
        dir = await saveArtifactsToDisk(artifacts, null, tDownload("enterDirectory"));
        if (dir) setWorkingDirectory(dir);
      } catch (err) {
        console.error("[handleSaveAndRun] save failed:", err);
      } finally {
        setSaving(false);
      }
    }
    if (!dir) return;

    try {
      const command = await detectRunCommand(dir, artifacts);

      const id = crypto.randomUUID();
      addProcess({ id, command, cwd: dir });
      openTerminalPanel();
      runTerminalSSE({ id, command, cwd: dir }, {
        onStdout(id, data) {
          appendLine(id, { text: data, stream: "stdout", timestamp: Date.now() });
          const urlMatch = data.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/);
          if (urlMatch) useTerminalStore.getState().setDetectedUrl(id, urlMatch[0]);
        },
        onStderr(id, data) {
          appendLine(id, { text: data, stream: "stderr", timestamp: Date.now() });
        },
        onExit(id, code) {
          setExited(id, code ?? 1);
        },
      });
    } catch (err) {
      console.error("[handleSaveAndRun] run failed:", err);
    }
  };

  return (
    <>
      <div className="mt-2 rounded-lg border bg-background p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {t("results", { count: artifacts.length })}
          </Badge>
        </div>

        <div className="space-y-1">
          {preview.map((a) => {
            const Icon = typeIcons[a.type];
            return (
              <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{a.title}</span>
              </div>
            );
          })}
          {remaining > 0 && (
            <p className="text-xs text-muted-foreground pl-5">
              {t("more", { count: remaining })}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setViewerOpen(true)}
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            {t("viewDetail")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              downloadArtifactsAsZip(artifacts, agentName || t("resultsTitle"))
            }
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            {t("downloadAll")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleSaveToDisk}
            disabled={saving}
          >
            <FolderDown className="h-3.5 w-3.5 mr-1" />
            {saving ? tCommon("saving") : t("saveToFolder")}
          </Button>
          {hasCode && (
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs"
              onClick={handleSaveAndRun}
              disabled={saving || phase === "executing"}
            >
              <Play className="h-3.5 w-3.5 mr-1" />
              {tCommon("run")}
            </Button>
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
