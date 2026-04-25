"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Rocket, Check, Circle, AlertTriangle, ExternalLink, RefreshCw, Wrench } from "lucide-react";
import { apiBase } from "@/lib/utils";

type StepKey = "verify" | "commit" | "push" | "deploy" | "done";

interface Props {
  teamId: string;
  repo?: string;
  onFixRequest?: (errorText: string, stepKey: string) => void;
}

interface Step { key: StepKey; label: string; status: "idle" | "running" | "done" | "error"; detail?: string }

/** 5단계 배포 — 서버 SSE 호출 + 진행 스테퍼 */
export default function DeployGuideCard({ teamId, repo, onFixRequest }: Props) {
  const [steps, setSteps] = useState<Step[]>([
    { key: "verify", label: "프로젝트 검증", status: "idle" },
    { key: "commit", label: "커밋", status: "idle" },
    { key: "push", label: "GitHub 푸시", status: "idle" },
    { key: "deploy", label: "배포", status: "idle" },
    { key: "done", label: "완료", status: "idle" },
  ]);
  const [running, setRunning] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const updateStep = (key: StepKey, patch: Partial<Step>) =>
    setSteps((p) => p.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const run = async () => {
    if (running) return;
    setRunning(true);
    setRemoteUrl(null);
    setSteps((p) => p.map((s) => ({ ...s, status: "idle" as const })));

    try {
      updateStep("verify", { status: "running" });
      const res = await fetch(`${apiBase()}/api/deploy/project/${teamId}/github`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message || undefined }),
      });
      if (!res.ok || !res.body) throw new Error("HTTP " + res.status);
      updateStep("verify", { status: "done" });

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            const phase = d.phase as string;
            if (phase === "staged" || phase === "committed") updateStep("commit", { status: "done", detail: d.message });
            if (phase === "creating_repo") updateStep("push", { status: "running", detail: "레포 생성 중..." });
            if (phase === "repo_created") setRemoteUrl(d.url);
            if (phase === "pushing") updateStep("push", { status: "running", detail: `브랜치: ${d.branch || "main"}` });
            if (phase === "pushed") { updateStep("push", { status: "done" }); updateStep("deploy", { status: "running" }); }
            if (phase === "done") {
              setRemoteUrl((r) => r || d.remote);
              updateStep("deploy", { status: "done" });
              updateStep("done", { status: "done" });
            }
            if (phase === "error") {
              const key = ((d.step as string) || "verify") as StepKey;
              updateStep(key, { status: "error", detail: d.message });
            }
          } catch {}
        }
      }
    } catch (e) {
      updateStep("verify", { status: "error", detail: e instanceof Error ? e.message : "error" });
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => { void repo; }, [repo]);

  const errorStep = useMemo(() => steps.find((s) => s.status === "error"), [steps]);

  return (
    <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Rocket className="w-4 h-4 text-sky-300" />
        <span className="text-[12px] font-bold text-sky-200">GitHub 배포</span>
        {repo && <Badge variant="default">{repo}</Badge>}
      </div>

      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="커밋 메시지 (비우면 기본)"
        className="w-full h-8 rounded-md border border-gray-700 bg-gray-900/60 px-2 text-[12px] text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
      />

      {/* 스테퍼 */}
      <div className="space-y-1">
        {steps.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-[11px]">
            {s.status === "done" ? <Check className="w-3.5 h-3.5 text-green-400" />
              : s.status === "running" ? <RefreshCw className="w-3.5 h-3.5 text-sky-300 animate-spin" />
              : s.status === "error" ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              : <Circle className="w-3.5 h-3.5 text-gray-600" />}
            <span className={s.status === "done" ? "text-gray-300" : s.status === "error" ? "text-red-300" : "text-gray-400"}>
              {s.label}
            </span>
            {s.detail && <span className="text-gray-600 font-mono truncate">— {s.detail}</span>}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        {remoteUrl && (
          <a href={remoteUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-300 hover:underline flex items-center gap-1 truncate">
            <ExternalLink className="w-3 h-3" />
            {remoteUrl}
          </a>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {errorStep && onFixRequest && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onFixRequest(`[${errorStep.label}] ${errorStep.detail || "배포 실패"}`, errorStep.key)}
              className="border-amber-400/50 text-amber-200 hover:bg-amber-500/10"
            >
              <Wrench className="w-3.5 h-3.5 mr-1" />
              AI로 수정 요청
            </Button>
          )}
          <Button size="sm" onClick={run} disabled={running}>
            <Rocket className="w-3.5 h-3.5 mr-1" />
            {running ? "배포 중..." : errorStep ? "재시도" : "시작"}
          </Button>
        </div>
      </div>
    </div>
  );
}
