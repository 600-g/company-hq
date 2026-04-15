import { NextResponse } from "next/server";
import {
  getApiKey,
  setApiKey,
  deleteApiKey,
  getMaskedKey,
} from "@/lib/server/config";

export async function GET() {
  const maskedKey = getMaskedKey();
  return NextResponse.json({
    hasKey: !!getApiKey(),
    maskedKey,
  });
}

export async function PUT(request: Request) {
  const { apiKey } = await request.json();
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return NextResponse.json(
      { error: "Please enter a valid API key" },
      { status: 400 },
    );
  }
  setApiKey(apiKey.trim());
  return NextResponse.json({ success: true, maskedKey: getMaskedKey() });
}

export async function DELETE() {
  deleteApiKey();
  return NextResponse.json({ success: true });
}
