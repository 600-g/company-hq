"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, ExternalLink, RefreshCw } from "lucide-react";

declare global {
  interface Window {
    electronAPI?: {
      relaunchApp: () => Promise<void>;
    };
  }
}

interface ToolStatus {
  installed: boolean;
  version: string | null;
}

interface Props {
  open: boolean;
  platform: string;
  tools: Record<string, ToolStatus>;
  onResolved: () => void;
}

const DOWNLOAD_URLS: Record<string, string> = {
  node: "https://nodejs.org/en/download/",
  git: "https://git-scm.com/downloads",
};

export default function SystemCheckDialog({ open, platform, tools: initialTools, onResolved }: Props) {
  const t = useTranslations("systemCheck");
  const [tools, setTools] = useState(initialTools);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installOutput, setInstallOutput] = useState("");
  const [checking, setChecking] = useState(false);
  const [needsRestart, setNeedsRestart] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [installOutput]);

  const missingTools = Object.entries(tools).filter(([, s]) => !s.installed);
  const allInstalled = missingTools.length === 0;

  useEffect(() => {
    if (allInstalled && open) {
      onResolved();
    }
  }, [allInstalled, open, onResolved]);

  const handleRecheck = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/system/check");
      const data = await res.json();
      setTools(data.tools);
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  }, []);

  const handleInstall = useCallback(async (tool: string) => {
    setInstalling(tool);
    setInstallOutput("");

    try {
      const res = await fetch("/api/system/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool }),
      });

      if (!res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const { type, data } = JSON.parse(line.slice(6));
            if (type === "stdout" || type === "stderr") {
              setInstallOutput((prev) => prev + data);
            } else if (type === "error") {
              setInstallOutput((prev) => prev + `\nError: ${data}\n`);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
      setNeedsRestart(true);
    } catch (err) {
      setInstallOutput((prev) => prev + `\nFetch error: ${err}\n`);
    } finally {
      setInstalling(null);
      handleRecheck();
    }
  }, [handleRecheck]);

  const isWin = platform === "win32";

  return (
    <Dialog open={open && !allInstalled}>
      <DialogContent className="sm:max-w-[500px]" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {Object.entries(tools).map(([name, status]) => (
            <div key={name} className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-center gap-3">
                {status.installed ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <div>
                  <p className="text-sm font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground">
                    {status.installed ? status.version : t("notFound")}
                  </p>
                </div>
              </div>

              {!status.installed && name !== "npm" && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={installing !== null}
                    onClick={() => handleInstall(name)}
                  >
                    {installing === name ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        {t("installing")}
                      </>
                    ) : (
                      isWin ? t("installWinget") : t("installBrew")
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => window.open(DOWNLOAD_URLS[name], "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {!status.installed && name === "npm" && (
                <p className="text-xs text-muted-foreground">{t("npmNote")}</p>
              )}
            </div>
          ))}
        </div>

        {needsRestart && (
          <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {t("restartRequired")}
              </p>
            </div>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => window.electronAPI?.relaunchApp().catch(() => {})}
            >
              {t("restartNow")}
            </Button>
          </div>
        )}

        {installOutput && (
          <pre
            ref={outputRef}
            className="max-h-40 overflow-y-auto rounded-md bg-muted p-3 text-xs font-mono"
          >
            {installOutput}
          </pre>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecheck}
            disabled={checking || installing !== null}
          >
            {checking ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                {t("checking")}
              </>
            ) : (
              t("recheck")
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
