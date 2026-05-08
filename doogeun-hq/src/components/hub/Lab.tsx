"use client";

import { useEffect, useState } from "react";
import { apiBase } from "@/lib/utils";
import { LogsPane } from "@/components/DebugPanel";
import BugsBody from "@/components/hub/Bugs";

interface ServerStat { cpu?: number; mem?: number; disk?: number; processes?: number }

export function ServerBody() {
  const [status, setStatus] = useState<ServerStat>({});
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const r = await fetch(`${apiBase()}/api/dashboard`);
        const d = await r.json();
        if (!stop) setStatus(d || {});
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { stop = true; clearInterval(id); };
  }, []);
  return (
    <div className="p-5 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="CPU" value={status.cpu != null ? `${status.cpu}%` : "-"} />
        <Stat label="MEM" value={status.mem != null ? `${status.mem}%` : "-"} />
        <Stat label="DISK" value={status.disk != null ? `${status.disk}%` : "-"} />
        <Stat label="PROC" value={status.processes != null ? `${status.processes}` : "-"} />
      </div>
      <pre className="p-2 rounded bg-black/40 border border-gray-800 text-[11px] text-gray-400 font-mono overflow-x-auto">
{JSON.stringify(status, null, 2)}
      </pre>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg border border-gray-800/60 bg-gray-900/40">
      <div className="text-[10px] text-gray-500 uppercase font-bold">{label}</div>
      <div className="text-lg font-bold text-gray-200">{value}</div>
    </div>
  );
}

interface LabBodyProps {
  onPopoutDebug: () => void;
  onPopoutTerminal: () => void;
}

export default function LabBody({ onPopoutDebug, onPopoutTerminal }: LabBodyProps) {
  const [tab, setTab] = useState<"bugs" | "debug" | "terminal">("bugs");
  void onPopoutDebug; // 디버그는 인라인 LogsPane
  return (
    <div className="flex flex-col" style={{ height: "70vh" }}>
      <div className="shrink-0 flex gap-1 p-1 bg-gray-900/60 dark:bg-gray-900/60 rounded-md border border-gray-700 mb-2">
        <button
          onClick={() => setTab("bugs")}
          className={`flex-1 py-2 text-[13px] rounded font-bold transition-colors ${
            tab === "bugs"
              ? "bg-sky-600 text-white shadow"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >🐛 버그·티켓</button>
        <button
          onClick={() => setTab("debug")}
          className={`flex-1 py-2 text-[13px] rounded font-bold transition-colors ${
            tab === "debug"
              ? "bg-sky-600 text-white shadow"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >🔧 디버그</button>
        <button
          onClick={() => setTab("terminal")}
          className={`flex-1 py-2 text-[13px] rounded font-bold transition-colors ${
            tab === "terminal"
              ? "bg-sky-600 text-white shadow"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >💻 터미널</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto rounded-md border border-gray-700 bg-gray-950/50">
        {tab === "bugs" && <BugsBody />}
        {tab === "debug" && (
          <div className="h-full">
            <LogsPane />
          </div>
        )}
        {tab === "terminal" && (
          <div className="h-full flex flex-col items-center justify-center gap-4 p-6">
            <div className="text-3xl">💻</div>
            <div className="text-[15px] font-bold text-gray-100">터미널</div>
            <div className="text-[12px] text-gray-400 text-center max-w-md leading-relaxed">
              명령 실행 + 출력 스트리밍 + AI 자동 수정 요청.<br />화면 가독성 위해 별도 창에서 띄워집니다.
            </div>
            <button
              onClick={onPopoutTerminal}
              className="px-6 py-3 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[14px] font-bold transition-colors shadow-md"
            >
              터미널 열기
            </button>
            <div className="text-[10px] text-gray-500">닫으면 연구소로 돌아옴</div>
          </div>
        )}
      </div>
    </div>
  );
}
