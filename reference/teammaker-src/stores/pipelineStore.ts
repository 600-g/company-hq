import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  PipelineState,
  AgentStep,
  StepStatus,
} from "@/types/pipeline";
import type { Artifact } from "@/types/artifact";

interface HandoffReview {
  fromAgentName: string;
  toAgentName: string;
}

interface HandoffReviewResult {
  feedback?: string;
}

interface PipelineStore {
  activePipeline: PipelineState | null;
  pendingHandoffReview: HandoffReview | null;
  /** @internal resolve function for the current handoff review promise */
  _handoffResolve: ((result: HandoffReviewResult) => void) | null;

  createPipeline(
    sessionId: string,
    spec: string,
    pipeline: { agentId: string; agentName: string }[],
    projectType?: string,
    framework?: string,
    storageType?: string,
  ): PipelineState;

  setSupabaseInfo(info: { projectId: string; projectUrl: string; anonKey: string; serviceRoleKey: string }): void;

  updateAgentStep(
    agentIndex: number,
    status: StepStatus,
    result?: { summary: string; artifacts: Artifact[] },
    error?: string,
  ): void;

  incrementRetry(agentIndex: number): void;

  getResumePoint(): { agentIndex: number } | null;

  /** Pause the pipeline and wait for user approval before handing off to next agent */
  requestHandoffReview(
    fromAgentName: string,
    toAgentName: string,
  ): Promise<HandoffReviewResult>;

  /** Called by UI when user approves the handoff (optionally with feedback) */
  approveHandoff(feedback?: string): void;

  clearPipeline(): void;
}

export const usePipelineStore = create<PipelineStore>()(
  persist(
    (set, get) => ({
      activePipeline: null,
      pendingHandoffReview: null,
      _handoffResolve: null,

      requestHandoffReview(fromAgentName, toAgentName) {
        return new Promise<HandoffReviewResult>((resolve) => {
          set({
            pendingHandoffReview: { fromAgentName, toAgentName },
            _handoffResolve: resolve,
          });
        });
      },

      approveHandoff(feedback) {
        const { _handoffResolve } = get();
        _handoffResolve?.({ feedback });
        set({ pendingHandoffReview: null, _handoffResolve: null });
      },

      createPipeline(sessionId, spec, pipeline, projectType, framework, storageType) {
        const steps: AgentStep[] = pipeline.map((p) => ({
          agentId: p.agentId,
          agentName: p.agentName,
          status: "pending" as const,
          retryCount: 0,
        }));

        const state: PipelineState = {
          id: crypto.randomUUID(),
          sessionId,
          spec,
          projectType,
          framework,
          storageType: storageType as PipelineState["storageType"],
          steps,
          status: "running",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        set({ activePipeline: state });
        return state;
      },

      setSupabaseInfo(info) {
        const pipeline = get().activePipeline;
        if (!pipeline) return;
        set({ activePipeline: { ...pipeline, supabase: info } });
      },

      updateAgentStep(agentIndex, status, result, error) {
        const pipeline = get().activePipeline;
        if (!pipeline) return;

        const steps = [...pipeline.steps];
        const step = { ...steps[agentIndex] };

        step.status = status;
        if (status === "running") step.startedAt = Date.now();
        if (status === "completed" || status === "failed")
          step.completedAt = Date.now();
        if (result) step.result = result;
        if (error) step.error = error;

        steps[agentIndex] = step;

        // Update pipeline status
        const allCompleted = steps.every((s) => s.status === "completed");
        const anyFailed = steps.some((s) => s.status === "failed");
        const pipelineStatus: StepStatus = allCompleted
          ? "completed"
          : anyFailed
            ? "failed"
            : "running";

        set({
          activePipeline: {
            ...pipeline,
            steps,
            status: pipelineStatus,
            updatedAt: Date.now(),
          },
        });
      },

      incrementRetry(agentIndex) {
        const pipeline = get().activePipeline;
        if (!pipeline) return;

        const steps = [...pipeline.steps];
        steps[agentIndex] = {
          ...steps[agentIndex],
          retryCount: steps[agentIndex].retryCount + 1,
          status: "pending",
          error: undefined,
        };

        set({
          activePipeline: { ...pipeline, steps, updatedAt: Date.now() },
        });
      },

      getResumePoint() {
        const pipeline = get().activePipeline;
        if (!pipeline || pipeline.status === "completed") return null;

        for (let ti = 0; ti < pipeline.steps.length; ti++) {
          const step = pipeline.steps[ti];
          if (
            step.status === "pending" ||
            step.status === "running" ||
            step.status === "failed"
          ) {
            return { agentIndex: ti };
          }
        }
        return null;
      },

      clearPipeline() {
        set({
          activePipeline: null,
          pendingHandoffReview: null,
          _handoffResolve: null,
        });
      },
    }),
    {
      name: "teammaker-pipeline",
      partialize: (state) => ({
        activePipeline: state.activePipeline,
      }),
    },
  ),
);
