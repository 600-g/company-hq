export type EvolutionStage =
  | "egg"
  | "baby"
  | "child"
  | "adult"
  | "perfect"
  | "ultimate"
  | "dead";

export type ActionMode =
  | "none"
  | "feed"
  | "train"
  | "battle"
  | "sleep"
  | "heal"
  | "status";

export type MinigamePhase = "idle" | "countdown" | "active" | "result";

export interface GameState {
  stage: EvolutionStage;
  digimonName: string;
  hunger: number;      // 0–4
  happiness: number;  // 0–4
  strength: number;   // 0–99
  discipline: number; // 0–100
  weight: number;     // kg
  age: number;        // game-hours
  isSleeping: boolean;
  isSick: boolean;
  poop: number;       // 0–4
  careMistakes: number;
  battleWins: number;
  totalBattles: number;
  lastFedAt: number;
  lastHappyAt: number;
  lastPoopAt: number;
  stageStartedAt: number;
  bornAt: number;
  evolutionReady: boolean;
  isDead: boolean;
}

export interface DigimonDef {
  name: string;
  jpName: string;
  stage: EvolutionStage;
  color: string;
  accent: string;
}
