import type { Artifact } from "@/types/artifact";

export async function detectRunCommand(
  dir: string,
  artifacts: Artifact[],
): Promise<string> {
  // 1. Check artifacts first
  const pkgArtifact = artifacts.find(
    (a) => a.type === "code" && a.title === "package.json",
  );

  let pkgContent: string | null = pkgArtifact?.content ?? null;

  // 2. Fallback: read package.json from disk via API
  if (!pkgContent) {
    try {
      const res = await fetch("/api/fs/read-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: `${dir}/package.json` }),
      });
      if (res.ok) {
        const data = await res.json();
        pkgContent = data.content;
      }
    } catch {
      // file doesn't exist
    }
  }

  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent);
      const hasDev = !!pkg.scripts?.dev;
      const hasBuild = !!pkg.scripts?.build;

      if (hasBuild && hasDev) return "npm install && npm run build && npm run dev";
      if (hasDev) return "npm install && npm run dev";
      return "npm install && npm start";
    } catch {
      return "npm install && npm start";
    }
  }

  // 3. Check for other file types
  const htmlFile =
    artifacts.find((a) => a.type === "code" && a.title.endsWith(".html"));
  if (htmlFile) return `open "${htmlFile.title}"`;

  const pyFile =
    artifacts.find((a) => a.type === "code" && a.title.endsWith(".py"));
  if (pyFile) return `python3 "${pyFile.title}"`;

  return "ls -la";
}
