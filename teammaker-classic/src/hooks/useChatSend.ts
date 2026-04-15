"use client";

import { useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useChatStore } from "@/stores/chatStore";
import { useAgentStore } from "@/stores/agentStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTerminalStore } from "@/stores/terminalStore";
import { useProjectStore } from "@/stores/projectStore";
import { useBubbleStore } from "@/stores/bubbleStore";
import { useUIStore } from "@/stores/uiStore";
import { usePipelineStore } from "@/stores/pipelineStore";
import { useHandoffStore } from "@/stores/handoffStore";
import { useSessionStore } from "@/stores/sessionStore";
import type { Session } from "@/types/session";
import { saveArtifactsToDisk } from "@/lib/download";
import type { Artifact } from "@/types/artifact";
import type { ToolUseEvent } from "@/lib/claude";
import {
  refineRequirements,
  executeAgentTask,
  fixErrorWithAI,
  validateAgentOutput,
} from "@/lib/claude";
import { mockRefineRequirements, mockExecuteAgentTask } from "@/lib/test-mock";
import { useOfficeStore } from "@/stores/officeStore";
import { findAvailablePositions, findEmptyChairPositions, agentOccKey } from "@/lib/grid";
import { getFurnitureDef } from "@/config/furniture-catalog";
import { trackEvent } from "@/lib/analytics";

import { waitForAllWalks } from "@/lib/walk-tracker";
import { runTerminalSSE } from "@/components/terminal/TerminalPanel";
import { createSessionAbort } from "@/lib/session-abort";

const MAX_RETRIES = 2;

type ChatTranslator = (key: string, values?: Record<string, string | number>) => string;

function formatToolEvent(event: ToolUseEvent, t: ChatTranslator): string {
  const fileName = event.detail ? event.detail.split("/").pop() : "";
  switch (event.tool) {
    case "write_file":
      return t("creatingFile", { name: fileName || "" });
    case "read_file":
      return t("readingFile", { name: fileName || "" });
    case "run_command":
      return t("runningCommand", { detail: event.detail?.slice(0, 30) || t("command") });
    case "list_directory":
      return t("browsingFolder");
    case "read_previous_artifacts":
      return t("checkingPrevious");
    default:
      return t("running", { tool: event.tool });
  }
}

function createToolUseHandler(loadingId: string, t: ChatTranslator) {
  return (event: ToolUseEvent) => {
    const text = formatToolEvent(event, t);
    useBubbleStore.getState().updateBubble(loadingId, text);
    useChatStore.getState().setTypingStatus(text);
  };
}

type SupabaseConfig = {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  projectId: string;
} | null;

// Module-level refs — survive component unmount (e.g. navigating to settings)
let _pendingSupabase: {
  projectId: string;
  projectUrl: string;
  anonKey: string;
  serviceRoleKey: string;
} | null = null;
let _supabaseResolve: ((config: SupabaseConfig) => void) | null = null;
let _lastDeployError: string | null = null;
let _lastDeployChoice: { needsDb: boolean; needsGithub: boolean } | null = null;
let _systemChecked = false;
let _systemCheckResolve: (() => void) | null = null;

export function useChatSend() {
  const t = useTranslations("chat");
  const [input, setInput] = useState("");
  const [showSystemCheck, setShowSystemCheck] = useState(false);
  const [systemCheckResult, setSystemCheckResult] = useState<{
    platform: string;
    tools: Record<string, { installed: boolean; version: string | null }>;
  } | null>(null);
  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const setExpanded = useChatStore((s) => s.setExpanded);
  const setTyping = useChatStore((s) => s.setTyping);
  const phase = useChatStore((s) => s.phase);
  const setPhase = useChatStore((s) => s.setPhase);
  const agents = useAgentStore((s) => s.agents);
  const setAgentStatus = useAgentStore((s) => s.setAgentStatus);
  const isApiKeyValid = useSettingsStore((s) => s.isApiKeyValid);
  const addBubble = useBubbleStore((s) => s.addBubble);
  const removeBubble = useBubbleStore((s) => s.removeBubble);

  /**
   * Execute a single agent (with validation + retry)
   */
  const executeWithRetry = useCallback(
    async (
      agentRole: string,
      agentDescription: string,
      taskDescription: string,
      previousResults: string | undefined,
      projectType?: string,
      framework?: string,
      feedbackIssues?: string[],
      options?: {
        onToolUse?: (event: ToolUseEvent) => void;
        signal?: AbortSignal;
      },
    ) => {
      const workingDirectory =
        useProjectStore.getState().workingDirectory || undefined;

      // Collect previous artifacts from recent messages
      const recentMessages = useChatStore.getState().messages;
      const lastAiMsg = [...recentMessages]
        .reverse()
        .find((m) => m.type === "ai" && m.artifacts?.length);
      const previousArtifacts = lastAiMsg?.artifacts || [];

      let task = taskDescription;
      if (feedbackIssues && feedbackIssues.length > 0) {
        task += `\n\n[Issues found in previous output - must be fixed]\n${feedbackIssues.map((i) => `- ${i}`).join("\n")}`;
      }

      // Test mode: return mock result without calling API
      if (useSettingsStore.getState().testMode) {
        return await mockExecuteAgentTask(agentRole, task);
      }

      const result = await executeAgentTask(
        agentRole,
        agentDescription,
        task,
        previousResults,
        recentMessages,
        projectType,
        framework,
        {
          enableTools: !!workingDirectory,
          workingDirectory,
          previousArtifacts,
          onToolUse: options?.onToolUse,
          signal: options?.signal,
        },
      );

      return result;
    },
    [],
  );

  /**
   * Execute a single agent directly (ready_direct)
   */
  const executeDirectAgent = useCallback(
    async (
      spec: string,
      target: {
        agentId: string;
        agentName: string;
      },
      projectType?: string,
      framework?: string,
      signal?: AbortSignal,
    ) => {
      if (!isApiKeyValid && !useSettingsStore.getState().testMode) return;

      const agent = useAgentStore.getState().agents.get(target.agentId);
      if (!agent) {
        addMessage({
          type: "system",
          content: t("agentNotFound", { name: target.agentName }),
        });
        return;
      }

      addMessage({
        type: "system",
        content: t("directTaskRequest", { name: target.agentName }),
      });

      setAgentStatus(target.agentId, "working");

      const loadingId = addBubble({
        targetType: "agent",
        targetId: target.agentId,
        text: t("working"),
        variant: "loading",
      });

      try {
        const onToolUse = createToolUseHandler(loadingId, t);
        const result = await executeWithRetry(
          agent.role,
          agent.description,
          spec,
          undefined,
          projectType,
          framework,
          undefined,
          { onToolUse, signal },
        );

        removeBubble(loadingId);
        addBubble({
          targetType: "agent",
          targetId: target.agentId,
          text: result.summary,
          variant: "result",
        });

        setAgentStatus(target.agentId, "complete");

        // Save artifacts to disk immediately
        const wd = useProjectStore.getState().workingDirectory;
        if (wd && result.artifacts.length > 0) {
          await saveArtifactsToDisk(result.artifacts, wd);
        }

        addMessage({
          type: "ai",
          content: result.summary,
          agentName: target.agentName,
          artifacts: result.artifacts.length > 0 ? result.artifacts : undefined,
        });

        setTimeout(() => {
          setAgentStatus(target.agentId, "idle");
        }, 3000);
      } catch (err) {
        removeBubble(loadingId);
        addBubble({
          targetType: "agent",
          targetId: target.agentId,
          text: t("errorOccurred", { message: err instanceof Error ? err.message : t("unknownError") }),
          variant: "result",
        });
        setAgentStatus(target.agentId, "error");
        setTimeout(() => setAgentStatus(target.agentId, "idle"), 3000);
        throw err;
      }
    },
    [
      isApiKeyValid,
      agents,
      addMessage,
      addBubble,
      removeBubble,
      setAgentStatus,
      executeWithRetry,
    ],
  );

  /**
   * Execute pipeline (agents in sequence + validation + retry)
   */
  const executePipeline = useCallback(
    async (
      spec: string,
      pipeline: { agentId: string; agentName: string }[],
      projectType?: string,
      framework?: string,
      signal?: AbortSignal,
      storageType?: string,
    ) => {
      if (!isApiKeyValid && !useSettingsStore.getState().testMode) return;

      trackEvent("pipeline_started", {
        projectType: projectType || "unknown",
        agentCount: pipeline.length,
      });

      // Create pipeline state
      usePipelineStore
        .getState()
        .createPipeline(
          "current",
          spec,
          pipeline,
          projectType,
          framework,
          storageType,
        );

      // Set supabase info after createPipeline
      if (_pendingSupabase) {
        usePipelineStore.getState().setSupabaseInfo(_pendingSupabase);
        _pendingSupabase = null;
      }

      let previousAgentResult = "";
      let previousAgentArtifacts: Artifact[] = [];

      for (let i = 0; i < pipeline.length; i++) {
        const step = pipeline[i];
        // Always read fresh from store (agents may have been created just before pipeline runs)
        const agent = useAgentStore.getState().agents.get(step.agentId);
        if (!agent) {
          addMessage({
            type: "system",
            content: t("agentNotFoundSkip", { name: step.agentName }),
          });
          continue;
        }

        if (i > 0) {
          const prevStep = pipeline[i - 1];
          const prevAgent = useAgentStore
            .getState()
            .agents.get(prevStep.agentId);

          // Show handoff card and auto-open chat panel
          addMessage({
            type: "system",
            content: previousAgentResult,
            taskId: "agent-handoff",
            agentName: `${prevStep.agentName} → ${step.agentName}`,
            artifacts:
              previousAgentArtifacts.length > 0
                ? [...previousAgentArtifacts]
                : undefined,
          });
          setExpanded(true);

          // 3) Feedback loop: keep re-executing previous agent until user approves
          let approved = false;
          while (!approved) {
            const reviewResult = await usePipelineStore
              .getState()
              .requestHandoffReview(prevStep.agentName, step.agentName);

            if (!reviewResult.feedback) {
              // User approved without feedback — proceed
              approved = true;
            } else {
              // User gave feedback — re-execute previous agent
              addMessage({
                type: "user",
                content: reviewResult.feedback,
              });

              if (prevAgent) {
                setAgentStatus(prevStep.agentId, "working");

                const reworkLoadingId = addBubble({
                  targetType: "agent",
                  targetId: prevStep.agentId,
                  text: t("applyingFeedback"),
                  variant: "loading",
                });

                const onToolUse = createToolUseHandler(reworkLoadingId, t);
                const reworkTask = `${spec}\n\n[User feedback] ${reviewResult.feedback}\n\n[Previous work result]\n${previousAgentResult}`;
                const reworkResult = await executeWithRetry(
                  prevAgent.role,
                  prevAgent.description,
                  reworkTask,
                  undefined,
                  usePipelineStore.getState().activePipeline?.projectType,
                  usePipelineStore.getState().activePipeline?.framework,
                  undefined,
                  { onToolUse, signal },
                );

                removeBubble(reworkLoadingId);
                addBubble({
                  targetType: "agent",
                  targetId: prevStep.agentId,
                  text: reworkResult.summary,
                  variant: "result",
                });

                // Do not save to disk during pipeline (prevents create-next-app conflicts)
                // Dev agents write directly via write_file tool;
                // planning/design artifacts are kept in memory

                setAgentStatus(prevStep.agentId, "complete");
                previousAgentResult = reworkResult.summary;
                previousAgentArtifacts = reworkResult.artifacts;

                addMessage({
                  type: "ai",
                  content: reworkResult.summary,
                  agentName: prevStep.agentName,
                  artifacts:
                    reworkResult.artifacts.length > 0
                      ? reworkResult.artifacts
                      : undefined,
                });

                setTimeout(() => {
                  setAgentStatus(prevStep.agentId, "idle");
                }, 3000);
              }

              // Show updated handoff card
              addMessage({
                type: "system",
                content: previousAgentResult,
                taskId: "agent-handoff",
                agentName: `${prevStep.agentName} → ${step.agentName}`,
                artifacts:
                  previousAgentArtifacts.length > 0
                    ? [...previousAgentArtifacts]
                    : undefined,
              });
            }
          }

          // Courier delivers to next agent
          await useHandoffStore
            .getState()
            .triggerHandoff(prevStep.agentId, step.agentId);
        } else {
          addMessage({
            type: "system",
            content: t("agentStarting", { name: step.agentName }),
          });
        }

        setAgentStatus(step.agentId, "working");
        usePipelineStore.getState().updateAgentStep(i, "running");

        const loadingId = addBubble({
          targetType: "agent",
          targetId: step.agentId,
          text: t("working"),
          variant: "loading",
        });

        try {
          let taskContext = previousAgentResult;
          if (previousAgentArtifacts.length > 0) {
            const wd = useProjectStore.getState().workingDirectory;
            if (wd) {
              taskContext += `\n\n[Previous agent artifacts]\nThe previous agent saved files to the project folder. Use the \`list_directory\` tool to inspect the project structure, and \`read_file\` to read files directly.`;
            } else {
              const artifactTexts = previousAgentArtifacts
                .map((a) => {
                  const maxLen = 2000;
                  const content =
                    a.content.length > maxLen
                      ? a.content.slice(0, maxLen) + "\n... (truncated)"
                      : a.content;
                  const langTag = a.language ? ` (${a.language})` : "";
                  return `### ${a.title}${langTag}\n${content}`;
                })
                .join("\n\n");
              taskContext += `\n\n[Previous agent artifacts]\n${artifactTexts}`;
            }
          }

          const taskForAgent = taskContext
            ? `[Previous agent result]\n${taskContext}\n\n---\n\n[Current agent requirements]\n${spec}`
            : spec;

          // Execute agent + validation + retry
          const onToolUse = createToolUseHandler(loadingId, t);
          let result = await executeWithRetry(
            agent.role,
            agent.description,
            taskForAgent,
            undefined,
            projectType,
            framework,
            undefined,
            { onToolUse, signal },
          );

          let retries = 0;
          let validation = validateAgentOutput(result);

          while (!validation.valid && retries < MAX_RETRIES) {
            retries++;
            usePipelineStore.getState().incrementRetry(i);

            addMessage({
              type: "system",
              content: t("validationFailed", { role: agent.role, retries, max: MAX_RETRIES, issues: validation.issues.join(", ") }),
            });

            result = await executeWithRetry(
              agent.role,
              agent.description,
              taskForAgent,
              undefined,
              projectType,
              framework,
              validation.issues,
              { onToolUse, signal },
            );

            validation = validateAgentOutput(result);
          }

          // Update agent completion status
          usePipelineStore
            .getState()
            .updateAgentStep(
              i,
              validation.valid ? "completed" : "failed",
              { summary: result.summary, artifacts: result.artifacts },
              validation.valid ? undefined : validation.issues.join(", "),
            );

          removeBubble(loadingId);
          addBubble({
            targetType: "agent",
            targetId: step.agentId,
            text: result.summary,
            variant: "result",
          });

          // Do not save to disk during pipeline (prevents create-next-app conflicts)
          // const wd = useProjectStore.getState().workingDirectory;
          // if (wd && result.artifacts.length > 0) {
          //   await saveArtifactsToDisk(result.artifacts, wd);
          // }

          setAgentStatus(step.agentId, "complete");
          previousAgentResult = result.summary;
          previousAgentArtifacts = result.artifacts;

          addMessage({
            type: "ai",
            content: result.summary,
            agentName: step.agentName,
            artifacts:
              result.artifacts.length > 0 ? result.artifacts : undefined,
          });

          setTimeout(() => {
            setAgentStatus(step.agentId, "idle");
          }, 3000);
        } catch (err) {
          removeBubble(loadingId);
          addBubble({
            targetType: "agent",
            targetId: step.agentId,
            text: t("errorOccurred", { message: err instanceof Error ? err.message : t("unknownError") }),
            variant: "result",
          });
          setAgentStatus(step.agentId, "error");
          setTimeout(() => setAgentStatus(step.agentId, "idle"), 3000);
          usePipelineStore
            .getState()
            .updateAgentStep(
              i,
              "failed",
              undefined,
              err instanceof Error ? err.message : t("unknownError"),
            );
          addMessage({
            type: "system",
            content: t("pipelineError"),
            taskId: "pipeline-paused",
          });
          return; // Stop pipeline (state preserved, resumable)
        }
      }

      // Supabase: create .env.local + run migration (last step of pipeline)
      const currentPipeline = usePipelineStore.getState().activePipeline;
      if (
        currentPipeline?.storageType === "database" &&
        currentPipeline.supabase
      ) {
        const wd = useProjectStore.getState().workingDirectory;
        if (wd) {
          // 1. Create .env.local
          addMessage({
            type: "system",
            content: "Setting up database environment variables...",
          });
          const envContent = [
            `NEXT_PUBLIC_SUPABASE_URL=${currentPipeline.supabase.projectUrl}`,
            `NEXT_PUBLIC_SUPABASE_ANON_KEY=${currentPipeline.supabase.anonKey}`,
            `SUPABASE_SERVICE_ROLE_KEY=${currentPipeline.supabase.serviceRoleKey}`,
            "",
          ].join("\n");
          await fetch("/api/fs/save-artifacts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dirPath: wd,
              artifacts: [
                {
                  title: ".env.local",
                  content: envContent,
                  type: "code",
                  language: "env",
                },
              ],
            }),
          });

          // 2. Find schema.sql on disk and run migration
          addMessage({
            type: "system",
            content: "Creating database tables...",
          });
          try {
            const migrateRes = await fetch("/api/deploy/supabase/migrate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                projectId: currentPipeline.supabase.projectId,
                cwd: wd,
              }),
            });
            const migrateData = await migrateRes.json();
            if (migrateRes.ok) {
              addMessage({
                type: "system",
                content: "Database setup complete!",
              });
            } else {
              addMessage({
                type: "system",
                content: t("tableCreateError", { message: migrateData.error }),
              });
            }
          } catch (err) {
            addMessage({
              type: "system",
              content: t("migrationFailed", { message: err instanceof Error ? err.message : t("unknownError") }),
            });
          }
        }
      }

      trackEvent("pipeline_completed", {
        agentCount: pipeline.length,
        projectType: currentPipeline?.projectType || "unknown",
      });

      if (pipeline.length > 1) {
        addMessage({
          type: "system",
          content: "Ready to deploy!",
          taskId: "deploy-suggest",
        });
      }

      // Clear pipeline
      usePipelineStore.getState().clearPipeline();
    },
    [
      isApiKeyValid,
      agents,
      addMessage,
      addBubble,
      removeBubble,
      setAgentStatus,
      executeWithRetry,
    ],
  );

  /**
   * Resume a paused pipeline
   */
  const resumePipeline = useCallback(async () => {
    const pipeline = usePipelineStore.getState().activePipeline;
    if (!pipeline) return;

    const resumePoint = usePipelineStore.getState().getResumePoint();
    if (!resumePoint) {
      addMessage({ type: "system", content: "No tasks to resume." });
      usePipelineStore.getState().clearPipeline();
      return;
    }

    const signal = createSessionAbort();

    // Collect results from completed steps before resume point
    let previousAgentResult = "";
    let previousAgentArtifacts: Artifact[] = [];
    for (let i = 0; i < resumePoint.agentIndex; i++) {
      const step = pipeline.steps[i];
      if (step.result) {
        previousAgentResult = step.result.summary;
        previousAgentArtifacts = step.result.artifacts;
      }
    }

    // Build remaining pipeline from resume point
    const remainingPipeline = pipeline.steps
      .slice(resumePoint.agentIndex)
      .map((s) => ({ agentId: s.agentId, agentName: s.agentName }));

    addMessage({
      type: "system",
      content: t("pipelineResuming", { index: resumePoint.agentIndex + 1 }),
    });

    setPhase("executing");
    setTyping(true);

    try {
      // Re-run executePipeline from the resume point
      // Reset the failed step to pending first
      usePipelineStore
        .getState()
        .updateAgentStep(resumePoint.agentIndex, "pending");

      for (let ri = 0; ri < remainingPipeline.length; ri++) {
        const globalIndex = resumePoint.agentIndex + ri;
        const step = remainingPipeline[ri];
        const agent = useAgentStore.getState().agents.get(step.agentId);
        if (!agent) {
          addMessage({
            type: "system",
            content: t("agentNotFoundSkip", { name: step.agentName }),
          });
          continue;
        }

        if (ri > 0) {
          addMessage({
            type: "system",
            content: t("agentStarting", { name: step.agentName }),
          });
        }

        setAgentStatus(step.agentId, "working");
        usePipelineStore.getState().updateAgentStep(globalIndex, "running");

        const loadingId = addBubble({
          targetType: "agent",
          targetId: step.agentId,
          text: t("working"),
          variant: "loading",
        });

        try {
          let taskContext = previousAgentResult;
          if (previousAgentArtifacts.length > 0) {
            const wd = useProjectStore.getState().workingDirectory;
            if (wd) {
              taskContext += `\n\n[Previous Agent Output]\nThe previous agent saved files to the project directory. Use the \`list_directory\` tool to check the project structure, and \`read_file\` to read files as needed.`;
            }
          }

          const taskForAgent = taskContext
            ? `[Previous Agent Result]\n${taskContext}\n\n---\n\n[Current Agent Requirements]\n${pipeline.spec}`
            : pipeline.spec;

          const onToolUse = createToolUseHandler(loadingId, t);
          const result = await executeWithRetry(
            agent.role,
            agent.description,
            taskForAgent,
            undefined,
            pipeline.projectType,
            pipeline.framework,
            undefined,
            { onToolUse, signal },
          );

          usePipelineStore
            .getState()
            .updateAgentStep(globalIndex, "completed", {
              summary: result.summary,
              artifacts: result.artifacts,
            });

          removeBubble(loadingId);
          addBubble({
            targetType: "agent",
            targetId: step.agentId,
            text: result.summary,
            variant: "result",
          });

          // Do not save to disk during pipeline (prevents create-next-app conflicts)
          // const wd = useProjectStore.getState().workingDirectory;
          // if (wd && result.artifacts.length > 0) {
          //   await saveArtifactsToDisk(result.artifacts, wd);
          // }

          setAgentStatus(step.agentId, "complete");
          previousAgentResult = result.summary;
          previousAgentArtifacts = result.artifacts;

          addMessage({
            type: "ai",
            content: result.summary,
            agentName: step.agentName,
            artifacts:
              result.artifacts.length > 0 ? result.artifacts : undefined,
          });

          setTimeout(() => {
            setAgentStatus(step.agentId, "idle");
          }, 3000);
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          removeBubble(loadingId);
          addBubble({
            targetType: "agent",
            targetId: step.agentId,
            text: t("errorOccurred", { message: err instanceof Error ? err.message : t("unknownError") }),
            variant: "result",
          });
          setAgentStatus(step.agentId, "error");
          setTimeout(() => setAgentStatus(step.agentId, "idle"), 3000);
          usePipelineStore
            .getState()
            .updateAgentStep(
              globalIndex,
              "failed",
              undefined,
              err instanceof Error ? err.message : t("unknownError"),
            );
          addMessage({
            type: "system",
            content: t("pipelineError"),
            taskId: "pipeline-paused",
          });
          return;
        }
      }

      trackEvent("pipeline_completed", {
        agentCount: pipeline.steps.length,
        projectType: pipeline.projectType || "unknown",
        resumed: true,
      });
      addMessage({
        type: "system",
        content: "All agents have completed their tasks!",
        taskId: "pipeline-complete",
      });
      const resumedPipeline = usePipelineStore.getState().activePipeline;
      if (resumedPipeline?.projectType === "web") {
        addMessage({
          type: "system",
          content: "Ready to deploy!",
          taskId: "deploy-suggest",
        });
      }
      usePipelineStore.getState().clearPipeline();
    } finally {
      setPhase("idle");
      setTyping(false);
    }
  }, [
    agents,
    addMessage,
    addBubble,
    removeBubble,
    setAgentStatus,
    setPhase,
    setTyping,
    executeWithRetry,
  ]);

  const handleFixFromChat = useCallback(async () => {
    if (!isApiKeyValid && !useSettingsStore.getState().testMode) return;

    const workingDirectory = useProjectStore.getState().workingDirectory;
    if (!workingDirectory) {
      addMessage({
        type: "system",
        content: "Working directory not set.",
      });
      return;
    }

    const processes = useTerminalStore.getState().processes;
    const failedProc = [...processes]
      .reverse()
      .find((p) => p.status === "exited" && p.exitCode !== 0);
    const latestProc = [...processes]
      .reverse()
      .find((p) => p.status === "exited" || p.status === "running");
    const proc = failedProc || latestProc;

    let errorOutput = "";
    if (proc) {
      const stderrLines = proc.lines
        .filter((l) => l.stream === "stderr")
        .map((l) => l.text);
      if (stderrLines.length > 0) {
        errorOutput =
          stderrLines.length <= 80
            ? stderrLines.join("\n")
            : [
                ...stderrLines.slice(0, 40),
                `\n... (${stderrLines.length - 80} lines omitted) ...\n`,
                ...stderrLines.slice(-40),
              ].join("\n");
      } else {
        errorOutput = proc.lines
          .slice(-50)
          .map((l) => l.text)
          .join("\n");
      }
    }

    const latestUserMsg = useChatStore
      .getState()
      .messages.filter((m) => m.type === "user")
      .pop();
    if (latestUserMsg) {
      errorOutput = `[User Description] ${latestUserMsg.content}\n\n[Terminal Output]\n${errorOutput}`;
    }

    if (!errorOutput.trim()) {
      addMessage({
        type: "system",
        content: "Could not find error logs.",
      });
      return;
    }

    const res = await fetch("/api/fs/read-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dirPath: workingDirectory }),
    });
    const { files: diskFiles } = await res.json();
    const artifacts = diskFiles.map(
      (f: { title: string; language: string; content: string }) => ({
        id: crypto.randomUUID(),
        type: "code" as const,
        title: f.title,
        language: f.language,
        content: f.content,
      }),
    );

    if (artifacts.length === 0) {
      addMessage({
        type: "system",
        content: t("projectFilesNotFound", { path: workingDirectory }),
      });
      return;
    }

    const result = await fixErrorWithAI(errorOutput, artifacts);

    addMessage({
      type: "ai",
      content: t("autoFixResult", { summary: result.summary }),
      artifacts: result.artifacts,
    });

    if (result.artifacts.length > 0) {
      await saveArtifactsToDisk(result.artifacts, workingDirectory);

      if (proc) {
        const newId = crypto.randomUUID();
        const terminalStore = useTerminalStore.getState();
        terminalStore.addProcess({
          id: newId,
          command: proc.command,
          cwd: proc.cwd,
        });
        useUIStore.getState().openTerminalPanel();
        runTerminalSSE(
          { id: newId, command: proc.command, cwd: proc.cwd },
          {
            onStdout(id, data) {
              terminalStore.appendLine(id, {
                text: data,
                stream: "stdout",
                timestamp: Date.now(),
              });
              const urlMatch = data.match(
                /https?:\/\/(?:localhost|127\.0\.0\.1):\d+/,
              );
              if (urlMatch) terminalStore.setDetectedUrl(id, urlMatch[0]);
            },
            onStderr(id, data) {
              terminalStore.appendLine(id, {
                text: data,
                stream: "stderr",
                timestamp: Date.now(),
              });
            },
            onExit(id, code) {
              terminalStore.setExited(id, code ?? 1);
            },
          },
        );
      }
    }
  }, [isApiKeyValid, addMessage]);

  const onSystemCheckResolved = useCallback(() => {
    setShowSystemCheck(false);
    setSystemCheckResult(null);
    _systemChecked = true;
    _systemCheckResolve?.();
    _systemCheckResolve = null;
  }, []);

  const handleSend = useCallback(async () => {
    const isTestMode = useSettingsStore.getState().testMode;
    if (!input.trim() || (!isApiKeyValid && !isTestMode)) return;

    // System check gate — runs once per session
    if (!_systemChecked && !isTestMode) {
      try {
        const res = await fetch("/api/system/check");
        const data = await res.json();
        const missing = Object.values(data.tools as Record<string, { installed: boolean }>).some((t) => !t.installed);
        if (missing) {
          setSystemCheckResult(data);
          setShowSystemCheck(true);
          await new Promise<void>((resolve) => {
            _systemCheckResolve = resolve;
          });
        } else {
          _systemChecked = true;
        }
      } catch {
        _systemChecked = true;
      }
    }

    const message = input.trim();
    if (!message) return;
    setInput("");

    addMessage({ type: "user", content: message });
    setExpanded(true);

    // Deploy keyword detection
    const deployKeywords = [
      "deploy",
      "배포하기",
      "배포해줘",
      "배포해",
      "배포할래",
      "배포하고",
    ];
    if (deployKeywords.some((kw) => message.includes(kw))) {
      addMessage({
        type: "system",
        content: "Starting deploy guide.",
        taskId: "deploy-guide",
      });
      return;
    }

    const agentList = Array.from(agents.values());

    // Detect paused pipeline and resume
    const activePipeline = usePipelineStore.getState().activePipeline;
    if (activePipeline && activePipeline.status === "running") {
      const resumePoint = usePipelineStore.getState().getResumePoint();
      if (resumePoint) {
        addMessage({
          type: "system",
          content: t("pipelineInProgress"),
        });
        usePipelineStore.getState().clearPipeline();
      }
    }

    const signal = createSessionAbort();
    let mgrLoadingId: string | null = null;

    try {
      setTyping(true);

      if (phase === "idle" || phase === "refining") {
        setPhase("refining");

        mgrLoadingId = addBubble({
          targetType: "manager",
          text: t("reviewing"),
          variant: "loading",
        });

        const isTestMode = useSettingsStore.getState().testMode;
        const currentMessages = useChatStore.getState().messages;
        const result = isTestMode
          ? mockRefineRequirements(input)
          : await refineRequirements(
              currentMessages,
              agentList.map((t) => ({
                id: t.id,
                name: t.name,
                description: t.description,
                role: t.role,
              })),
              signal,
            );

        removeBubble(mgrLoadingId);

        if (result.type === "question") {
          addMessage({
            type: "ai",
            content: result.content,
            agentName: t("manager"),
          });
          addBubble({
            targetType: "manager",
            text: result.content,
            variant: "result",
          });
          setTyping(false);
          return;
        }

        if (result.type === "fix_error") {
          addMessage({
            type: "ai",
            content: result.content,
            agentName: t("manager"),
          });
          addBubble({
            targetType: "manager",
            text: result.content,
            variant: "result",
          });

          try {
            await handleFixFromChat();
          } catch (err) {
            addMessage({
              type: "system",
              content: t("errorFixFailed", { message: err instanceof Error ? err.message : String(err) }),
            });
          }
          setTyping(false);
          setPhase("idle");
          return;
        }

        if (result.type === "ready_direct") {
          const targetAgent = agents.get(result.target.agentId);
          const targetRole = targetAgent?.role || result.target.agentName;
          addMessage({
            type: "ai",
            content: t("directTaskRequestWithSpec", { name: targetRole, spec: result.spec }),
            agentName: t("manager"),
          });
          addBubble({
            targetType: "manager",
            text: t("directRequestBubble", { name: targetRole }),
            variant: "result",
          });
          setPhase("executing");

          await executeDirectAgent(
            result.spec,
            result.target,
            result.projectType,
            result.framework,
            signal,
          );
          setPhase("idle");
          return;
        }

        if (result.type === "create_agents") {
          const { agentsToCreate, agentsToReuse } = result;
          const agentStore = useAgentStore.getState();
          const officeStore = useOfficeStore.getState();
          const existingAgents = Array.from(agentStore.agents.values());

          // 1) Handle reused agents — add to pipeline directly
          const reusedAgentNames: string[] = [];
          const pipeline: { agentId: string; agentName: string }[] = [];

          if (agentsToReuse && agentsToReuse.length > 0) {
            for (const reuse of agentsToReuse) {
              const existing = agentStore.agents.get(reuse.agentId);
              if (existing) {
                pipeline.push({ agentId: existing.id, agentName: existing.name });
                reusedAgentNames.push(existing.name);
              }
            }
          }

          // 2) Filter out duplicates from agentsToCreate: skip if name+role match existing agent
          const actuallyToCreate = agentsToCreate.filter((def) => {
            const duplicate = existingAgents.find(
              (a) => a.name === def.name && a.role === def.role,
            );
            if (duplicate) {
              // Exact duplicate — reuse existing agent instead
              if (!pipeline.some((p) => p.agentId === duplicate.id)) {
                pipeline.push({ agentId: duplicate.id, agentName: duplicate.name });
                reusedAgentNames.push(duplicate.name);
              }
              return false;
            }
            return true;
          });

          // 3) Resolve name collisions: same name but different role → add numbering
          for (const def of actuallyToCreate) {
            const sameName = existingAgents.filter((a) => a.name === def.name);
            if (sameName.length > 0) {
              // Find next available number
              let num = 2;
              while (existingAgents.some((a) => a.name === `${def.name} ${num}`)) {
                num++;
              }
              def.name = `${def.name} ${num}`;
            }
          }

          if (actuallyToCreate.length === 0 && pipeline.length > 0) {
            // All agents already exist — skip creation, go straight to pipeline
            const names = reusedAgentNames.join(", ");
            addMessage({
              type: "ai",
              content: t("reusingAgents", { names, spec: result.spec }),
              agentName: t("manager"),
            });
            addBubble({
              targetType: "manager",
              text: t("reusingAgentsBubble", { names }),
              variant: "result",
            });

            await waitForAllWalks();

          } else {
            // Try to place new agents at empty chairs first, fall back to open floor
            let positions = findEmptyChairPositions(
              officeStore.layout,
              officeStore.occupiedCells,
              actuallyToCreate.length,
              getFurnitureDef,
            );
            if (positions.length < actuallyToCreate.length) {
              positions = findAvailablePositions(
                officeStore.layout,
                officeStore.occupiedCells,
                actuallyToCreate.length,
              );
            }

            if (positions.length < actuallyToCreate.length) {
              addMessage({
                type: "ai",
                content: t("notEnoughSpace", { needed: actuallyToCreate.length, available: positions.length }),
                agentName: t("manager"),
              });
              addBubble({
                targetType: "manager",
                text: t("notEnoughSpace", { needed: actuallyToCreate.length, available: positions.length }),
                variant: "result",
              });
              setTyping(false);
              setPhase("idle");
              return;
            }

            // Create new agents and place them
            const createdAgentNames: string[] = [];
            const testMode = useSettingsStore.getState().testMode;

            for (let i = 0; i < actuallyToCreate.length; i++) {
              const agentDef = actuallyToCreate[i];
              const pos = positions[i];
              const agentId = crypto.randomUUID();

              agentStore.addAgent({
                id: agentId,
                name: agentDef.name,
                description: agentDef.description,
                role: agentDef.role,
                outputHint: agentDef.outputHint,
                status: "idle",
                position: pos,
              });
              const occ = agentOccKey(pos.x, pos.y);
              officeStore.occupyCell(occ.gx, occ.gy, agentId);

              createdAgentNames.push(agentDef.name);
              pipeline.push({ agentId, agentName: agentDef.name });

              if (testMode && i < actuallyToCreate.length - 1) {
                await new Promise((r) => setTimeout(r, 1500));
              }
            }

            const allNames = [...reusedAgentNames, ...createdAgentNames];
            const newPart = createdAgentNames.length > 0
              ? t("agentsCreatedPart", { names: createdAgentNames.join(", ") })
              : "";
            const reusePart = reusedAgentNames.length > 0
              ? t("agentsReusedPart", { names: reusedAgentNames.join(", ") })
              : "";
            addMessage({
              type: "ai",
              content: t("agentsReady", { newPart, separator: newPart && reusePart ? " " : "", reusePart, spec: result.spec }),
              agentName: t("manager"),
            });
            addBubble({
              targetType: "manager",
              text: t("agentsReadyBubble", { names: allNames.join(", ") }),
              variant: "result",
            });

            await waitForAllWalks();
          }

          // Wait for all walk animations to finish before starting work
          await waitForAllWalks();

          // Provision Supabase before pipeline if DB storage is needed
          if (result.storageType === "database") {
            let supabaseConfig: SupabaseConfig = null;
            const tokens = useSettingsStore.getState().tokens;

            if (!tokens.SUPABASE_ACCESS_TOKEN) {
              // No token — show SupabaseSetupCard and wait for completion
              addMessage({
                type: "system",
                content: "",
                taskId: "supabase-setup",
              });
              setExpanded(true);

              supabaseConfig = await new Promise<SupabaseConfig>((resolve) => {
                _supabaseResolve = resolve;
              });

              if (!supabaseConfig) {
                // Skipped → fall back to localStorage
                result.storageType = "localStorage";
                result.spec +=
                  "\n\n[Data Storage] Use localStorage to store data.";
              }
            } else {
              // Token present — create Supabase project immediately
              addMessage({
                type: "system",
                content: "Preparing database...",
              });
              try {
                const sessionForDb = useSessionStore.getState().activeSession();
                const res = await fetch("/api/deploy/supabase", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    projectName: sessionForDb?.projectName || "project",
                  }),
                });
                const data = await res.json();
                if (res.ok && data.success) {
                  supabaseConfig = {
                    supabaseUrl: data.projectUrl,
                    anonKey: data.anonKey,
                    serviceRoleKey: data.serviceRoleKey,
                    projectId: data.projectId,
                  };
                } else {
                  // Fallback to SupabaseSetupCard on failure
                  addMessage({
                    type: "system",
                    content: "",
                    taskId: "supabase-setup",
                  });
                  setExpanded(true);
                  supabaseConfig = await new Promise<SupabaseConfig>(
                    (resolve) => {
                      _supabaseResolve = resolve;
                    },
                  );
                }
              } catch {
                addMessage({
                  type: "system",
                  content: "",
                  taskId: "supabase-setup",
                });
                setExpanded(true);
                supabaseConfig = await new Promise<SupabaseConfig>(
                  (resolve) => {
                    _supabaseResolve = resolve;
                  },
                );
              }
            }

            if (supabaseConfig) {
              _pendingSupabase = {
                projectId: supabaseConfig.projectId,
                projectUrl: supabaseConfig.supabaseUrl,
                anonKey: supabaseConfig.anonKey,
                serviceRoleKey: supabaseConfig.serviceRoleKey,
              };
              // Persist to session
              const activeId = useSessionStore.getState().activeSessionId;
              if (activeId) {
                useSessionStore
                  .getState()
                  .updateSessionStorageType(activeId, "database");
                useSessionStore
                  .getState()
                  .updateSessionSupabaseProjectId(
                    activeId,
                    supabaseConfig.projectId,
                  );
              }
              addMessage({
                type: "system",
                content: t("supabaseCreated", { url: supabaseConfig.supabaseUrl }),
              });
              result.spec += `\n\n[Supabase Setup]\nSupabase URL: ${supabaseConfig.supabaseUrl}\nSupabase Anon Key: ${supabaseConfig.anonKey}\nAfter running create-next-app, manually create an .env.local file:\nNEXT_PUBLIC_SUPABASE_URL=${supabaseConfig.supabaseUrl}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${supabaseConfig.anonKey}\n(SUPABASE_SERVICE_ROLE_KEY is injected automatically by the system. Reference it only by env var name in code.)\nUse the @supabase/supabase-js package to connect to the database.\nYou MUST create a "schema.sql" file at the project root (containing CREATE TABLE DDL statements). This file will be automatically executed against Supabase after the pipeline completes.`;
            }
          }

          // Save storageType to session
          if (result.storageType) {
            const sid = useSessionStore.getState().activeSessionId;
            if (sid)
              useSessionStore
                .getState()
                .updateSessionStorageType(
                  sid,
                  result.storageType as Session["storageType"],
                );
          }

          setPhase("executing");

          await executePipeline(
            result.spec,
            pipeline,
            result.projectType,
            result.framework,
            signal,
            result.storageType,
          );
          setPhase("idle");
          return;
        }

        addMessage({
          type: "ai",
          content: t("specReady", { spec: result.spec }),
          agentName: t("manager"),
        });
        addBubble({
          targetType: "manager",
          text: t("specReady", { spec: result.spec }),
          variant: "result",
        });

        // Provision Supabase before pipeline if DB storage is needed
        if (result.storageType === "database") {
          let supabaseConfig: SupabaseConfig = null;
          const tokens = useSettingsStore.getState().tokens;

          if (!tokens.SUPABASE_ACCESS_TOKEN) {
            addMessage({
              type: "system",
              content: "",
              taskId: "supabase-setup",
            });
            setExpanded(true);

            supabaseConfig = await new Promise<SupabaseConfig>((resolve) => {
              _supabaseResolve = resolve;
            });

            if (!supabaseConfig) {
              result.storageType = "localStorage";
              result.spec +=
                "\n\n[Data Storage] Use localStorage to store data.";
            }
          } else {
            addMessage({
              type: "system",
              content: "Preparing database...",
            });
            try {
              const sessionForDb = useSessionStore.getState().activeSession();
              const res = await fetch("/api/deploy/supabase", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  projectName: sessionForDb?.projectName || "project",
                }),
              });
              const data = await res.json();
              if (res.ok && data.success) {
                supabaseConfig = {
                  supabaseUrl: data.projectUrl,
                  anonKey: data.anonKey,
                  serviceRoleKey: data.serviceRoleKey,
                  projectId: data.projectId,
                };
              } else {
                addMessage({
                  type: "system",
                  content: "",
                  taskId: "supabase-setup",
                });
                setExpanded(true);
                supabaseConfig = await new Promise<SupabaseConfig>(
                  (resolve) => {
                    _supabaseResolve = resolve;
                  },
                );
              }
            } catch {
              addMessage({
                type: "system",
                content: "",
                taskId: "supabase-setup",
              });
              setExpanded(true);
              supabaseConfig = await new Promise<SupabaseConfig>((resolve) => {
                _supabaseResolve = resolve;
              });
            }
          }

          if (supabaseConfig) {
            _pendingSupabase = {
              projectId: supabaseConfig.projectId,
              projectUrl: supabaseConfig.supabaseUrl,
              anonKey: supabaseConfig.anonKey,
              serviceRoleKey: supabaseConfig.serviceRoleKey,
            };
            const activeId = useSessionStore.getState().activeSessionId;
            if (activeId) {
              useSessionStore
                .getState()
                .updateSessionStorageType(activeId, "database");
              useSessionStore
                .getState()
                .updateSessionSupabaseProjectId(
                  activeId,
                  supabaseConfig.projectId,
                );
            }
            addMessage({
              type: "system",
              content: t("supabaseCreated", { url: supabaseConfig.supabaseUrl }),
            });
            result.spec += `\n\n[Supabase Setup]\nSupabase URL: ${supabaseConfig.supabaseUrl}\nSupabase Anon Key: ${supabaseConfig.anonKey}\nAfter running create-next-app, manually create an .env.local file:\nNEXT_PUBLIC_SUPABASE_URL=${supabaseConfig.supabaseUrl}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${supabaseConfig.anonKey}\n(SUPABASE_SERVICE_ROLE_KEY is injected automatically by the system. Reference it only by env var name in code.)\nUse the @supabase/supabase-js package to connect to the database.\nYou MUST create a "schema.sql" file at the project root (containing CREATE TABLE DDL statements). This file will be automatically executed against Supabase after the pipeline completes.`;
          }
        }

        // Save storageType to session
        if (result.storageType) {
          const sid = useSessionStore.getState().activeSessionId;
          if (sid)
            useSessionStore
              .getState()
              .updateSessionStorageType(
                sid,
                result.storageType as Session["storageType"],
              );
        }

        setPhase("executing");

        await executePipeline(
          result.spec,
          result.pipeline,
          result.projectType,
          result.framework,
          signal,
          result.storageType,
        );
        setPhase("idle");
      }
    } catch (error) {
      // Silently handle abort caused by session switch/delete
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      if (mgrLoadingId) {
        removeBubble(mgrLoadingId);
      }
      // Reset any stuck "working" agents back to idle
      for (const agent of agents.values()) {
        if (agent.status === "working") {
          setAgentStatus(agent.id, "idle");
        }
      }
      addMessage({
        type: "system",
        content: t("generalError", { message: error instanceof Error ? error.message : t("unknownError") }),
      });
      setPhase("idle");
    } finally {
      setTyping(false);
    }
  }, [
    input,
    isApiKeyValid,
    agents,
    messages,
    phase,
    addMessage,
    setExpanded,
    setTyping,
    setPhase,
    executePipeline,
    executeDirectAgent,
    handleFixFromChat,
  ]);

  const startDeploy = useCallback(
    async (choice?: { needsDb: boolean; needsGithub: boolean }) => {
      const deployChoice = choice || _lastDeployChoice;
      if (!deployChoice) {
        addMessage({
          type: "system",
          content:
            "Deploy settings have been reset. Please type 'deploy' again.",
        });
        return;
      }
      _lastDeployChoice = deployChoice;

      const wd = useProjectStore.getState().workingDirectory;
      const session = useSessionStore.getState().activeSession();
      if (!wd) {
        addMessage({
          type: "system",
          content: "Project folder not set.",
        });
        return;
      }

      trackEvent("deploy_started", {
        needsDb: deployChoice.needsDb,
        needsGithub: deployChoice.needsGithub,
      });

      setPhase("executing");
      setTyping(true);

      try {
        // If previous deploy error exists, attempt AI code fix
        if (_lastDeployError) {
          addMessage({
            type: "system",
            content: "Analyzing previous deploy error and fixing code...",
          });

          const fileRes = await fetch("/api/fs/read-project", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dirPath: wd }),
          });
          if (!fileRes.ok) {
            addMessage({
              type: "system",
              content: "Could not read project files. Redeploying as-is.",
            });
            _lastDeployError = null;
          } else {
            const { files: diskFiles } = await fileRes.json();
            const artifacts = (diskFiles || []).map(
              (f: { title: string; language: string; content: string }) => ({
                id: crypto.randomUUID(),
                type: "code" as const,
                title: f.title,
                language: f.language,
                content: f.content,
              }),
            );

            if (artifacts.length > 0) {
              const fixResult = await fixErrorWithAI(
                _lastDeployError,
                artifacts,
              );
              if (fixResult.artifacts.length > 0) {
                await saveArtifactsToDisk(fixResult.artifacts, wd);
                addMessage({
                  type: "ai",
                  content: t("deployFixResult", { summary: fixResult.summary }),
                  artifacts: fixResult.artifacts,
                });
              } else {
                addMessage({
                  type: "system",
                  content: "No fixes found. Retrying as-is.",
                });
              }
            }
            _lastDeployError = null;
          }
        }

        // Handle GitHub
        let githubRepo: string | undefined = session?.githubRepo;
        if (deployChoice.needsGithub && !githubRepo) {
          // First deploy: create repo
          addMessage({
            type: "system",
            content: "Creating GitHub repo...",
          });
          try {
            const ghRes = await fetch("/api/deploy/github", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                repoName: session?.projectName || "teammaker-project",
              }),
            });
            const ghData = await ghRes.json();
            if (ghRes.ok && ghData.success) {
              githubRepo = `${ghData.username}/${ghData.repoName}`;
              // Save to session
              const activeId = useSessionStore.getState().activeSessionId;
              if (activeId) {
                useSessionStore
                  .getState()
                  .updateSessionGithubRepo(activeId, githubRepo);
              }
              addMessage({
                type: "system",
                content: t("githubRepoCreated", { url: ghData.githubUrl }),
              });
            } else {
              addMessage({
                type: "system",
                content: t("githubRepoFailed", { error: ghData.error }),
              });
            }
          } catch (err) {
            addMessage({
              type: "system",
              content: t("githubConnectError", { message: err instanceof Error ? err.message : t("unknownError") }),
            });
          }
        } else if (githubRepo) {
          // Redeploy: githubRepo already in session
          addMessage({
            type: "system",
            content: t("githubExistingRepo", { repo: githubRepo }),
          });
        }

        addMessage({ type: "system", content: "Starting deployment..." });

        const res = await fetch("/api/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectDir: wd,
            needsDb: deployChoice.needsDb,
            needsGithub: deployChoice.needsGithub,
            projectName: session?.projectName || "teammaker-project",
            githubRepo,
          }),
        });

        const result = await res.json();

        for (const step of result.steps) {
          addMessage({
            type: "system",
            content: `${step.status === "success" ? "\u2705" : "\u274C"} ${step.step}: ${step.detail}`,
          });
        }

        if (result.success && result.deployUrl) {
          _lastDeployChoice = null;
          _lastDeployError = null;
          addMessage({
            type: "system",
            content: t("deploySuccess", { url: result.deployUrl }),
            taskId: "deploy-complete",
          });
        } else if (!result.success) {
          const errors = result.steps
            .filter((s: { status: string }) => s.status === "error")
            .map(
              (s: { step: string; detail: string }) =>
                `[${s.step}] ${s.detail}`,
            )
            .join("\n");
          _lastDeployError = errors;
          addMessage({
            type: "system",
            content:
              "Deployment error occurred. Click 'Retry' to analyze, fix, and redeploy.",
            taskId: "deploy-failed",
          });
        }
      } catch (err) {
        _lastDeployError =
          err instanceof Error ? err.message : "Unknown error";
        addMessage({
          type: "system",
          content: t("deployFailed", { message: err instanceof Error ? err.message : t("unknownError") }),
          taskId: "deploy-failed",
        });
      } finally {
        setPhase("idle");
        setTyping(false);
      }
    },
    [addMessage, setPhase, setTyping],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const resolveSupabaseSetup = useCallback((config: SupabaseConfig) => {
    _supabaseResolve?.(config);
    _supabaseResolve = null;
  }, []);

  return {
    input,
    setInput,
    handleSend,
    handleKeyDown,
    phase,
    resumePipeline,
    startDeploy,
    resolveSupabaseSetup,
    showSystemCheck,
    systemCheckResult,
    onSystemCheckResolved,
  };
}
