import fs from "fs";
import path from "path";

let cachedApiKey: string | null = null;
const tokenCache: Record<string, string> = {};

const ALLOWED_TOKEN_KEYS = ["VERCEL_TOKEN", "SUPABASE_ACCESS_TOKEN", "GITHUB_TOKEN"] as const;
export type TokenKey = (typeof ALLOWED_TOKEN_KEYS)[number];

export function isAllowedTokenKey(key: string): key is TokenKey {
  return ALLOWED_TOKEN_KEYS.includes(key as TokenKey);
}

function getConfigPath(): string {
  const userDataDir = process.env.TEAMMAKER_USER_DATA;
  if (userDataDir) {
    return path.join(userDataDir, "config.json");
  }
  // dev fallback
  return path.join(process.cwd(), "config.json");
}

function readConfig(): Record<string, string> {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeConfig(config: Record<string, string>): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function setConfigValue(key: string, value: string): void {
  const config = readConfig();
  config[key] = value;
  writeConfig(config);
}

function removeConfigValue(key: string): void {
  const config = readConfig();
  delete config[key];
  writeConfig(config);
}

// --- API Key ---

function loadFromEnv(): string | null {
  return process.env.ANTHROPIC_API_KEY || null;
}

export function getApiKey(): string | null {
  if (cachedApiKey) return cachedApiKey;
  cachedApiKey = loadFromEnv() || readConfig()["ANTHROPIC_API_KEY"] || null;
  return cachedApiKey;
}

export function setApiKey(key: string): void {
  cachedApiKey = key;
  process.env.ANTHROPIC_API_KEY = key;
  setConfigValue("ANTHROPIC_API_KEY", key);
}

export function deleteApiKey(): void {
  cachedApiKey = null;
  delete process.env.ANTHROPIC_API_KEY;
  removeConfigValue("ANTHROPIC_API_KEY");
}

export function getMaskedKey(): string | null {
  const key = getApiKey();
  if (!key) return null;
  if (key.length <= 11) return "****";
  return key.slice(0, 7) + "..." + key.slice(-4);
}

// --- Token management ---

export function getToken(key: TokenKey): string | null {
  if (tokenCache[key]) return tokenCache[key];
  const val = process.env[key] || readConfig()[key] || null;
  if (val) tokenCache[key] = val;
  return val;
}

export function setToken(key: TokenKey, value: string): void {
  tokenCache[key] = value;
  process.env[key] = value;
  setConfigValue(key, value);
}

export function deleteToken(key: TokenKey): void {
  delete tokenCache[key];
  delete process.env[key];
  removeConfigValue(key);
}

export function getTokenStatus(): Record<TokenKey, boolean> {
  return {
    VERCEL_TOKEN: !!getToken("VERCEL_TOKEN"),
    SUPABASE_ACCESS_TOKEN: !!getToken("SUPABASE_ACCESS_TOKEN"),
    GITHUB_TOKEN: !!getToken("GITHUB_TOKEN"),
  };
}
