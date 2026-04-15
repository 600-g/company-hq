/**
 * Server-side tool executor
 * Module that runs actual tools when Claude API tool use calls are received
 */

import fs from "fs/promises";
import path from "path";
import { execSync } from "child_process";

const COMMAND_ALLOWLIST = [
  "npm",
  "npx",
  "node",
  "tsc",
  "eslint",
  "prettier",
  "next",
  "cat",
  "ls",
  "pwd",
];

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  ".cache",
  "__pycache__",
  ".turbo",
  ".vercel",
  "build",
  "out",
]);

interface ToolContext {
  workingDirectory: string;
  previousArtifacts: { type: string; title: string; content: string; language?: string }[];
}

function sanitizePath(basePath: string, relativePath: string): string {
  const resolved = path.resolve(basePath, relativePath);
  if (!resolved.startsWith(path.resolve(basePath))) {
    throw new Error("Access denied: path is outside allowed directory");
  }
  return resolved;
}

async function readFile(
  basePath: string,
  relativePath: string,
): Promise<string> {
  const filePath = sanitizePath(basePath, relativePath);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    if (content.length > 50000) {
      return content.slice(0, 50000) + "\n... (truncated at 50000 chars)";
    }
    return content;
  } catch {
    return `Cannot read file: ${relativePath}`;
  }
}

async function listDirectory(
  basePath: string,
  relativePath: string,
): Promise<string> {
  const dirPath = sanitizePath(basePath, relativePath);
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const items = entries
      .filter((e) => !SKIP_DIRS.has(e.name) && !e.name.startsWith("."))
      .map((e) => (e.isDirectory() ? `📁 ${e.name}/` : `📄 ${e.name}`))
      .sort();
    return items.length > 0 ? items.join("\n") : "(empty directory)";
  } catch {
    return `Cannot read directory: ${relativePath}`;
  }
}

function runSafeCommand(command: string, cwd: string): string {
  // Skip env var prefixes like "TURBOPACK=0 npm run build"
  const words = command.trim().split(/\s+/);
  const firstWord = words.find((w) => !w.includes("=")) || words[0];
  if (!COMMAND_ALLOWLIST.includes(firstWord)) {
    return `Command not allowed: ${firstWord}. Allowed: ${COMMAND_ALLOWLIST.join(", ")}`;
  }

  // Extend timeout for long-running commands like project initialization
  const isLongRunning = /create-next-app|create-react-app|create-vite|npm\s+install|npm\s+i\b/.test(command);
  const timeout = isLongRunning ? 120000 : 30000;

  try {
    const result = execSync(command, {
      cwd,
      timeout,
      maxBuffer: 1024 * 1024,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // Remove NODE_ENV when running build commands (let Next.js set it automatically)
        ...(/\b(build|next build)\b/.test(command) ? { NODE_ENV: undefined } : {}),
      } as NodeJS.ProcessEnv,
    });
    const output = result.toString();
    if (output.length > 10000) {
      return output.slice(0, 10000) + "\n... (output truncated)";
    }
    return output || "(no output)";
  } catch (err: unknown) {
    const error = err as { stderr?: string; stdout?: string; message?: string };
    const stderr = error.stderr || "";
    const stdout = error.stdout || "";
    const errorOutput = stderr || stdout || error.message || "Unknown error";
    console.error(`[agent-cmd-fail] ${command.slice(0, 80)}\n${errorOutput.slice(0, 500)}`);
    return `Command failed:\n${errorOutput}`.slice(0, 5000);
  }
}

async function writeFile(
  basePath: string,
  relativePath: string,
  content: string,
): Promise<string> {
  const filePath = sanitizePath(basePath, relativePath);
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    return `File saved: ${relativePath}`;
  } catch {
    return `Cannot save file: ${relativePath}`;
  }
}

function formatArtifacts(
  artifacts: ToolContext["previousArtifacts"],
  filter?: string,
): string {
  const filtered =
    filter && filter !== "all"
      ? artifacts.filter((a) => a.type === filter)
      : artifacts;

  if (filtered.length === 0) {
    return "No previous artifacts found.";
  }

  return filtered
    .map((a) => {
      const header =
        a.type === "code"
          ? `[${a.title}] (${a.language || "code"})`
          : `[${a.title}] (${a.type})`;
      const content =
        a.content.length > 3000
          ? a.content.slice(0, 3000) + "\n... (truncated)"
          : a.content;
      return `${header}\n${content}`;
    })
    .join("\n\n---\n\n");
}

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolContext,
): Promise<string> {
  switch (toolName) {
    case "read_file":
      return await readFile(
        context.workingDirectory,
        input.path as string,
      );
    case "list_directory":
      return await listDirectory(
        context.workingDirectory,
        (input.path as string) || ".",
      );
    case "write_file":
      return await writeFile(
        context.workingDirectory,
        input.path as string,
        input.content as string,
      );
    case "run_command":
      return runSafeCommand(
        input.command as string,
        context.workingDirectory,
      );
    case "read_previous_artifacts":
      return formatArtifacts(
        context.previousArtifacts,
        input.filter as string | undefined,
      );
    default:
      return `Unknown tool: ${toolName}`;
  }
}
