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

export interface ParsedResult {
  summary: string;     // 코드 블록을 제거한 설명 텍스트
  artifacts: Artifact[];
}

const FENCE_RE = /```(\w+)?(?:\s+title=([^\n`]+))?\n([\s\S]*?)\n```/g;

export function parseArtifacts(content: string): ParsedResult {
  const artifacts: Artifact[] = [];
  let summary = "";
  let lastEnd = 0;

  // 이전 줄에서 파일명 추측
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
  while ((m = FENCE_RE.exec(content)) !== null) {
    const [, lang, explicitTitle, code] = m;
    const before = content.slice(lastEnd, m.index);
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
  summary += content.slice(lastEnd);
  return { summary: summary.trim(), artifacts };
}
