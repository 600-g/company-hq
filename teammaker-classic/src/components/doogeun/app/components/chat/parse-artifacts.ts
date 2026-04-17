import type { Artifact } from "./AgentHandoffCard";

/** AI 응답 마크다운에서 ```lang:filename 블록을 artifact로 추출.
 *  summary = 코드블록 제외 텍스트 부분. */
export function parseArtifacts(content: string): { summary: string; artifacts: Artifact[] } {
  const artifacts: Artifact[] = [];
  const summaryParts: string[] = [];
  let rest = content;
  const fenceRe = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  let idx = 0;
  while ((match = fenceRe.exec(content))) {
    summaryParts.push(content.slice(lastIndex, match.index));
    const header = (match[1] ?? "").trim();
    const body = match[2] ?? "";
    let lang = header;
    let filename: string | undefined;
    if (header.includes(":")) {
      const [l, f] = header.split(":", 2);
      lang = (l ?? "").trim();
      filename = (f ?? "").trim() || undefined;
    } else if (header.includes("/") || header.includes(".")) {
      filename = header;
      lang = (filename.split(".").pop() || "").toLowerCase();
    }
    const title = filename || (lang ? `snippet.${lang}` : `snippet-${idx + 1}`);
    const type: Artifact["type"] = lang === "md" || lang === "markdown" || filename?.endsWith(".md")
      ? "document"
      : "code";
    artifacts.push({
      id: `artifact-${idx}-${Date.now()}`,
      type,
      title,
      content: body.trimEnd(),
      language: lang || undefined,
    });
    lastIndex = match.index + match[0].length;
    idx++;
  }
  summaryParts.push(content.slice(lastIndex));
  void rest;
  const summary = summaryParts.join("\n").trim();
  return { summary, artifacts };
}
