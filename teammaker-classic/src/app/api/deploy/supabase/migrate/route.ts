import { NextResponse } from "next/server";
import { getToken } from "@/lib/server/config";
import fs from "fs";
import path from "path";

export async function POST(request: Request) {
  const body = await request.json();
  const { projectId } = body;

  if (!projectId) {
    return NextResponse.json(
      { error: "Supabase project ID is required" },
      { status: 400 },
    );
  }

  const accessToken = getToken("SUPABASE_ACCESS_TOKEN");
  if (!accessToken) {
    return NextResponse.json(
      { error: "Supabase token is not configured" },
      { status: 400 },
    );
  }

  // SQL can be passed directly or found in project directory
  let sql = body.sql || "";
  if (!sql && body.cwd) {
    const candidates = [
      path.join(body.cwd, "schema.sql"),
      path.join(body.cwd, "supabase", "schema.sql"),
      path.join(body.cwd, "db", "schema.sql"),
      path.join(body.cwd, "sql", "schema.sql"),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        sql = fs.readFileSync(candidate, "utf-8");
        break;
      }
    }
  }

  if (!sql.trim()) {
    return NextResponse.json(
      { error: "No SQL provided and schema.sql file could not be found" },
      { status: 400 },
    );
  }

  try {
    // Execute SQL via Supabase Management API
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectId}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      },
    );

    if (!res.ok) {
      const errBody = await res.text();
      return NextResponse.json(
        { error: `SQL execution failed: ${errBody}` },
        { status: res.status },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error running migration" },
      { status: 500 },
    );
  }
}
