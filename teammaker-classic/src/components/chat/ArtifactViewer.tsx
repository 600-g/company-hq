"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Artifact } from "@/types/artifact";
import { downloadArtifactsAsZip, downloadSingleArtifact, saveArtifactsToDisk } from "@/lib/download";
import { useProjectStore } from "@/stores/projectStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Download,
  FileCode,
  FileText,
  FolderDown,
  ListChecks,
  Check,
} from "lucide-react";
import MarkdownContent from "@/components/chat/MarkdownContent";
import CodeBlock from "@/components/chat/CodeBlock";

const typeIcons = {
  code: FileCode,
  document: FileText,
  action_items: ListChecks,
};

interface Props {
  open: boolean;
  onClose: () => void;
  artifacts: Artifact[];
  agentName?: string;
}

export default function ArtifactViewer({
  open,
  onClose,
  artifacts,
  agentName,
}: Props) {
  const t = useTranslations("artifact");
  const tCommon = useTranslations("common");
  const tDownload = useTranslations("download");
  const [selectedId, setSelectedId] = useState<string>(
    artifacts[0]?.id ?? ""
  );
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const setWorkingDirectory = useProjectStore((s) => s.setWorkingDirectory);

  const typeLabels = {
    code: t("code"),
    document: t("document"),
    action_items: t("action"),
  };

  const handleSaveToDisk = async () => {
    setSaving(true);
    try {
      const dir = await saveArtifactsToDisk(artifacts, null, tDownload("enterDirectory"));
      if (dir) setWorkingDirectory(dir);
    } finally {
      setSaving(false);
    }
  };

  const selected = artifacts.find((a) => a.id === selectedId) ?? artifacts[0];

  const handleCopy = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const title = agentName ? t("resultsTitleWithAgent", { agentName }) : t("resultsTitle");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[70vw] max-w-[70vw] h-[80vh] p-0 flex flex-col">
        <DialogHeader className="p-4 pb-0">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>
              {title}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveToDisk}
                disabled={saving}
              >
                <FolderDown className="h-4 w-4 mr-2" />
                {saving ? tCommon("saving") : t("saveToFolder")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadArtifactsAsZip(artifacts, agentName || t("resultsTitle"))
                }
              >
                <Download className="h-4 w-4 mr-2" />
                {t("fullZipDownload")}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 border-t mt-2">
          {/* File list */}
          <ScrollArea className="w-56 border-r flex-shrink-0">
            <div className="p-2 space-y-1">
              {artifacts.map((a) => {
                const Icon = typeIcons[a.type];
                const isActive = a.id === selected?.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs font-medium">
                        {a.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {typeLabels[a.type]}
                        {a.language && ` · ${a.language}`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          {/* Content viewer */}
          <div className="flex-1 flex flex-col min-w-0">
            {selected && (
              <>
                <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {selected.title}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {typeLabels[selected.type]}
                      {selected.language && ` · ${selected.language}`}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => downloadSingleArtifact(selected)}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                  {selected.type === "code" &&
                  selected.language !== "markdown" &&
                  !selected.title.endsWith(".md") ? (
                    <CodeBlock
                      code={selected.content}
                      language={selected.language || "text"}
                    />
                  ) : (
                    <div className="p-4">
                      <MarkdownContent content={selected.content} />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
