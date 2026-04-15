import { NextResponse } from "next/server";
import { spawnSync } from "child_process";

interface ToolStatus {
  installed: boolean;
  version: string | null;
}

function getFreshPathOnWindows(): string {
  const result = spawnSync("powershell", [
    "-command",
    "[System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')",
  ], {
    shell: true,
    timeout: 5000,
    encoding: "utf-8",
  });
  return (result.stdout || "").trim() || process.env.PATH || "";
}

function checkTool(name: string, isWin: boolean, env?: NodeJS.ProcessEnv): ToolStatus {
  const finder = isWin ? "where" : "which";
  const result = spawnSync(finder, [name], {
    shell: true,
    timeout: 5000,
    encoding: "utf-8",
    ...(env ? { env } : {}),
  });

  if (result.status !== 0) {
    return { installed: false, version: null };
  }

  const versionResult = spawnSync(name, ["--version"], {
    shell: true,
    timeout: 5000,
    encoding: "utf-8",
    ...(env ? { env } : {}),
  });
  const version = (versionResult.stdout || "").trim().split("\n")[0] || null;
  return { installed: true, version };
}

export async function GET() {
  const platform = process.env.TEAMMAKER_PLATFORM || process.platform;
  const isWin = platform === "win32";

  // On Windows, read fresh PATH from registry to detect newly installed tools
  const env = isWin
    ? { ...process.env, PATH: getFreshPathOnWindows() }
    : undefined;

  const tools = {
    node: checkTool("node", isWin, env),
    npm: checkTool("npm", isWin, env),
    git: checkTool("git", isWin, env),
  };

  return NextResponse.json({ platform, tools });
}
