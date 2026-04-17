/**
 * 캐릭터 이동 상태 추적 (TeamMaker walk-tracker.ts 포팅).
 *
 * 사용처:
 * - 팀 채팅 송신 시 캐릭터가 자리에서 일어나 이동 → 완료까지 대기
 * - OfficeScene에서 캐릭터 walk 시작/종료 등록
 */

const pending = new Map<string, { resolve: () => void; promise: Promise<void> }>();
const walking = new Set<string>();

/** 팀의 walk를 등록. 종료 시 호출할 resolve 반환. */
export function registerWalk(teamId: string): () => void {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  pending.set(teamId, { resolve, promise });
  walking.add(teamId);
  return resolve;
}

/** 현재 walk 중인지. (책상 가구는 walk 중일 때 숨길 수 있음) */
export function isWalking(teamId: string): boolean {
  return walking.has(teamId);
}

/** 특정 팀의 walk 종료 대기. 진행 중 walk 없으면 즉시 resolve. */
export function waitForWalk(teamId: string): Promise<void> {
  return pending.get(teamId)?.promise ?? Promise.resolve();
}

/** 진행 중 모든 walk 종료 대기. */
export function waitForAllWalks(): Promise<void> {
  const promises = Array.from(pending.values()).map((p) => p.promise);
  return Promise.all(promises).then(() => {});
}

/** 완료된 walk 엔트리 정리. */
export function clearWalk(teamId: string): void {
  pending.delete(teamId);
  walking.delete(teamId);
}
