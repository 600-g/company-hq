"use client";

import { useEffect, useRef, useState } from "react";
import { X, Play, Square, Trash2, Wrench, Terminal as TerminalIcon, Sparkles } from "lucide-react";
import { apiBase } from "@/lib/utils";

interface Props {
  onClose: () => void;
  defaultCwd?: string;
  onFixRequest?: (errorLog: string, command: string) => void;
}

type Line = { stream: "exec" | "stdout" | "exit"; text?: string; code?: number; ts: number };
type Mode = "shell" | "claude";

const HISTORY_KEY = "doogeun-hq-terminal-history";
const HISTORY_MAX = 30;

/** 자연어 → Claude CLI 래핑. JSON 이스케이프 + print 모드 */
function buildClaudeCmd(text: string): string {
  const safe = text.replace(/"/g, '\\"').replace(/\$/g, "\\$");
  return `claude --print --dangerously-skip-permissions "${safe}"`;
}

/**
 * TM TerminalPanel 이식.
 *   - POST /api/terminal/run (SSE)
 *   - 명령 히스토리 (localStorage)
 *   - exit code ≠ 0 시 🔧 AI 수정 버튼
 */
export default function TerminalPanel({ onClose, defaultCwd = "~/Developer/my-company/company-hq", onFixRequest }: Props) {
  const [cmd, setCmd] = useState("");
  const [cwd, setCwd] = useState(defaultCwd);
  const [mode, setMode] = useState<Mode>("claude");
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [lastExit, setLastExit] = useState<number | null>(null);
  const [lastCmd, setLastCmd] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const pushHistory = (c: string) => {
    setHistory((p) => {
      const next = [c, ...p.filter((x) => x !== c)].slice(0, HISTORY_MAX);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const run = async () => {
    if (!cmd.trim() || running) return;
    setRunning(true);
    setLastExit(null);
    setLastCmd(cmd);
    pushHistory(cmd);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    // Claude 모드: 자연어 → claude CLI 호출로 변환
    const actualCmd = mode === "claude" ? buildClaudeCmd(cmd) : cmd;
    try {
      const res = await fetch(`${apiBase()}/api/terminal/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: actualCmd, cwd }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error("HTTP " + res.status);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const chunks = buf.split("\n");
        buf = chunks.pop() || "";
        for (const c of chunks) {
          if (!c.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(c.slice(6)) as { stream: string; text?: string; code?: number };
            setLines((p) => [...p, { ...d, ts: Date.now() } as Line]);
            if (d.stream === "exit") setLastExit(d.code ?? 0);
          } catch {}
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setLines((p) => [...p, { stream: "exit", text: `오류: ${e instanceof Error ? e.message : "?"}`, code: 1, ts: Date.now() }]);
        setLastExit(1);
      }
    } finally {
      setRunning(false);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const requestFix = () => {
    const errorLog = lines.filter((l) => l.stream === "stdout").map((l) => l.text).join("\n").slice(-3000);
    onFixRequest?.(errorLog, lastCmd);
  };

  const clear = () => setLines([]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-3xl h-[70vh] sm:h-[80vh] bg-[#0b0b14] border border-gray-800 rounded-t-xl sm:rounded-xl flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="h-11 shrink-0 flex items-center gap-2 px-3 border-b border-gray-800/70">
          <TerminalIcon className="w-4 h-4 text-sky-300" />
          <span className="text-[13px] font-bold text-gray-200">터미널</span>
          <div className="flex gap-0.5 bg-gray-900 rounded border border-gray-800 p-0.5 ml-2">
            <button
              onClick={() => setMode("claude")}
              className={`px-2 py-0.5 text-[11px] rounded flex items-center gap-0.5 ${
                mode === "claude" ? "bg-sky-500/20 text-sky-200 font-bold" : "text-gray-500"
              }`}
              title="자연어 → Claude CLI"
            >
              <Sparkles className="w-3 h-3" /> 자연어
            </button>
            <button
              onClick={() => setMode("shell")}
              className={`px-2 py-0.5 text-[11px] rounded ${
                mode === "shell" ? "bg-amber-500/20 text-amber-300 font-bold" : "text-gray-500"
              }`}
              title="Bash 직접 실행"
            >
              $ shell
            </button>
          </div>
          {running && <span className="flex items-center gap-1 text-[11px] text-amber-300"><span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />실행 중</span>}
          {lastExit != null && !running && (
            <span className={`text-[11px] ${lastExit === 0 ? "text-green-400" : "text-red-400"}`}>
              exit {lastExit}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {!running && lastExit != null && lastExit !== 0 && onFixRequest && (
              <button onClick={requestFix} className="text-[11px] px-2 py-1 rounded border border-amber-400/50 text-amber-200 hover:bg-amber-500/10 flex items-center gap-1">
                <Wrench className="w-3 h-3" /> AI 수정
              </button>
            )}
            <button onClick={clear} title="비우기" className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose} title="닫기 (ESC)" className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* cwd + 명령 입력 */}
        <div className="px-3 py-2 border-b border-gray-800/50 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span>cwd:</span>
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              className="flex-1 h-6 px-2 rounded border border-gray-800 bg-gray-900/60 text-[11px] text-gray-300 font-mono"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`font-mono text-[12px] ${mode === "claude" ? "text-sky-300" : "text-gray-500"}`}>
              {mode === "claude" ? "🤖" : "$"}
            </span>
            <input
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !running) run();
                if (e.key === "ArrowUp" && history.length > 0) {
                  const idx = history.indexOf(cmd);
                  const next = idx === -1 ? 0 : Math.min(idx + 1, history.length - 1);
                  setCmd(history[next]);
                  e.preventDefault();
                }
              }}
              placeholder={mode === "claude" ? "예: 이 폴더 README 업데이트해줘" : "예: cd doogeun-hq && npx next build"}
              className="flex-1 h-8 px-2 rounded border border-gray-800 bg-gray-900/80 text-[12px] text-gray-100 font-mono"
              autoFocus
            />
            {running ? (
              <button onClick={cancel} className="h-8 px-3 rounded border border-red-500/50 text-red-300 hover:bg-red-500/10 text-[11px] flex items-center gap-1">
                <Square className="w-3 h-3" /> 중단
              </button>
            ) : (
              <button onClick={run} disabled={!cmd.trim()} className="h-8 px-3 rounded bg-sky-500/20 border border-sky-400/50 text-sky-200 hover:bg-sky-500/30 disabled:opacity-40 text-[11px] flex items-center gap-1">
                <Play className="w-3 h-3" /> 실행
              </button>
            )}
          </div>
          {history.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[9px] text-gray-600">최근:</span>
              {history.slice(0, 5).map((h) => (
                <button
                  key={h}
                  onClick={() => setCmd(h)}
                  className="text-[10px] text-gray-500 hover:text-sky-300 font-mono px-1 py-0.5 rounded bg-gray-900/40 hover:bg-gray-800 truncate max-w-[200px]"
                  title={h}
                >
                  {h}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 출력 */}
        <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] bg-black/40">
          {lines.length === 0 ? (
            <div className="text-gray-600 text-[11px]">명령을 입력해 실행하세요. Enter 또는 [실행] 클릭. ↑ 히스토리.</div>
          ) : lines.map((l, i) => (
            <div key={i} className={
              l.stream === "exec" ? "text-sky-300" :
              l.stream === "exit" ? l.code === 0 ? "text-green-400 mt-1" : "text-red-400 mt-1" :
              "text-gray-300"
            }>
              {l.stream === "exit" ? `▸ 종료 코드 ${l.code}${l.text ? ` — ${l.text}` : ""}` : l.text}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
