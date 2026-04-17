"use client";

import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Check, Loader2, Rocket, ExternalLink, X, GitBranch } from "lucide-react";

interface DeployStatus {
  git?: { branch: string; head: string; last_msg: string; dirty: number };
  build?: { build?: string; version?: string };
}

type Phase = "idle" | "starting" | "building" | "uploading" | "deploying" | "done" | "error";

interface Props {
  apiBase: string;
}

export default function DeployGuideCard({ apiBase }: Props) {
  const [status, setStatus] = useState<DeployStatus>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [deployUrl, setDeployUrl] = useState<string>("");

  const loadStatus = async () => {
    try {
      const r = await fetch(`${apiBase}/api/deploy/status`);
      const d = await r.json();
      if (d.ok) setStatus({ git: d.git, build: d.build });
    } catch {}
  };
  useEffect(() => { loadStatus(); }, []); // eslint-disable-line

  const trigger = async () => {
    setRunning(true); setLines([]); setPhase("starting"); setDeployUrl("");
    try {
      const r = await fetch(`${apiBase}/api/deploy/trigger`, { method: "POST" });
      const reader = r.body?.getReader();
      if (!reader) throw new Error("stream reader 없음");
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const p of parts) {
          if (!p.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(p.slice(6));
            if (ev.phase) setPhase(ev.phase);
            if (ev.line) {
              setLines((prev) => [...prev.slice(-50), ev.line]);
              const m = (ev.line as string).match(/https:\/\/[a-z0-9-]+\.company-hq\.pages\.dev/);
              if (m) setDeployUrl(m[0]);
            }
            if (ev.phase === "finished" && ev.exit_code === 0) {
              window.dispatchEvent(new CustomEvent("hq:toast", { detail: { text: "✅ 배포 완료", variant: "success" } }));
            } else if (ev.phase === "finished" && ev.exit_code !== 0) {
              window.dispatchEvent(new CustomEvent("hq:toast", { detail: { text: `❌ 배포 실패 (exit ${ev.exit_code})`, variant: "error" } }));
            }
          } catch {}
        }
      }
    } catch {
      setPhase("error");
    } finally {
      setRunning(false);
      loadStatus();
    }
  };

  const steps: Array<{ key: Phase; label: string }> = [
    { key: "starting", label: "준비" },
    { key: "building", label: "빌드" },
    { key: "uploading", label: "업로드" },
    { key: "deploying", label: "배포" },
    { key: "done", label: "완료" },
  ];
  const activeIdx = steps.findIndex((s) => s.key === phase);

  return (
    <div className="mt-2 rounded-lg border border-[#2a2a4a] bg-[#1a1a2e] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Rocket className="h-4 w-4 text-yellow-400" />
        <div className="text-xs font-bold text-gray-200 flex-1">배포</div>
        {status.build?.version && <Badge variant="secondary">v{status.build.version}</Badge>}
      </div>

      {status.git && (
        <div className="flex items-center gap-2 text-[12px] text-gray-400">
          <GitBranch className="h-3 w-3" />
          <span className="font-mono">{status.git.branch}</span>
          <span className="font-mono text-gray-600">·</span>
          <span className="font-mono">{status.git.head}</span>
          {status.git.dirty > 0 && (
            <Badge variant="destructive">uncommitted {status.git.dirty}</Badge>
          )}
          <span className="truncate text-gray-500 flex-1">{status.git.last_msg}</span>
        </div>
      )}

      {/* Progress steps */}
      {phase !== "idle" && (
        <div className="flex items-center gap-0.5 mt-1.5">
          {steps.map((s, i) => {
            const reached = i <= activeIdx;
            const cur = i === activeIdx;
            return (
              <div key={s.key} className="flex items-center gap-0.5 flex-1">
                <div className={`flex flex-col items-center flex-1 ${cur ? "text-yellow-300" : reached ? "text-green-400" : "text-gray-600"}`}>
                  {cur && running ? <Loader2 className="h-3 w-3 animate-spin" /> : reached ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-30" />}
                  <span className="text-[13px] font-bold">{s.label}</span>
                </div>
                {i < steps.length - 1 && <div className={`h-[1px] flex-1 ${reached && i < activeIdx ? "bg-green-500/50" : "bg-[#2a2a4a]"}`} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Log tail */}
      {lines.length > 0 && (
        <pre className="max-h-24 overflow-y-auto text-[13px] font-mono text-gray-400 bg-[#0a0a1a] rounded p-1.5 whitespace-pre-wrap">
          {lines.slice(-8).join("\n")}
        </pre>
      )}

      {deployUrl && (
        <a href={deployUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[12px] text-blue-400 hover:underline">
          <ExternalLink className="h-3 w-3" />배포 URL: {deployUrl}
        </a>
      )}

      <div className="flex gap-1.5 pt-1">
        <Button size="sm" className="flex-1" onClick={trigger} disabled={running}>
          {running ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />배포 중</> : <><Rocket className="h-3 w-3 mr-1" />배포 트리거</>}
        </Button>
        <Button size="sm" variant="outline" onClick={loadStatus} disabled={running}>새로고침</Button>
      </div>
    </div>
  );
}
