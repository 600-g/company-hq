import { NextResponse } from "next/server";
import fs from "fs/promises";

export async function POST(request: Request) {
  const { filePath }: { filePath: string } = await request.json();

  if (!filePath) {
    return NextResponse.json(
      { error: "filePath is required" },
      { status: 400 },
    );
  }

  try {
    const content = await fs.readFile(filePath, "utf-8");
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json(
      { error: "Cannot read file" },
      { status: 404 },
    );
  }
}
