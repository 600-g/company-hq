import { NextResponse } from "next/server";
import { getToken } from "@/lib/server/config";

const SUPABASE_API = "https://api.supabase.com/v1";

export async function POST(request: Request) {
  const { projectName } = await request.json();

  const accessToken = getToken("SUPABASE_ACCESS_TOKEN");
  if (!accessToken) {
    return NextResponse.json(
      { error: "Supabase token is not configured. Please enter it in the settings page." },
      { status: 400 },
    );
  }

  const name = (projectName || `teammaker-${Date.now()}`).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);

  try {
    // Get organization ID first
    const orgsRes = await fetch(`${SUPABASE_API}/organizations`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!orgsRes.ok) {
      const orgsErr = await orgsRes.text();
      return NextResponse.json(
        { error: `Supabase authentication failed: ${orgsErr}` },
        { status: 401 },
      );
    }

    const orgs = await orgsRes.json();
    if (!orgs.length) {
      return NextResponse.json(
        { error: "No Supabase organization found. Please create one in the Supabase dashboard." },
        { status: 400 },
      );
    }

    const orgId = orgs[0].id;

    // Create project
    const createRes = await fetch(`${SUPABASE_API}/projects`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organization_id: orgId,
        name,
        region: "ap-northeast-1", // Tokyo (closest to Korea)
        plan: "free",
        db_pass: crypto.randomUUID().replace(/-/g, "").slice(0, 20),
      }),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();

      // Check for free tier limit
      if (errBody.includes("limit") || errBody.includes("exceed") || createRes.status === 402) {
        return NextResponse.json(
          {
            error: "Supabase free project limit (2) exceeded. Please delete an existing project or upgrade to Pro.",
            dashboardUrl: "https://supabase.com/dashboard/projects",
          },
          { status: 402 },
        );
      }

      return NextResponse.json(
        { error: `Supabase project creation failed: ${errBody}` },
        { status: createRes.status },
      );
    }

    const project = await createRes.json();

    // Wait for project to be ready (poll status)
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));

      const statusRes = await fetch(`${SUPABASE_API}/projects/${project.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.status === "ACTIVE_HEALTHY") {
          ready = true;
          break;
        }
      }
    }

    if (!ready) {
      return NextResponse.json(
        { error: "Supabase project did not become ready in time. Please try again later." },
        { status: 504 },
      );
    }

    // Get API keys
    const keysRes = await fetch(`${SUPABASE_API}/projects/${project.id}/api-keys`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let anonKey = "";
    let serviceRoleKey = "";

    if (keysRes.ok) {
      const keys = await keysRes.json();
      anonKey = keys.find((k: { name: string }) => k.name === "anon")?.api_key || "";
      serviceRoleKey = keys.find((k: { name: string }) => k.name === "service_role")?.api_key || "";
    }

    const projectUrl = `https://${project.id}.supabase.co`;

    return NextResponse.json({
      success: true,
      projectId: project.id,
      projectUrl,
      anonKey,
      serviceRoleKey,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error creating Supabase project" },
      { status: 500 },
    );
  }
}
