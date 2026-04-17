import type { GameState, EvolutionStage } from "@/types/digimon";

// ── Stage progression timing (seconds) ──────────────────────────────────────
export const STAGE_DURATION: Record<EvolutionStage, number> = {
  egg:      60,    // 1 min  → baby
  baby:     300,   // 5 min  → child
  child:    600,   // 10 min → adult
  adult:    900,   // 15 min → perfect
  perfect:  1200,  // 20 min → ultimate
  ultimate: Infinity,
  dead:     Infinity,
};

export const DIGIMON_NAMES: Record<EvolutionStage, { good: string; bad: string }> = {
  egg:      { good: "DigiEgg",     bad: "DigiEgg" },
  baby:     { good: "Botamon",     bad: "Botamon" },
  child:    { good: "Koromon",     bad: "Tsunomon" },
  adult:    { good: "Agumon",      bad: "Elecmon" },
  perfect:  { good: "Greymon",    bad: "Devidramon" },
  ultimate: { good: "MetalGreymon", bad: "Machinedramon" },
  dead:     { good: "—",          bad: "—" },
};

const NEXT_STAGE: Partial<Record<EvolutionStage, EvolutionStage>> = {
  egg:     "baby",
  baby:    "child",
  child:   "adult",
  adult:   "perfect",
  perfect: "ultimate",
};

export const STORAGE_KEY = "digi-pendulum-state";

export function defaultState(): GameState {
  const now = Date.now();
  return {
    stage:          "egg",
    digimonName:    "DigiEgg",
    hunger:         4,
    happiness:      4,
    strength:       0,
    discipline:     50,
    weight:         5,
    age:            0,
    isSleeping:     false,
    isSick:         false,
    poop:           0,
    careMistakes:   0,
    battleWins:     0,
    totalBattles:   0,
    lastFedAt:      now,
    lastHappyAt:    now,
    lastPoopAt:     now,
    stageStartedAt: now,
    bornAt:         now,
    evolutionReady: false,
    isDead:         false,
  };
}

export function loadState(): GameState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return JSON.parse(raw) as GameState;
  } catch {
    return defaultState();
  }
}

export function saveState(state: GameState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ── Tick logic (called every second) ────────────────────────────────────────
export function tick(state: GameState): GameState {
  if (state.isDead || state.isSleeping) return state;

  const now = Date.now();
  const elapsed = Math.floor((now - state.stageStartedAt) / 1000);
  let next = { ...state };

  // Age in game-hours (1 real-second = 1 game-minute → 60 ticks = 1 game-hour)
  next.age = Math.floor((now - next.bornAt) / 60000);

  // Hunger decreases every 3 min
  if (now - next.lastFedAt > 3 * 60 * 1000) {
    const drain = Math.floor((now - next.lastFedAt) / (3 * 60 * 1000));
    const newHunger = Math.max(0, next.hunger - drain);
    if (newHunger < next.hunger) {
      next.lastFedAt = now;
      next.hunger = newHunger;
      if (newHunger === 0) next.careMistakes++;
    }
  }

  // Happiness decreases every 5 min
  if (now - next.lastHappyAt > 5 * 60 * 1000) {
    const drain = Math.floor((now - next.lastHappyAt) / (5 * 60 * 1000));
    const newHappy = Math.max(0, next.happiness - drain);
    if (newHappy < next.happiness) {
      next.lastHappyAt = now;
      next.happiness = newHappy;
      if (newHappy === 0) next.careMistakes++;
    }
  }

  // Poop appears every 5 min, max 4
  if (next.stage !== "egg" && now - next.lastPoopAt > 5 * 60 * 1000) {
    if (next.poop < 4) {
      next.poop++;
      next.lastPoopAt = now;
      if (next.poop >= 3) next.isSick = true;
    }
  }

  // Sickness from neglect
  if (next.hunger === 0 && Math.random() < 0.001) next.isSick = true;
  if (next.isSick && Math.random() < 0.0005) {
    next.isDead = true;
    next.stage = "dead";
    return next;
  }

  // Evolution check
  const duration = STAGE_DURATION[next.stage];
  if (duration !== Infinity && elapsed >= duration && next.stage !== "ultimate") {
    next.evolutionReady = true;
  }

  return next;
}

export function evolve(state: GameState): GameState {
  const nextStage = NEXT_STAGE[state.stage];
  if (!nextStage) return state;
  const isGood = state.careMistakes <= 3 && state.hunger >= 2 && state.happiness >= 2;
  const name = DIGIMON_NAMES[nextStage][isGood ? "good" : "bad"];
  return {
    ...state,
    stage:          nextStage,
    digimonName:    name,
    evolutionReady: false,
    stageStartedAt: Date.now(),
    careMistakes:   0,
    weight:         state.weight + 1,
    strength:       Math.min(99, state.strength + 5),
  };
}

// ── Care actions ─────────────────────────────────────────────────────────────
export function feedMeat(state: GameState): GameState {
  if (state.isSleeping || state.stage === "egg" || state.isDead) return state;
  const hunger = Math.min(4, state.hunger + 1);
  return { ...state, hunger, weight: state.weight + 1, lastFedAt: Date.now() };
}

export function feedVitamin(state: GameState): GameState {
  if (state.isSleeping || state.stage === "egg" || state.isDead) return state;
  return { ...state, strength: Math.min(99, state.strength + 5) };
}

export function cleanPoop(state: GameState): GameState {
  if (state.isDead) return state;
  return { ...state, poop: 0, isSick: state.poop < 3 ? false : state.isSick };
}

export function heal(state: GameState): GameState {
  if (!state.isSick || state.isDead) return state;
  return { ...state, isSick: false, weight: Math.max(1, state.weight - 1) };
}

export function toggleSleep(state: GameState): GameState {
  if (state.isDead) return state;
  return {
    ...state,
    isSleeping: !state.isSleeping,
    lastFedAt:  state.isSleeping ? Date.now() : state.lastFedAt,
    lastHappyAt: state.isSleeping ? Date.now() : state.lastHappyAt,
  };
}

export function applyTrainWin(state: GameState, hits: number): GameState {
  const bonus = Math.round((hits / 3) * 10);
  return {
    ...state,
    strength:   Math.min(99, state.strength + bonus),
    discipline: Math.min(100, state.discipline + 5),
    weight:     Math.max(1, state.weight - 1),
    happiness:  Math.min(4, state.happiness + (hits >= 2 ? 1 : 0)),
  };
}

export function applyBattleResult(state: GameState, won: boolean): GameState {
  return {
    ...state,
    battleWins:   won ? state.battleWins + 1 : state.battleWins,
    totalBattles: state.totalBattles + 1,
    strength:     won ? Math.min(99, state.strength + 5) : state.strength,
    happiness:    won
      ? Math.min(4, state.happiness + 1)
      : Math.max(0, state.happiness - 1),
  };
}

export function resetGame(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function stageLabel(stage: EvolutionStage): string {
  const labels: Record<EvolutionStage, string> = {
    egg:      "알",
    baby:     "유아체",
    child:    "성장기",
    adult:    "성숙기",
    perfect:  "완전체",
    ultimate: "궁극체",
    dead:     "사망",
  };
  return labels[stage];
}
