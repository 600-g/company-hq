/**
 * 요청 정제 (refineRequirements 경량 버전).
 *   - 사용자 입력을 검사해 모호하면 clarification 필요 플래그를 돌려준다.
 *   - 팀메이커는 AI에게 정제를 맡기지만, 우리는 경량 규칙 기반 (토큰 세이빙).
 */

export interface RefineResult {
  needsClarify: boolean;
  questions: string[];
  hints: string[];
}

const VAGUE_KEYWORDS = [
  "이거", "그거", "저거", "그렇게", "비슷하게", "알아서", "해봐", "좀",
  "something", "this", "that", "like", "kinda", "figure it out",
];

const MIN_CHARS_FOR_CLEAR = 12;

export function refineRequest(input: string): RefineResult {
  const text = input.trim();
  const lower = text.toLowerCase();
  const questions: string[] = [];
  const hints: string[] = [];

  if (text.length < MIN_CHARS_FOR_CLEAR) {
    questions.push("더 구체적으로 설명해주세요 (예: 어떤 화면에서, 어떤 결과를 원하는지)");
  }

  const vagueHits = VAGUE_KEYWORDS.filter((k) => lower.includes(k));
  if (vagueHits.length >= 2) {
    questions.push(`모호한 표현이 포함됐습니다: "${vagueHits.slice(0, 3).join(", ")}"`);
    hints.push("파일 경로·함수명·수치를 구체적으로 적어주세요");
  }

  if (!/[.?!]/.test(text) && text.split(/\s+/).length < 4) {
    hints.push("한 문장보다는 '무엇을 / 어디에 / 어떻게' 3요소로 작성");
  }

  return {
    needsClarify: questions.length > 0,
    questions,
    hints,
  };
}
