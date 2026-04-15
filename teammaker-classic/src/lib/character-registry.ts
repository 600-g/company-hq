export type ActionType = "idle_anim" | "run" | "sit" | "reading" | "phone";

export interface CharacterDef {
  id: string;
  name: string;
  /** Available spritesheet actions */
  actions: ActionType[];
  /** Suggested role mapping */
  suggestedRole?: string;
}

const BASE_ACTIONS: ActionType[] = ["idle_anim", "run", "sit", "phone"];
const FULL_ACTIONS: ActionType[] = [...BASE_ACTIONS, "reading"];

export const CHARACTERS: CharacterDef[] = [
  { id: "Bob", name: "Bob", actions: FULL_ACTIONS, suggestedRole: "developer" },
  { id: "Lucy", name: "Lucy", actions: FULL_ACTIONS, suggestedRole: "designer" },
  { id: "Amelia", name: "Amelia", actions: FULL_ACTIONS, suggestedRole: "planner" },
  { id: "Edward", name: "Edward", actions: FULL_ACTIONS, suggestedRole: "developer" },
  { id: "Dan", name: "Dan", actions: FULL_ACTIONS, suggestedRole: "qa" },
  { id: "Ash", name: "Ash", actions: FULL_ACTIONS, suggestedRole: "developer" },
  { id: "Rob", name: "Rob", actions: FULL_ACTIONS, suggestedRole: "qa" },
  { id: "Samuel", name: "Samuel", actions: BASE_ACTIONS, suggestedRole: "manager" },
];

/** Get the spritesheet URL for a character action */
export function getSpriteSheetUrl(charId: string, action: ActionType): string {
  return `/characters/${charId}/${charId}_${action}_32x32.png`;
}

/** Get all spritesheet URLs for a character */
export function getAllSpriteSheetUrls(charId: string): Record<ActionType, string> {
  const char = CHARACTERS.find((c) => c.id === charId);
  if (!char) throw new Error(`Unknown character: ${charId}`);

  const urls = {} as Record<ActionType, string>;
  for (const action of char.actions) {
    urls[action] = getSpriteSheetUrl(charId, action);
  }
  return urls;
}

/** Pool of character IDs for agents (excluding Samuel = manager) */
const AGENT_CHAR_POOL = CHARACTERS.filter((c) => c.id !== "Samuel").map((c) => c.id);

/** Deterministic character assignment based on agent index */
export function getCharIdForAgent(agentIndex: number): string {
  return AGENT_CHAR_POOL[agentIndex % AGENT_CHAR_POOL.length];
}

/** Map agent status to character action */
export function statusToAction(status: string): ActionType {
  switch (status) {
    case "working":
      return "reading";
    case "running":
      return "run";
    case "complete":
      return "sit";
    case "talking":
      return "phone";
    default:
      return "idle_anim";
  }
}
