import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function POST(request: Request) {
  const {
    dirPath,
    artifacts,
  }: {
    dirPath: string;
    artifacts: Array<{
      title: string;
      content: string;
      type: string;
      language?: string;
    }>;
  } = await request.json();

  if (!dirPath || !artifacts) {
    return NextResponse.json(
      { error: "dirPath and artifacts are required" },
      { status: 400 },
    );
  }

  for (const artifact of artifacts) {
    const filename =
      artifact.type === "code"
        ? artifact.title
        : `docs/${artifact.title.endsWith(".md") ? artifact.title : artifact.title + ".md"}`;
    const fullPath = path.join(dirPath, filename);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, artifact.content, "utf-8");
  }

  return NextResponse.json({ success: true });
}
