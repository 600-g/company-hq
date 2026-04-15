import { NextResponse } from "next/server";
import {
  getTokenStatus,
  getToken,
  setToken,
  deleteToken,
  isAllowedTokenKey,
} from "@/lib/server/config";

export async function GET() {
  return NextResponse.json({ tokens: getTokenStatus() });
}

export async function PUT(request: Request) {
  const { key, value } = await request.json();

  if (!key || !isAllowedTokenKey(key)) {
    return NextResponse.json(
      { error: "Token key not allowed" },
      { status: 400 },
    );
  }

  if (!value || typeof value !== "string" || !value.trim()) {
    return NextResponse.json(
      { error: "Please enter a valid token value" },
      { status: 400 },
    );
  }

  setToken(key, value.trim());
  return NextResponse.json({ success: true, key });
}

export async function DELETE(request: Request) {
  const { key } = await request.json();

  if (!key || !isAllowedTokenKey(key)) {
    return NextResponse.json(
      { error: "Token key not allowed" },
      { status: 400 },
    );
  }

  deleteToken(key);
  return NextResponse.json({ success: true, key });
}
