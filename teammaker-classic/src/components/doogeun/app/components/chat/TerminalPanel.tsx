"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Play, Square, Trash2, Terminal as TerminalIcon, X, Wrench } from "lucide-react";

interface TerminalProps {
  open: boolean;
  onClose: () => void;
  apiBase: string;
  initialCommand?: string;
  initialCwd?: string;
}

interface Line { stream: "exec" | "stdout" | "stderr"; text: string; ts: number }

export default function TerminalPanel({ open, onClose, apiBase, initialCommand, initialCwd }: TerminalProps) {
  const [cmd, setCmd] = useState(initialCommand ?? "");
  const [cwd, setCwd] = useState(initialCwd ?? "~/Developer/my-company/company-hq");
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const [lastExit, setLastExit] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && initialCommand) setCmd(initialCommand);
  }, [open, initialCommand]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const fixWithAI = async () => {
    const tail = lines.slice(-40).map(l => l.text).join("\n");
    const prompt = `다음 터미널 명령이 실패했어. 원인 분석하고 수정 명령 제시해줘.\n\n명령: ${cmd}\n작업 디렉토리: ${cwd}\n종료 코드: ${lastExit}\n\n출력 tail:\n${tail}`;
    try {
      await fetch(`${apiBase}/api/chat/cpo-claude/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      window.dispatchEvent(new CustomEvent("hq:toast", { detail: { text: "🔧 CPO에게 수정 요청 전송됨", variant: "info" } }));
    } catch {
      window.dispatchEvent(new CustomEvent("hq:toast", { detail: { text: "❌ 요청 전송 실패", variant: "error" } }));
    }
  };

  const run = async () => {
    if (!cmd.trim() || running) return;
    setRunning(true);
    setLastExit(null);
    setLines((prev) => [...prev, { stream: "exec", text: `$ ${cmd}`, ts: Date.now() }]);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const r = await fetch(`${apiBase}/api/terminal/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, cwd }),
        signal: abort.signal,
      });
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
            if (ev.stream === "exit") {
              setLines((prev) => [...prev, { stream: "stderr", text: `[exit ${ev.code}]`, ts: Date.now() }]);
              setLastExit(ev.code);
            } else if (ev.text) {
              setLines((prev) => [...prev.slice(-300), { stream: ev.stream, text: ev.text, ts: Date.now() }]);
            }
          } catch {}
        }
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        setLines((prev) => [...prev, { stream: "stderr", text: `[err] ${(e as Error).message}`, ts: Date.now() }]);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const stop = () => { abortRef.current?.abort(); };
  const clear = () => setLines([]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[170] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0a0a1a] border border-[#3a3a5a] rounded-lg w-full max-w-3xl h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2a2a4a]">
          <TerminalIcon className="h-4 w-4 text-green-400" />
          <div className="text-sm font-bold text-gray-200 flex-1">터미널</div>
          <button onClick={clear} className="text-gray-400 hover:text-white p-1" title="비우기"><Trash2 className="h-3.5 w-3.5" /></button>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[#2a2a4a] bg-[#12122a]">
          <span className="text-[12px] text-gray-500 font-mono">cwd:</span>
          <input
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            className="flex-1 bg-[#1a1a2e] border border-[#2a2a4a] text-gray-200 text-[13px] font-mono px-2 py-0.5 rounded focus:outline-none focus:border-yellow-400/50"
            disabled={running}
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2 bg-[#050510] font-mono text-[13px]">
          {lines.length === 0 && <div className="text-gray-600 italic">명령 입력 후 실행...</div>}
          {lines.map((l, i) => (
            <div key={i} className={
              l.stream === "exec" ? "text-yellow-300"
              : l.stream === "stderr" ? "text-red-300"
              : "text-green-200"
            }>
              {l.text}
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 border-t border-[#2a2a4a] bg-[#0f0f1f]">
          <span className="text-green-400 font-mono text-sm">$</span>
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(); } }}
            placeholder="명령 입력 (예: ls -la)"
            className="flex-1 bg-[#1a1a2e] border border-[#2a2a4a] text-gray-100 text-[12px] font-mono px-2 py-1 rounded focus:outline-none focus:border-green-400/50"
            disabled={running}
            autoFocus
          />
          {running ? (
            <Button size="sm" variant="destructive" onClick={stop}>
              <Square className="h-3 w-3 mr-1" />중지
            </Button>
          ) : (
            <Button size="sm" onClick={run} disabled={!cmd.trim()}>
              <Play className="h-3 w-3 mr-1" />실행
            </Button>
          )}
          {lastExit !== null && lastExit !== 0 && !running && (
            <Button size="sm" variant="outline" onClick={fixWithAI} className="text-orange-300 border-orange-500/40">
              <Wrench className="h-3 w-3 mr-1" />🔧 AI 수정
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
