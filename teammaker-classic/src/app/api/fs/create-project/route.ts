import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";

export async function POST(request: Request) {
  const { projectName }: { projectName: string } = await request.json();

  if (!projectName) {
    return NextResponse.json(
      { error: "projectName is required" },
      { status: 400 },
    );
  }

  const dirPath = path.join(os.homedir(), ".team-maker", "workspaces", projectName);
  await fs.mkdir(dirPath, { recursive: true });

  return NextResponse.json({ dirPath });
}
