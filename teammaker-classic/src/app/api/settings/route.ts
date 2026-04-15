import { NextResponse } from "next/server";
import {
  getApiKey,
  setApiKey,
  deleteApiKey,
  getMaskedKey,
} from "@/lib/server/config";

export async function GET() {
  const maskedKey = getMaskedKey();
  // Max 플랜 모드면 키 없이도 hasKey:true 로 응답 (온보딩 스킵)
  const useMaxPlan = process.env.USE_MAX_PLAN === "1";
  return NextResponse.json({
    hasKey: useMaxPlan ? true : !!getApiKey(),
    maskedKey: useMaxPlan ? "MAX_PLAN" : maskedKey,
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
