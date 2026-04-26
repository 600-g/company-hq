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

/** CPO 채용(에이전트 생성) 제안 — `\`\`\`hire` 블록으로 구조화 */
export interface HireProposal {
  name: string;
  emoji: string;
  role: string;
  description: string;
  reason: string;
}

export interface ParsedResult {
  summary: string;     // 코드 블록/choice 블록 제거한 설명 텍스트
  artifacts: Artifact[];
  choice?: ChoiceBlock;
  hire?: HireProposal;  // CPO 가 새 팀원 채용 제안 시
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

/**
 * 휴리스틱: 마크다운 본문에서 "질문? 다음에 2~5개의 선택지" 패턴을 자동 감지.
 * LLM이 ```choice 블록을 안 써도 객관식 질문이면 버튼화.
 *
 * 인식 패턴:
 *   - 질문 줄: 끝이 "?" / "？" / "선택해주세요" / "골라주세요"
 *   - 옵션 줄: `- ` `* ` `1.` `1)` `①` `②` `③` `A)` `B)` `(1)` `(가)` 등으로 시작, 80자 이하
 *   - 옵션 2~5개 연속, 빈 줄 또는 비-옵션 줄로 종료
 */
const QUESTION_END_RE = /[?？]\s*$|(?:선택해\s*주세요|선택해줘|골라\s*주세요|골라줘|어느\s*쪽|어떤\s*게|어느\s*게|어떨까요|어떨까)\s*[.!?？]?\s*$/;
const OPTION_LINE_RE = /^(?:[-*•]|\d+[.)\]]|\(\d+\)|[①②③④⑤⑥⑦⑧⑨⑩❶❷❸❹❺]|[A-Ea-e][.)]|\([가-힣]\))\s+(.{1,100})$/;

export function autoDetectChoice(text: string): { cleaned: string; choice?: ChoiceBlock } {
  const rawLines = text.split("\n");
  for (let i = 0; i < rawLines.length; i++) {
    const t = rawLines[i].trim();
    if (t.length < 4 || t.length > 240) continue;
    if (!QUESTION_END_RE.test(t)) continue;

    const opts: string[] = [];
    const idxs: number[] = [];
    let j = i + 1;
    // 첫 옵션 전 빈 줄 1개까지 허용
    while (j < rawLines.length && rawLines[j].trim() === "" && j - i <= 2) j++;

    for (; j < Math.min(i + 12, rawLines.length); j++) {
      const lt = rawLines[j].trim();
      if (!lt) {
        if (opts.length >= 2) break;
        continue;
      }
      const m = lt.match(OPTION_LINE_RE);
      if (m && m[1].trim().length > 0) {
        opts.push(m[1].trim().replace(/[.!?]$/, ""));
        idxs.push(j);
      } else {
        break;
      }
    }

    if (opts.length >= 2 && opts.length <= 5) {
      // 텍스트에서 질문 줄 + 옵션 줄들 제거
      const startIdx = i;
      const endIdx = idxs[idxs.length - 1];
      const remaining = [...rawLines.slice(0, startIdx), ...rawLines.slice(endIdx + 1)];
      return {
        cleaned: remaining.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
        choice: { question: t.replace(/[.!?？]+$/, "").trim(), options: opts },
      };
    }
  }
  return { cleaned: text };
}

/**
 * `\`\`\`hire` 블록 파싱 — CPO 채용 제안.
 *
 * 형식 (key: value 라인 기반):
 *   ```hire
 *   name: 마케팅
 *   emoji: 📣
 *   role: 마케팅 콘텐츠 담당
 *   description: SNS 기획·작성·발행, 캠페인 분석
 *   reason: 현재 마케팅 전문 팀 부재, 사용자 요청 "마케팅 도와줘" 직결
 *   ```
 */
export function parseHireBlock(text: string): { cleaned: string; hire?: HireProposal } {
  const re = /```hire\s*\n([\s\S]*?)```/;
  const m = text.match(re);
  if (!m) return { cleaned: text };
  const block = m[1];
  const fields: Record<string, string> = {};
  let lastKey = "";
  for (const raw of block.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const kv = line.match(/^([a-zA-Z_가-힣]+)\s*:\s*(.*)$/);
    if (kv) {
      lastKey = kv[1].toLowerCase();
      fields[lastKey] = kv[2].trim();
    } else if (lastKey) {
      // 다음 줄 이어붙이기
      fields[lastKey] = (fields[lastKey] + " " + line).trim();
    }
  }
  const name = (fields["name"] || "").trim();
  const role = (fields["role"] || fields["역할"] || "").trim();
  const description = (fields["description"] || fields["설명"] || "").trim();
  const reason = (fields["reason"] || fields["이유"] || "").trim();
  const emoji = (fields["emoji"] || "🤖").trim() || "🤖";
  if (!name || !role) return { cleaned: text };
  return {
    cleaned: text.replace(re, "").trim(),
    hire: { name, emoji, role, description, reason },
  };
}

const FENCE_RE = /```(\w+)?(?:\s+title=([^\n`]+))?\n([\s\S]*?)\n```/g;

export function parseArtifacts(content: string): ParsedResult {
  // 0) 채용 제안 블록 분리 (CPO 가 새 팀원 제안 시)
  const hireResult = parseHireBlock(content);
  let working = hireResult.cleaned;
  const hire = hireResult.hire;

  // 1) 명시적 ```choice 블록 우선 → 없으면 휴리스틱 자동 감지
  const explicit = parseChoiceBlock(working);
  let cleaned: string;
  let choice: ChoiceBlock | undefined;
  if (explicit.choice) {
    cleaned = explicit.cleaned;
    choice = explicit.choice;
  } else {
    const auto = autoDetectChoice(working);
    cleaned = auto.cleaned;
    choice = auto.choice;
  }
  working = cleaned;

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
  FENCE_RE.lastIndex = 0;
  while ((m = FENCE_RE.exec(working)) !== null) {
    const [, lang, explicitTitle, code] = m;
    if (lang === "choice" || lang === "hire") { lastEnd = m.index + m[0].length; continue; }
    const before = working.slice(lastEnd, m.index);
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
  summary += working.slice(lastEnd);
  return { summary: summary.trim(), artifacts, choice, hire };
}
