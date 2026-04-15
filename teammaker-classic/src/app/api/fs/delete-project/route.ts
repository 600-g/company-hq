import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";

export async function POST(request: Request) {
  const { dirPath } = await request.json();

  if (!dirPath) {
    return NextResponse.json(
      { error: "dirPath is required" },
      { status: 400 },
    );
  }

  // Safety check: only allow deletion under ~/.team-maker/workspaces/
  const allowedBase = path.join(os.homedir(), ".team-maker", "workspaces");
  const resolved = path.resolve(dirPath);
  if (!resolved.startsWith(allowedBase) || resolved === allowedBase) {
    return NextResponse.json(
      { error: "Path not allowed" },
      { status: 403 },
    );
  }

  try {
    await fs.rm(resolved, { recursive: true, force: true });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete folder" },
      { status: 500 },
    );
  }
}
