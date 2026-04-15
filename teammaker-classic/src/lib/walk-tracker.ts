/**
 * Tracks pending agent walk animations.
 * OfficeCanvas registers walks; useChatSend awaits them.
 */

const pending = new Map<string, { resolve: () => void; promise: Promise<void> }>();
const walking = new Set<string>();

/** Register a walk for an agent. Returns a resolve callback for when the walk ends. */
export function registerWalk(agentId: string): () => void {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  pending.set(agentId, { resolve, promise });
  walking.add(agentId);
  return resolve;
}

/** Check if an agent is currently walking (desk should be hidden). */
export function isWalking(agentId: string): boolean {
  return walking.has(agentId);
}

/** Wait for a specific agent's walk to finish. Resolves immediately if no walk pending. */
export function waitForWalk(agentId: string): Promise<void> {
  return pending.get(agentId)?.promise ?? Promise.resolve();
}

/** Wait for all currently pending walks to finish. */
export function waitForAllWalks(): Promise<void> {
  const promises = Array.from(pending.values()).map((p) => p.promise);
  return Promise.all(promises).then(() => {});
}

/** Clean up a completed walk entry. */
export function clearWalk(agentId: string): void {
  pending.delete(agentId);
  walking.delete(agentId);
}
