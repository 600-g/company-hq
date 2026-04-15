const PLACES = [
  "tokyo",
  "paris",
  "seoul",
  "oslo",
  "sydney",
  "berlin",
  "cairo",
  "dubai",
  "lima",
  "rome",
  "miami",
  "lagos",
  "bali",
  "delhi",
  "hanoi",
  "kyoto",
  "lisbon",
  "milan",
  "nairobi",
  "prague",
  "quebec",
  "riga",
  "sofia",
  "taipei",
  "vienna",
  "warsaw",
  "zurich",
  "bogota",
  "darwin",
  "jeju",
] as const;

const ANIMALS = [
  "fox",
  "owl",
  "panda",
  "whale",
  "hawk",
  "wolf",
  "tiger",
  "koala",
  "otter",
  "crane",
  "lynx",
  "bison",
  "eagle",
  "cobra",
  "gecko",
  "heron",
  "ibis",
  "jaguar",
  "lemur",
  "moose",
  "newt",
  "oryx",
  "quail",
  "robin",
  "sloth",
  "tapir",
  "viper",
  "wren",
  "yak",
  "zebra",
] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateProjectName(existingNames: string[] = []): string {
  const existing = new Set(existingNames);
  const maxAttempts = PLACES.length * ANIMALS.length;

  for (let i = 0; i < maxAttempts; i++) {
    const name = `${pick(PLACES)}-${pick(ANIMALS)}`;
    if (!existing.has(name)) return name;
  }

  // Fallback: append random suffix
  return `${pick(PLACES)}-${pick(ANIMALS)}-${Date.now().toString(36).slice(-4)}`;
}
