import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", "dist", ".cache",
  "__pycache__", ".turbo", ".vercel", "build", "out",
]);

const TEXT_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".html",
  ".md", ".mjs", ".cjs", ".py", ".yaml", ".yml", ".toml",
  ".txt", ".svg", ".sh", ".env",
]);

export async function POST(request: Request) {
  const { dirPath }: { dirPath: string } = await request.json();

  if (!dirPath) {
    return NextResponse.json(
      { error: "dirPath is required" },
      { status: 400 },
    );
  }

  const results: Array<{ title: string; content: string; language: string }> = [];

  async function walk(dir: string, prefix: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          await walk(
            path.join(dir, entry.name),
            prefix ? `${prefix}/${entry.name}` : entry.name,
          );
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (TEXT_EXTS.has(ext)) {
          try {
            const content = await fs.readFile(
              path.join(dir, entry.name),
              "utf-8",
            );
            if (content.length <= 50000) {
              const filePath = prefix
                ? `${prefix}/${entry.name}`
                : entry.name;
              results.push({
                title: filePath,
                content,
                language: ext.slice(1),
              });
            }
          } catch {
            // skip unreadable
          }
        }
      }
    }
  }

  try {
    await walk(dirPath, "");
    return NextResponse.json({ files: results });
  } catch {
    return NextResponse.json(
      { error: "Cannot read directory" },
      { status: 404 },
    );
  }
}
