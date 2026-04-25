/**
 * 에이전트 응답 markdown 에서 코드 블록 = 산출물(Artifact) 추출.
 * 팀메이커 스타일 파서 이식.
 *
 * 규칙:
 *   - ```lang
 *     ...
 *     ``` → code artifact
 *   - 코드블록 바로 위의 `파일명: src/app/page.tsx` 또는 `### src/app/page.tsx` 패턴은 title 로
 *   - ```lang title=src/...``` 도 허용
 */

export type ArtifactType = "code" | "document" | "action_items";

export interface Artifact {
  type: ArtifactType;
  title: string;
  content: string;
  language?: string;
}

export interface ChoiceBlock {
  question: string;
  options: string[];
}

export interface ParsedResult {
  summary: string;     // 코드 블록/choice 블록 제거한 설명 텍스트
  artifacts: Artifact[];
  choice?: ChoiceBlock;  // 객관식 되묻기 (있을 때)
}

/** ```choice 블록 파싱 */
export function parseChoiceBlock(text: string): { cleaned: string; choice?: ChoiceBlock } {
  const re = /```choice\s*\n([\s\S]*?)```/;
  const m = text.match(re);
  if (!m) return { cleaned: text };
  const block = m[1];
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  const qLine = lines.find((l) => l.startsWith("?"));
  const question = qLine ? qLine.replace(/^\?\s*/, "").trim() : "";
  const options = lines.filter((l) => l.startsWith("-")).map((l) => l.replace(/^-\s*/, "").trim());
  if (!question || options.length === 0) return { cleaned: text };
  return {
    cleaned: text.replace(re, "").trim(),
    choice: { question, options },
  };
}

const FENCE_RE = /```(\w+)?(?:\s+title=([^\n`]+))?\n([\s\S]*?)\n```/g;

export function parseArtifacts(content: string): ParsedResult {
  // 1) choice 블록 먼저 분리
  const { cleaned, choice } = parseChoiceBlock(content);

  const artifacts: Artifact[] = [];
  let summary = "";
  let lastEnd = 0;

  const extractTitle = (prefix: string, explicit?: string): string => {
    if (explicit) return explicit.trim();
    const lines = prefix.trim().split("\n");
    const last = lines[lines.length - 1] || "";
    const fileMatch = last.match(/(?:파일명|path|file)[:\s]+([^\s]+)/i);
    if (fileMatch) return fileMatch[1];
    const hashMatch = last.match(/^#{1,6}\s+(.+)/);
    if (hashMatch) return hashMatch[1].trim();
    return "snippet";
  };

  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(cleaned)) !== null) {
    const [, lang, explicitTitle, code] = m;
    if (lang === "choice") { lastEnd = m.index + m[0].length; continue; }
    const before = cleaned.slice(lastEnd, m.index);
    summary += before;
    const title = extractTitle(before, explicitTitle);
    artifacts.push({
      type: "code",
      title,
      content: code,
      language: lang || "text",
    });
    lastEnd = m.index + m[0].length;
  }
  summary += cleaned.slice(lastEnd);
  return { summary: summary.trim(), artifacts, choice };
}
