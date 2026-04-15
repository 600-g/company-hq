"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useTerminalStore } from "@/stores/terminalStore";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useChatStore } from "@/stores/chatStore";
import { useUIStore } from "@/stores/uiStore";
import { fixErrorWithAI } from "@/lib/claude";
import { saveArtifactsToDisk } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Play,
  Square,
  Trash2,
  Terminal,
  Wrench,
  X,
} from "lucide-react";

export async function runTerminalSSE(
  params: { id: string; command: string; cwd: string },
  callbacks: {
    onStdout: (id: string, data: string) => void;
    onStderr: (id: string, data: string) => void;
    onExit: (id: string, code: number | null) => void;
  },
) {
  const response = await fetch("/api/terminal/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const reader = response.body?.getReader();
  if (!reader) return;

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
        const data = JSON.parse(line.slice(6));
        if (data.stream === "stdout") {
          callbacks.onStdout(params.id, data.text);
        } else if (data.stream === "stderr") {
          callbacks.onStderr(params.id, data.text);
        } else if (data.stream === "exit") {
          callbacks.onExit(params.id, data.code);
        }
      } catch {
        // skip malformed SSE
      }
    }
  }
}

export default function TerminalPanel() {
  const t = useTranslations("terminal");
  const showTerminalPanel = useUIStore((s) => s.showTerminalPanel);
  const closeTerminalPanel = useUIStore((s) => s.closeTerminalPanel);
  const processes = useTerminalStore((s) => s.processes);
  const activeProcessId = useTerminalStore((s) => s.activeProcessId);
  const setActive = useTerminalStore((s) => s.setActive);
  const clearProcess = useTerminalStore((s) => s.clearProcess);
  const setDetectedUrl = useTerminalStore((s) => s.setDetectedUrl);
  const addProcess = useTerminalStore((s) => s.addProcess);
  const appendLine = useTerminalStore((s) => s.appendLine);
  const setExited = useTerminalStore((s) => s.setExited);
  const workingDirectory = useProjectStore((s) => s.workingDirectory);
  const addMessage = useChatStore((s) => s.addMessage);
  const hasApiKey = useSettingsStore((s) => s.isApiKeyValid);
  const [commandInput, setCommandInput] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = processes.find((p) => p.id === activeProcessId);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [active?.lines.length]);

  if (!showTerminalPanel) return null;

  const handleRun = async () => {
    if (!commandInput.trim() || !workingDirectory) return;
    const id = crypto.randomUUID();
    addProcess({ id, command: commandInput, cwd: workingDirectory });
    runTerminalSSE({ id, command: commandInput, cwd: workingDirectory }, {
      onStdout(id, data) {
        appendLine(id, { text: data, stream: "stdout", timestamp: Date.now() });
        const urlMatch = data.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/);
        if (urlMatch) {
          setDetectedUrl(id, urlMatch[0]);
        }
      },
      onStderr(id, data) {
        appendLine(id, { text: data, stream: "stderr", timestamp: Date.now() });
      },
      onExit(id, code) {
        setExited(id, code ?? 1);
      },
    });
    setCommandInput("");
  };

  const handleKill = async (id: string) => {
    await fetch("/api/terminal/kill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  };

  const handleFixError = async (proc: typeof processes[number]) => {
    if (!hasApiKey) return;
    setFixing(proc.id);
    try {
      const res = await fetch("/api/fs/read-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dirPath: proc.cwd }),
      });
      const { files: diskFiles } = await res.json();
      const artifacts = diskFiles.map((f: { title: string; language: string; content: string }) => ({
        id: crypto.randomUUID(),
        type: "code" as const,
        title: f.title,
        language: f.language,
        content: f.content,
      }));

      if (artifacts.length === 0) {
        addMessage({
          type: "ai",
          content: t("noSourceFiles", { cwd: proc.cwd }),
        });
        return;
      }

      const stderrLines = proc.lines.filter((l) => l.stream === "stderr").map((l) => l.text);
      const allLines = proc.lines.map((l) => l.text);
      let errorOutput: string;
      if (stderrLines.length <= 80) {
        errorOutput = stderrLines.join("\n");
      } else {
        errorOutput = [
          ...stderrLines.slice(0, 40),
          `\n... (${t("linesOmitted", { count: stderrLines.length - 80 })}) ...\n`,
          ...stderrLines.slice(-40),
        ].join("\n");
      }
      if (stderrLines.length === 0) {
        errorOutput = allLines.slice(-50).join("\n");
      }
      if (!errorOutput.trim()) {
        addMessage({
          type: "ai",
          content: t("emptyErrorLog"),
        });
        return;
      }
      const result = await fixErrorWithAI(errorOutput, artifacts);

      addMessage({
        type: "ai",
        content: `**${t("autoFix")}**\n\n${result.summary}`,
        artifacts: result.artifacts,
      });

      if (result.artifacts.length > 0) {
        await saveArtifactsToDisk(result.artifacts, proc.cwd);

        const newId = crypto.randomUUID();
        addProcess({ id: newId, command: proc.command, cwd: proc.cwd });
        runTerminalSSE({ id: newId, command: proc.command, cwd: proc.cwd }, {
          onStdout(id, data) {
            appendLine(id, { text: data, stream: "stdout", timestamp: Date.now() });
            const urlMatch = data.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/);
            if (urlMatch) setDetectedUrl(id, urlMatch[0]);
          },
          onStderr(id, data) {
            appendLine(id, { text: data, stream: "stderr", timestamp: Date.now() });
          },
          onExit(id, code) {
            setExited(id, code ?? 1);
          },
        });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      addMessage({
        type: "ai",
        content: t("fixFailed", { detail }),
      });
    } finally {
      setFixing(null);
    }
  };

  return (
    <div className="border-t bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium">Terminal</span>
          {workingDirectory && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[300px]">
              {workingDirectory}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {active?.detectedUrl && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={() => {
                window.open(active.detectedUrl!, "_blank", "noopener,noreferrer");
              }}
            >
              <ExternalLink className="h-3 w-3" />
              {t("preview")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={closeTerminalPanel}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Process tabs */}
          {processes.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 border-b overflow-x-auto">
              {processes.map((proc) => (
                <div
                  key={proc.id}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer ${
                    proc.id === activeProcessId
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted text-muted-foreground"
                  }`}
                  onClick={() => setActive(proc.id)}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      proc.status === "running"
                        ? "bg-green-500"
                        : proc.exitCode === 0
                          ? "bg-blue-500"
                          : "bg-red-500"
                    }`}
                  />
                  <span className="truncate max-w-[120px]">
                    {proc.command}
                  </span>
                  {proc.status === "running" ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleKill(proc.id);
                      }}
                      className="hover:text-destructive"
                    >
                      <Square className="h-3 w-3" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        clearProcess(proc.id);
                      }}
                      className="hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Output */}
          <ScrollArea className="h-48">
            <div
              ref={scrollRef}
              className="p-2 font-mono text-xs leading-relaxed"
            >
              {active ? (
                <>
                  <div className="text-muted-foreground mb-1">
                    $ {active.command}
                  </div>
                  {active.lines.map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.stream === "stderr"
                          ? "text-red-400"
                          : "text-foreground"
                      }
                    >
                      {line.text}
                    </div>
                  ))}
                  {active.status === "exited" && (
                    <>
                      <div
                        className={`mt-1 ${
                          active.exitCode === 0
                            ? "text-green-500"
                            : "text-red-400"
                        }`}
                      >
                        Process exited with code {active.exitCode}
                      </div>
                      {active.exitCode !== 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 h-6 text-[11px] gap-1 border-red-400/50 text-red-400 hover:bg-red-400/10"
                          onClick={() => handleFixError(active)}
                          disabled={fixing === active.id || !hasApiKey}
                        >
                          {fixing === active.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Wrench className="h-3 w-3" />
                          )}
                          {fixing === active.id ? t("fixing") : t("fixError")}
                        </Button>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className="text-muted-foreground">
                  {workingDirectory
                    ? t("enterCommandOrRun")
                    : t("saveFirstToRun")}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Command input */}
          <div className="flex items-center gap-2 px-2 py-1.5 border-t">
            <span className="text-xs text-muted-foreground">$</span>
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRun();
              }}
              placeholder={
                workingDirectory
                  ? t("enterCommand")
                  : t("setWorkingDir")
              }
              disabled={!workingDirectory}
              className="flex-1 bg-transparent text-xs font-mono outline-none placeholder:text-muted-foreground disabled:opacity-50"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleRun}
              disabled={!commandInput.trim() || !workingDirectory}
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
