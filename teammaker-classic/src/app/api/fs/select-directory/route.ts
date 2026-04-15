import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Directory selection is not supported in browser mode. Please enter the path manually.",
      supported: false,
    },
    { status: 501 },
  );
}
