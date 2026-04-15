import { NextResponse } from "next/server";
import { getToken } from "@/lib/server/config";

export async function POST(request: Request) {
  const { repoName } = await request.json();

  if (!repoName) {
    return NextResponse.json(
      { error: "Repository name is required" },
      { status: 400 },
    );
  }

  const githubToken = getToken("GITHUB_TOKEN");
  if (!githubToken) {
    return NextResponse.json(
      { error: "GitHub token is not configured" },
      { status: 400 },
    );
  }

  try {
    // 1. Get GitHub username
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${githubToken}` },
    });
    if (!userRes.ok) {
      return NextResponse.json(
        { error: "GitHub authentication failed. Please check your token." },
        { status: 401 },
      );
    }
    const user = await userRes.json();
    const username = user.login;

    // 2. Create repo
    const createRes = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: repoName,
        private: true,
        auto_init: false,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      const isAlreadyExists = createRes.status === 422 && err.errors?.some((e: { message?: string }) => e.message?.includes("already exists"));
      if (!isAlreadyExists) {
        return NextResponse.json(
          { error: `GitHub repo creation failed: ${err.message}` },
          { status: createRes.status },
        );
      }
    }

    const githubUrl = `https://github.com/${username}/${repoName}`;
    console.log(`[github] repo created: ${githubUrl}`);

    return NextResponse.json({
      success: true,
      githubUrl,
      username,
      repoName,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error during GitHub integration" },
      { status: 500 },
    );
  }
}
