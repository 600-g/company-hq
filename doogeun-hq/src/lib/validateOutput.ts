/**
 * 에이전트 응답 품질 검증 (TM validateAgentOutput 이식).
 *   - 빈 summary / 빈 artifact content / 코드 언어 누락 / 잘못된 JSON 체크
 *   - 실패 시 issues[] 를 재시도 프롬프트 힌트로 사용
 */

import type { Artifact, ParsedResult } from "./parseArtifacts";

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

const MIN_SUMMARY_CHARS = 8;
const MIN_AGENT_CHARS = 12;

export function validateParsedResult(parsed: ParsedResult): ValidationResult {
  const issues: string[] = [];

  const summary = (parsed.summary || "").trim();
  if (!summary) {
    issues.push("summary 가 비어있습니다");
  } else if (summary.length < MIN_SUMMARY_CHARS && parsed.artifacts.length === 0) {
    issues.push(`응답이 너무 짧습니다 (${summary.length}자) — 구체 설명이 필요`);
  }

  for (const artifact of parsed.artifacts) {
    if (!artifact.content || !artifact.content.trim()) {
      issues.push(`빈 코드 블록: ${artifact.title}`);
      continue;
    }
    if (artifact.type === "code" && (!artifact.language || artifact.language === "text")) {
      issues.push(`언어 명시 누락: ${artifact.title}`);
    }
    if (artifact.type === "code" && artifact.title.endsWith(".json")) {
      try {
        JSON.parse(artifact.content);
      } catch {
        issues.push(`잘못된 JSON: ${artifact.title}`);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * 스트리밍 중간 결과 검증 — 전체 텍스트가 너무 짧거나 비어있는지만 체크.
 * parseArtifacts 호출하기 전에 빠르게 거르는 용도.
 */
export function validateRawAgentText(content: string): ValidationResult {
  const issues: string[] = [];
  const text = (content || "").trim();
  if (!text) {
    issues.push("응답이 비어있습니다");
  } else if (text.length < MIN_AGENT_CHARS && !text.includes("```")) {
    issues.push(`응답이 너무 짧습니다 (${text.length}자)`);
  }
  return { valid: issues.length === 0, issues };
}

/**
 * 재시도 시 에이전트에게 줄 힌트 프롬프트 작성.
 */
export function buildRetryPrompt(issues: string[], originalPrompt: string): string {
  return [
    "[자동 재시도 — 직전 응답 품질 미달]",
    "다음 이슈를 해결해서 다시 응답해 주세요:",
    ...issues.map((x) => `  - ${x}`),
    "",
    "원래 요청:",
    originalPrompt,
  ].join("\n");
}

/**
 * 에러 수정 요청 프롬프트 (TM fixErrorWithAI 경량 버전).
 * 우리는 에이전트 채팅으로 그대로 흘려보내므로 별도 API 불필요.
 */
export function buildFixErrorPrompt(
  errorOutput: string,
  artifacts: Artifact[] = [],
  context?: string,
): string {
  const artifactBlock = artifacts
    .slice(0, 5)
    .map((a) => `### ${a.title}\n\`\`\`${a.language || ""}\n${a.content}\n\`\`\``)
    .join("\n\n");

  const parts = [
    "[에러 자동 수정 요청]",
    "아래 에러 로그를 분석하고 문제가 되는 파일을 수정해 주세요.",
    "",
    "## 에러 로그",
    "```",
    errorOutput.slice(0, 4000),
    "```",
  ];
  if (context) parts.push("", "## 상황", context);
  if (artifactBlock) parts.push("", "## 현재 소스", artifactBlock);
  parts.push("", "수정된 파일 전체 내용을 title 헤더와 함께 코드블록으로 반환해 주세요.");
  return parts.join("\n");
}
