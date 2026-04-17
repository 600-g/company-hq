"use client";

type DispatchStatus = "pending" | "sending" | "working" | "done" | "skipped" | "error";

interface DispatchEntry {
  teamId: string;
  emoji: string;
  name: string;
  text: string;
  status: DispatchStatus;
  routed: boolean;
  tools: string[];
}

interface Props {
  entries: DispatchEntry[];
  phase: string;
}

const STATUS_STYLE: Record<DispatchStatus, { bg: string; border: string; label: string; pulse: boolean }> = {
  pending:  { bg: "bg-gray-800/60",   border: "border-gray-600",     label: "대기",  pulse: false },
  sending:  { bg: "bg-amber-500/20",  border: "border-amber-400",    label: "전송",  pulse: true  },
  working:  { bg: "bg-amber-500/20",  border: "border-amber-400",    label: "작업",  pulse: true  },
  done:     { bg: "bg-green-500/20",  border: "border-green-400",    label: "완료",  pulse: false },
  skipped:  { bg: "bg-gray-900/30",   border: "border-gray-700",     label: "스킵",  pulse: false },
  error:    { bg: "bg-red-500/20",    border: "border-red-400",      label: "오류",  pulse: false },
};

export default function PipelineDAG({ entries, phase }: Props) {
  const routed = entries.filter(e => e.routed);
  if (routed.length === 0) return null;

  const doneCount = routed.filter(e => e.status === "done").length;
  const workingCount = routed.filter(e => e.status === "working" || e.status === "sending").length;
  const errorCount = routed.filter(e => e.status === "error").length;
  const totalCount = routed.length;

  // Manager(CPO) 상태: routing/executing = working, summarizing/done = done
  const managerStatus: DispatchStatus =
    phase === "routing" || phase === "analyzing" || phase === "opinions_start" ? "working"
    : phase === "executing" || phase === "synthesizing" ? (workingCount > 0 ? "working" : "done")
    : phase === "summarizing" || phase === "qa_review" ? "working"
    : phase === "done" || phase === "final_decision" ? "done"
    : "pending";

  return (
    <div className="px-3 py-2 mb-2 bg-[#0f0f1f]/80 border border-[#2a2a5a]/60 rounded-lg">
      <div className="flex items-center gap-1 mb-1.5 text-[10px] text-gray-500 font-mono">
        <span>⚙️ 작업 흐름</span>
        <span className="opacity-40">·</span>
        <span className="text-green-400">{doneCount}</span>
        <span className="opacity-40">/</span>
        <span>{totalCount}</span>
        {workingCount > 0 && <>
          <span className="opacity-40">·</span>
          <span className="text-amber-400 animate-pulse">작업 {workingCount}</span>
        </>}
        {errorCount > 0 && <>
          <span className="opacity-40">·</span>
          <span className="text-red-400">오류 {errorCount}</span>
        </>}
      </div>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        <PipelineNode emoji="🧠" name="CPO" status={managerStatus} role="manager" />
        <Arrow count={routed.length} />
        <div className="flex gap-1 flex-wrap">
          {routed.map(e => (
            <PipelineNode key={e.teamId} emoji={e.emoji} name={e.name} status={e.status} role="worker" />
          ))}
        </div>
      </div>
    </div>
  );
}

function PipelineNode({ emoji, name, status, role }: {
  emoji: string; name: string; status: DispatchStatus; role: "manager" | "worker";
}) {
  const s = STATUS_STYLE[status];
  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] transition-all ${s.bg} ${s.border} ${s.pulse ? "animate-pulse" : ""}`}
      title={`${name} · ${s.label}`}
    >
      <span className="text-[13px] leading-none">{emoji}</span>
      <span className={role === "manager" ? "text-yellow-200 font-bold" : "text-gray-200"}>
        {name.length > 6 ? name.slice(0, 6) + "…" : name}
      </span>
      {status === "working" && <span className="text-amber-400">●</span>}
      {status === "done" && <span className="text-green-400">✓</span>}
      {status === "error" && <span className="text-red-400">✕</span>}
    </div>
  );
}

function Arrow({ count }: { count: number }) {
  return (
    <div className="flex flex-col items-center text-gray-600 text-[10px] font-mono select-none mx-1">
      <span>→</span>
      {count > 1 && <span className="opacity-60">×{count}</span>}
    </div>
  );
}
