/**
 * 터미널 프로세스 추적 (TeamMaker terminalStore.ts 패턴 포팅).
 *
 * 우리 시스템 활용:
 * - DevTerminal.tsx (이미 있음) 의 출력 streaming
 * - claude_runner 호출 결과 stdout/stderr 분리 표시
 * - localhost URL 자동 감지 → 클릭 가능한 링크로 변환
 *
 * 메모리 only (영속 X). 세션 종료 시 사라짐 (의도적 — 터미널 출력은 일시).
 */

export interface TerminalLine {
  text: string;
  stream: "stdout" | "stderr";
  ts: number;
}

export interface TerminalProcess {
  id: string;
  command: string;
  cwd: string;
  status: "running" | "exited";
  exitCode?: number;
  lines: TerminalLine[];
  detectedUrl?: string;
  startedAt: number;
  endedAt?: number;
}

const URL_RE = /(https?:\/\/[^\s)]+)|(localhost:\d+[^\s)]*)/i;

class TerminalManager {
  private processes = new Map<string, TerminalProcess>();
  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  start(command: string, cwd: string): string {
    const id = `proc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.processes.set(id, {
      id,
      command,
      cwd,
      status: "running",
      lines: [],
      startedAt: Date.now(),
    });
    this.notify();
    return id;
  }

  appendLine(id: string, text: string, stream: "stdout" | "stderr" = "stdout"): void {
    const p = this.processes.get(id);
    if (!p) return;
    p.lines.push({ text, stream, ts: Date.now() });
    // URL 자동 감지 (첫 번째만)
    if (!p.detectedUrl) {
      const m = text.match(URL_RE);
      if (m) p.detectedUrl = m[0];
    }
    this.notify();
  }

  exit(id: string, code: number): void {
    const p = this.processes.get(id);
    if (!p) return;
    p.status = "exited";
    p.exitCode = code;
    p.endedAt = Date.now();
    this.notify();
  }

  clear(id: string): void {
    this.processes.delete(id);
    this.notify();
  }

  list(): TerminalProcess[] {
    return Array.from(this.processes.values()).sort((a, b) => b.startedAt - a.startedAt);
  }

  get(id: string): TerminalProcess | null {
    return this.processes.get(id) ?? null;
  }
}

export const terminalManager = new TerminalManager();
