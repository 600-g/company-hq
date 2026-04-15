/**
 * 팀별 세션 관리 (TeamMaker sessionStore.ts 패턴 포팅).
 *
 * 우리 시스템 특성:
 * - 한 팀 안에서 여러 "프로젝트/주제" 세션 분리 가능
 *   예: date-map 팀 안에 "다크모드 기능", "v1.7 리팩터", "분석 대시보드" 3개 세션
 * - 각 세션은 독립된 메시지 이력 + 작업 디렉토리 컨텍스트
 *
 * 포트 안 한 부분:
 * - Supabase/GitHub 연동 필드 (우리 teams.json이 이미 처리)
 * - billing 제한 (우리는 무료)
 * - trackEvent (우리는 analytics 없음)
 */

export interface SessionMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  ts: number;
}

export interface Session {
  id: string;
  teamId: string; // 소속 팀
  title: string;
  workingDirectory?: string;
  messages: SessionMessage[];
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
}

const LS_KEY = "hq-sessions";
const MAX_MESSAGES_PER_SESSION = 500;

interface Store {
  sessions: Session[];
  activeByTeam: Record<string, string | null>; // teamId → sessionId
}

// ── 저장소 ──

function load(): Store {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { sessions: [], activeByTeam: {} };
}

function save(store: Store): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {}
}

// ── 조회 ──

export function listSessions(teamId: string): Session[] {
  const store = load();
  return store.sessions
    .filter((s) => s.teamId === teamId && !s.archived)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getActiveSession(teamId: string): Session | null {
  const store = load();
  const activeId = store.activeByTeam[teamId];
  if (!activeId) return null;
  return store.sessions.find((s) => s.id === activeId) ?? null;
}

export function getSession(sessionId: string): Session | null {
  const store = load();
  return store.sessions.find((s) => s.id === sessionId) ?? null;
}

// ── 생성/수정 ──

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function createSession(teamId: string, title?: string): Session {
  const store = load();
  const now = Date.now();
  const session: Session = {
    id: newId(),
    teamId,
    title: title ?? `새 세션 ${new Date(now).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  store.sessions.push(session);
  store.activeByTeam[teamId] = session.id;
  save(store);
  return session;
}

export function switchSession(teamId: string, sessionId: string): void {
  const store = load();
  const exists = store.sessions.some((s) => s.id === sessionId && s.teamId === teamId);
  if (!exists) return;
  store.activeByTeam[teamId] = sessionId;
  save(store);
}

export function appendMessage(
  sessionId: string,
  msg: Omit<SessionMessage, "id" | "ts">,
): void {
  const store = load();
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  const now = Date.now();
  session.messages.push({ ...msg, id: newId(), ts: now });
  // 최대 메시지 수 제한 (과거 것 삭제)
  if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
    session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
  }
  session.updatedAt = now;
  save(store);
}

export function renameSession(sessionId: string, title: string): void {
  const store = load();
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  session.title = title;
  session.updatedAt = Date.now();
  save(store);
}

export function archiveSession(sessionId: string): void {
  const store = load();
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  session.archived = true;
  session.updatedAt = Date.now();
  // 활성 세션이었다면 해제
  if (store.activeByTeam[session.teamId] === sessionId) {
    store.activeByTeam[session.teamId] = null;
  }
  save(store);
}

export function deleteSession(sessionId: string): void {
  const store = load();
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  store.sessions = store.sessions.filter((s) => s.id !== sessionId);
  if (store.activeByTeam[session.teamId] === sessionId) {
    store.activeByTeam[session.teamId] = null;
  }
  save(store);
}

// ── 검색 (TeamMaker엔 없지만 우리 쪽에 추가) ──

export function searchSessions(query: string): Session[] {
  const store = load();
  const q = query.toLowerCase();
  return store.sessions.filter(
    (s) =>
      !s.archived &&
      (s.title.toLowerCase().includes(q) ||
        s.messages.some((m) => m.text.toLowerCase().includes(q))),
  );
}
