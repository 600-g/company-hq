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
