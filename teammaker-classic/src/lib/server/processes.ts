import { spawn, ChildProcess } from "child_process";

const processes = new Map<string, ChildProcess>();

export interface ProcessCallbacks {
  onStdout: (data: string) => void;
  onStderr: (data: string) => void;
  onExit: (code: number | null) => void;
}

export function runProcess(
  id: string,
  command: string,
  cwd: string,
  callbacks: ProcessCallbacks,
): void {
  // Kill existing process with same ID
  killProcess(id);

  const isWin =
    process.env.TEAMMAKER_PLATFORM === "win32" || process.platform === "win32";
  const shell = isWin
    ? process.env.COMSPEC || "cmd.exe"
    : process.env.SHELL || "/bin/zsh";
  const shellArgs = isWin ? ["/c", command] : ["-li", "-c", command];

  const safeEnvKeys = isWin
    ? [
        "TEMP",
        "TMP",
        "APPDATA",
        "LOCALAPPDATA",
        "USERPROFILE",
        "HOME",
        "HOMEDRIVE",
        "HOMEPATH",
        "USERNAME",
        "SYSTEMROOT",
        "SYSTEMDRIVE",
        "WINDIR",
        "COMSPEC",
        "PATH",
        "PATHEXT",
        "PROGRAMFILES",
        "PROGRAMFILES(X86)",
        "COMMONPROGRAMFILES",
        "LANG",
        "TERM",
      ]
    : ["HOME", "USER", "LANG", "TERM", "SHELL", "PATH"];

  const env: Record<string, string> = {};
  for (const key of safeEnvKeys) {
    if (process.env[key]) {
      env[key] = process.env[key] as string;
    }
  }
  if (!isWin) {
    env.LANG = env.LANG || "en_US.UTF-8";
    env.TERM = env.TERM || "xterm-256color";
  }

  const proc = spawn(shell, shellArgs, {
    cwd,
    env: env as NodeJS.ProcessEnv,
  });
  processes.set(id, proc);

  proc.stdout?.on("data", (data: Buffer) => {
    callbacks.onStdout(data.toString());
  });

  proc.stderr?.on("data", (data: Buffer) => {
    callbacks.onStderr(data.toString());
  });

  proc.on("close", (code) => {
    callbacks.onExit(code);
    processes.delete(id);
  });

  proc.on("error", (err) => {
    callbacks.onStderr(err.message);
    callbacks.onExit(1);
    processes.delete(id);
  });
}

export function killProcess(id: string): boolean {
  const proc = processes.get(id);
  if (proc) {
    proc.kill();
    processes.delete(id);
    return true;
  }
  return false;
}

export function killAll(): void {
  for (const proc of processes.values()) {
    proc.kill();
  }
  processes.clear();
}
