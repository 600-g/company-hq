/**
 * Claude CLI 어댑터 — TeamMaker 의 Anthropic API 호출을 Max 플랜 기반 `claude -p` 로 우회.
 *
 * 동작:
 * - `USE_MAX_PLAN=1` 환경변수가 켜지면 route.ts 가 이 함수를 호출
 * - claude CLI subprocess (`claude -p ...`)를 띄워 Max 플랜 인증으로 응답 받음
 * - 응답을 Anthropic API 호환 객체(`{content, stop_reason}`)로 변환해서 반환
 *
 * 장점:
 * - TeamMaker 가 본인 API 키 없이도 Max 플랜으로 작동
 * - 도구 사용(파일 IO, Bash 등)은 claude CLI 내장 도구가 자동 처리
 *
 * 한계:
 * - TeamMaker 의 tool_use 스트리밍 이벤트 (UI 파일 트리 갱신 등)는 안 발생
 *   → 답변 텍스트 + 실제 파일/코드 변경은 됨, UI 시각화는 부족
 *   → 추후 stream-json 양방향 변환으로 보강 가능
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";

interface ContentBlock {
  type: string;
  text?: string;
}

interface AnthropicLikeResponse {
  content: ContentBlock[];
  stop_reason: string;
}

interface BridgeOptions {
  systemPrompt?: string;
  cwd?: string;
  modelOverride?: string;
  timeoutMs?: number;
}

function detectClaudeBin(): string {
  const candidates = [
    "/opt/homebrew/bin/claude",
    `${os.homedir()}/.local/bin/claude`,
    `${os.homedir()}/.claude/claude`,
    "/usr/local/bin/claude",
    "claude",
  ];
  return candidates[0]; // 일단 가장 흔한 path; subprocess 가 실패하면 PATH 로 fallback
}

/**
 * messages 배열을 단일 prompt 로 평탄화.
 * Claude CLI 는 conversation 형식 X — text 누적해서 던짐.
 */
function flattenMessages(messages: unknown[]): string {
  const parts: string[] = [];
  for (const m of messages as Array<{ role?: string; content?: unknown }>) {
    const role = m.role ?? "user";
    let content: string;
    if (typeof m.content === "string") {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = (m.content as Array<{ type?: string; text?: string }>)
        .map((b) => (b.type === "text" ? (b.text ?? "") : `[${b.type ?? "block"}]`))
        .join("\n");
    } else {
      content = JSON.stringify(m.content ?? "");
    }
    parts.push(`### ${role.toUpperCase()}\n${content}`);
  }
  return parts.join("\n\n");
}

// ── Tool 이름 매핑 (Claude CLI 내장 도구 → TeamMaker 표시명) ──
export const TOOL_NAME_MAP: Record<string, string> = {
  Read: "read_file",
  Write: "write_file",
  Edit: "write_file",
  MultiEdit: "write_file",
  Bash: "run_command",
  Glob: "list_directory",
  LS: "list_directory",
  Grep: "search_files",
  WebFetch: "web_fetch",
  WebSearch: "web_search",
  Task: "delegate_subagent",
};

export interface StreamEvent {
  kind: "tool" | "text" | "result" | "error";
  toolName?: string;
  toolDetail?: string;
  step?: number;
  text?: string;
  finalText?: string;
  writtenFiles?: { path: string; content: string }[];
  error?: string;
}

/**
 * stream-json 모드 — 도구 사용 이벤트를 실시간 yield.
 * route.ts 가 NDJSON 으로 클라이언트에 스트림.
 */
export async function* callClaudeMaxPlanStream(
  messages: unknown[],
  options: BridgeOptions = {},
): AsyncGenerator<StreamEvent> {
  const { systemPrompt, cwd, modelOverride, timeoutMs = 300_000 } = options;

  const promptBody = flattenMessages(messages);
  const fullPrompt = systemPrompt
    ? `## System\n${systemPrompt}\n\n## Conversation\n${promptBody}`
    : promptBody;

  const claudeBin = detectClaudeBin();
  const args = [
    "-p", fullPrompt,
    "--dangerously-skip-permissions",
    "--output-format", "stream-json",
    "--verbose",
  ];
  if (modelOverride) {
    if (/haiku/i.test(modelOverride)) args.push("--model", "haiku");
    else if (/opus/i.test(modelOverride)) args.push("--model", "opus");
    else args.push("--model", "sonnet");
  } else {
    args.push("--model", "sonnet");
  }

  const env = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ""}` };
  const workingDir = cwd && cwd.length > 0 ? cwd : process.cwd();

  const proc = spawn(claudeBin, args, { env, cwd: workingDir });
  const writtenFiles: { path: string; content: string }[] = [];
  const finalTextChunks: string[] = [];
  let stepCount = 0;

  const events: StreamEvent[] = [];
  let done = false;
  let errorMsg: string | null = null;
  let buffer = "";

  proc.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf-8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const evt = JSON.parse(trimmed) as { type?: string; message?: { content?: Array<{ type?: string; name?: string; input?: Record<string, unknown>; text?: string }> }; subtype?: string; result?: string };
        if (evt.type === "assistant" && evt.message?.content) {
          for (const block of evt.message.content) {
            if (block.type === "text" && block.text) {
              finalTextChunks.push(block.text);
              events.push({ kind: "text", text: block.text });
            } else if (block.type === "tool_use" && block.name) {
              stepCount++;
              const mappedName = TOOL_NAME_MAP[block.name] ?? block.name;
              const inputStr = block.input ? JSON.stringify(block.input).slice(0, 200) : "";
              events.push({
                kind: "tool",
                toolName: mappedName,
                toolDetail: inputStr,
                step: stepCount,
              });
              // Write/Edit 도구 호출은 writtenFiles 로 추적
              if ((block.name === "Write" || block.name === "Edit" || block.name === "MultiEdit") && block.input) {
                const filePath = (block.input as { file_path?: string }).file_path;
                const content = (block.input as { content?: string; new_string?: string }).content ?? (block.input as { new_string?: string }).new_string ?? "";
                if (filePath) writtenFiles.push({ path: filePath, content });
              }
            }
          }
        } else if (evt.type === "result" && evt.subtype === "success" && evt.result) {
          // 최종 텍스트 결과
          if (!finalTextChunks.length) finalTextChunks.push(evt.result);
        }
      } catch {
        // JSON 파싱 실패는 무시 (일부 라인 누락)
      }
    }
  });
  proc.stderr.on("data", (chunk: Buffer) => {
    const tail = chunk.toString("utf-8");
    if (tail.length > 0 && tail.length < 500) {
      console.error("[claude-cli-bridge] stderr:", tail);
    }
  });
  const exitPromise = new Promise<number>((resolve) => {
    proc.on("close", (code) => {
      done = true;
      resolve(code ?? 0);
    });
    proc.on("error", (err) => {
      done = true;
      errorMsg = err.message;
      resolve(1);
    });
  });
  const timer = setTimeout(() => {
    if (!done) {
      proc.kill("SIGTERM");
      errorMsg = `claude CLI 타임아웃 (${timeoutMs}ms)`;
    }
  }, timeoutMs);

  // events 큐를 폴링하며 yield
  let yielded = 0;
  while (!done) {
    while (yielded < events.length) {
      yield events[yielded++];
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  // 종료 후 남은 이벤트
  while (yielded < events.length) {
    yield events[yielded++];
  }
  clearTimeout(timer);
  await exitPromise;

  if (errorMsg) {
    yield { kind: "error", error: errorMsg };
    return;
  }

  yield {
    kind: "result",
    finalText: finalTextChunks.join("") || "(빈 응답)",
    writtenFiles,
  };
}

export async function callClaudeMaxPlan(
  messages: unknown[],
  options: BridgeOptions = {},
): Promise<AnthropicLikeResponse> {
  const { systemPrompt, cwd, modelOverride, timeoutMs = 180_000 } = options;

  const promptBody = flattenMessages(messages);
  const fullPrompt = systemPrompt
    ? `## System\n${systemPrompt}\n\n## Conversation\n${promptBody}`
    : promptBody;

  const claudeBin = detectClaudeBin();
  const args = ["-p", fullPrompt, "--dangerously-skip-permissions"];
  // 모델 매핑: TeamMaker 가 anthropic/claude-haiku-... 스타일 → claude CLI 는 sonnet/haiku/opus 키워드
  if (modelOverride) {
    if (/haiku/i.test(modelOverride)) args.push("--model", "haiku");
    else if (/opus/i.test(modelOverride)) args.push("--model", "opus");
    else args.push("--model", "sonnet");
  } else {
    args.push("--model", "sonnet");
  }

  const env = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ""}` };
  const workingDir = cwd && cwd.length > 0 ? cwd : process.cwd();

  return await new Promise<AnthropicLikeResponse>((resolve, reject) => {
    const proc = spawn(claudeBin, args, { env, cwd: workingDir });
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`claude CLI 타임아웃 (${timeoutMs}ms 초과)`));
    }, timeoutMs);

    proc.stdout.on("data", (d) => {
      stdout += d.toString("utf-8");
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString("utf-8");
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`claude CLI 실행 실패: ${err.message}`));
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const tail = stderr.slice(-500) || stdout.slice(-500);
        reject(new Error(`claude CLI 종료 코드 ${code}: ${tail}`));
        return;
      }
      // claude -p 의 일반 출력은 텍스트만 (stream-json 미사용)
      resolve({
        content: [{ type: "text", text: stdout.trim() || "(빈 응답)" }],
        stop_reason: "end_turn",
      });
    });
  });
}
