import { NextResponse } from "next/server";
import { killProcess } from "@/lib/server/processes";

export async function POST(request: Request) {
  const { id } = await request.json();

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const killed = killProcess(id);
  return NextResponse.json({ success: killed });
}
