import { NextResponse } from "next/server";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { getToken } from "@/lib/server/config";

interface DeployStep {
  step: string;
  status: "success" | "error";
  detail: string;
}

export async function POST(request: Request) {
  const body = await request.json();
  const cwd = body.cwd || body.projectDir;
  let projectName = body.projectName || "teammaker-project";
  const githubRepo: string | undefined = body.githubRepo; // "username/repo-name"

  if (!cwd || typeof cwd !== "string") {
    return NextResponse.json(
      {
        success: false,
        steps: [{ step: "Verify project", status: "error", detail: "Project path is required" }],
        error: "Project path is required",
      },
      { status: 400 },
    );
  }

  const vercelToken = getToken("VERCEL_TOKEN");
  if (!vercelToken) {
    return NextResponse.json(
      {
        success: false,
        steps: [{ step: "Verify token", status: "error", detail: "Vercel token is not configured" }],
        error: "Vercel token is not configured. Please enter it in the settings page.",
      },
      { status: 400 },
    );
  }

  const steps: DeployStep[] = [];

  // Step 1: Verify project directory
  if (!fs.existsSync(cwd)) {
    steps.push({ step: "Verify project", status: "error", detail: `Path not found: ${cwd}` });
    return NextResponse.json({ success: false, steps }, { status: 400 });
  }
  steps.push({ step: "Verify project", status: "success", detail: cwd });

  // Step 2: Read env vars from project .env.local for Vercel API registration
  const envVars: { key: string; value: string }[] = [];
  try {
    const envPath = path.join(cwd, ".env.local");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const lines = content.split("\n").filter((l) => l.includes("=") && !l.startsWith("#"));
      for (const line of lines) {
        const eqIdx = line.indexOf("=");
        if (eqIdx === -1) continue;
        const key = line.slice(0, eqIdx).trim();
        const value = line.slice(eqIdx + 1).trim();
        if (key.startsWith("NEXT_PUBLIC_SUPABASE_") || key.startsWith("SUPABASE_")) {
          envVars.push({ key, value });
        }
      }
    }
  } catch {
    // No project .env.local, skip
  }

  // Step 3: GitHub-linked deployment (if githubRepo is provided)
  if (githubRepo) {
    const githubToken = getToken("GITHUB_TOKEN");
    const teamParam = body.scope ? `?slug=${body.scope}` : "";

    // 3-1. Create Vercel project (GitHub integration)
    steps.push({ step: "Create Vercel project", status: "success", detail: "Linking GitHub..." });

    const createRes = await fetch(`https://api.vercel.com/v11/projects${teamParam}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectName,
        framework: "nextjs",
        gitRepository: {
          type: "github",
          repo: githubRepo,
        },
      }),
    });

    const createData = await createRes.json();

    const alreadyExists = createData.error?.code === "project_already_exists" || createData.error?.message?.includes("already exists");
    if (!createRes.ok && !alreadyExists) {
      steps[steps.length - 1] = { step: "Create Vercel project", status: "error", detail: createData.error?.message || "Project creation failed" };
      return NextResponse.json({ success: false, steps, error: createData.error?.message }, { status: 500 });
    }

    const vercelProjectName = createData.name || projectName;
    steps[steps.length - 1] = { step: "Create Vercel project", status: "success", detail: vercelProjectName };

    // 3-2. Register environment variables
    if (envVars.length > 0) {
      steps.push({ step: "Register env vars", status: "success", detail: "Registering..." });
      const envBody = envVars.map(({ key, value }) => ({
        key,
        value,
        type: "encrypted",
        target: ["production", "preview", "development"],
      }));

      const envRes = await fetch(
        `https://api.vercel.com/v10/projects/${vercelProjectName}/env?upsert=true${teamParam ? `&${teamParam.slice(1)}` : ""}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${vercelToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(envBody),
        },
      );

      if (envRes.ok) {
        steps[steps.length - 1] = { step: "Register env vars", status: "success", detail: `${envVars.length} vars registered` };
      } else {
        const envErr = await envRes.text();
        steps[steps.length - 1] = { step: "Register env vars", status: "error", detail: envErr.slice(0, 200) };
      }
    }

    // 3-3. Git push (triggers Vercel auto-deploy)
    steps.push({ step: "GitHub Push", status: "success", detail: "Uploading code..." });

    const repoUrl = githubToken
      ? `https://${githubToken}@github.com/${githubRepo}.git`
      : `https://github.com/${githubRepo}.git`;
    const cleanUrl = `https://github.com/${githubRepo}.git`;

    const gitEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin`,
    };
    const gitOpts = { cwd, encoding: "utf-8" as const, env: gitEnv, shell: true };

    // Create default .gitignore if missing
    if (!fs.existsSync(path.join(cwd, ".gitignore"))) {
      fs.writeFileSync(path.join(cwd, ".gitignore"), "node_modules\n.next\n.env*.local\n.env\n");
    }

    // Check if git is already initialized
    const isGitRepo = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], gitOpts);
    const alreadyInited = isGitRepo.status === 0;

    if (!alreadyInited) {
      spawnSync("git", ["init"], gitOpts);
      spawnSync("git", ["branch", "-M", "main"], gitOpts);
    }

    // Set remote (URL includes token for push)
    const addRemote = spawnSync("git", ["remote", "add", "origin", repoUrl], gitOpts);
    if (addRemote.status !== 0) {
      spawnSync("git", ["remote", "set-url", "origin", repoUrl], gitOpts);
    }

    // git add + commit
    spawnSync("git", ["add", "."], { ...gitOpts, timeout: 60000 });
    const commitResult = spawnSync("git", ["commit", "--allow-empty", "-m", alreadyInited ? "Deploy from TeamMaker" : "Initial commit from TeamMaker"], { ...gitOpts, timeout: 60000 });
    // Helper to remove token from remote URL (runs even on error)
    const cleanRemoteUrl = () => spawnSync("git", ["remote", "set-url", "origin", cleanUrl], gitOpts);

    if (commitResult.status !== 0) {
      const commitError = commitResult.stderr || commitResult.stdout || "commit failed";
      console.error(`[deploy-github] commit: ${commitError.slice(0, 200)}`);
      cleanRemoteUrl();
      steps[steps.length - 1] = { step: "GitHub Push", status: "error", detail: commitError.slice(0, 200) };
      return NextResponse.json({ success: false, steps, error: commitError }, { status: 500 });
    }

    // git push (try normal push first, retry with force on failure)
    let pushResult = spawnSync("git", ["push", "-u", "origin", "main"], { ...gitOpts, timeout: 60000 });
    if (pushResult.status !== 0) {
      console.log(`[deploy-github] push failed, retrying with force: ${(pushResult.stderr || pushResult.stdout || "").slice(0, 200)}`);
      pushResult = spawnSync("git", ["push", "-u", "origin", "main", "--force"], { ...gitOpts, timeout: 60000 });
    }
    cleanRemoteUrl();

    if (pushResult.status !== 0) {
      const pushError = pushResult.stderr || pushResult.stdout || "push failed";
      console.error(`[deploy-github] push: ${pushError.slice(0, 200)}`);
      steps[steps.length - 1] = { step: "GitHub Push", status: "error", detail: pushError.slice(0, 200) };
      return NextResponse.json({ success: false, steps, error: pushError }, { status: 500 });
    }

    steps[steps.length - 1] = { step: "GitHub Push", status: "success", detail: `github.com/${githubRepo}` };

    // 3-4. Wait for deployment to complete (push triggers auto-deploy)
    steps.push({ step: "Vercel Deploy", status: "success", detail: "Waiting for build..." });

    let deployUrl = `https://${vercelProjectName}.vercel.app`;
    let deployReady = false;

    // Wait briefly for deployment to be created after push
    const pushTimestamp = Date.now();
    await new Promise((r) => setTimeout(r, 5000));

    for (let i = 0; i < 60; i++) {
      try {
        const deploymentsRes = await fetch(
          `https://api.vercel.com/v6/deployments?projectId=${createData.id || vercelProjectName}&limit=5&target=production${teamParam ? `&${teamParam.slice(1)}` : ""}`,
          { headers: { Authorization: `Bearer ${vercelToken}` } },
        );
        if (deploymentsRes.ok) {
          const deploymentsData = await deploymentsRes.json();
          // Find the newest deployment created after our push
          const dep = deploymentsData.deployments?.find(
            (d: { createdAt: number }) => d.createdAt >= pushTimestamp,
          ) ?? null;
          if (dep) {
            if (dep.readyState === "READY") {
              deployReady = true;
              break;
            } else if (dep.readyState === "ERROR") {
              steps[steps.length - 1] = { step: "Vercel Deploy", status: "error", detail: "Build failed" };
              return NextResponse.json({ success: false, steps, error: "Build failed" }, { status: 500 });
            }
          }
        }
      } catch {
        // continue polling
      }
      await new Promise((r) => setTimeout(r, 5000));
    }

    if (!deployReady) {
      steps[steps.length - 1] = { step: "Vercel Deploy", status: "error", detail: "Deployment timed out" };
      return NextResponse.json({ success: false, steps, error: "Deployment timed out" }, { status: 504 });
    }

    // Get production domain
    try {
      const domainsRes = await fetch(
        `https://api.vercel.com/v9/projects/${vercelProjectName}/domains${teamParam}`,
        { headers: { Authorization: `Bearer ${vercelToken}` } },
      );
      if (domainsRes.ok) {
        const domainsData = await domainsRes.json();
        const vercelDomains = (domainsData.domains || [])
          .map((d: { name: string }) => d.name)
          .filter((d: string) => d.endsWith(".vercel.app"));
        if (vercelDomains.length > 0) {
          const shortest = vercelDomains.sort((a: string, b: string) => a.length - b.length)[0];
          deployUrl = `https://${shortest}`;
        }
      }
    } catch {
      // fallback to default
    }

    steps[steps.length - 1] = { step: "Vercel Deploy", status: "success", detail: deployUrl };

    return NextResponse.json({ success: true, steps, deployUrl, url: deployUrl });
  }

  // Step 3b: CLI deployment (no GitHub)
  const baseArgs = ["vercel", "deploy", "--prod", "--token", vercelToken, "--yes"];
  if (envVars.length > 0) {
    for (const { key, value } of envVars) {
      baseArgs.push("-e", `${key}=${value}`);
      if (key.startsWith("NEXT_PUBLIC_")) {
        baseArgs.push("-b", `${key}=${value}`);
      }
    }
    console.log(`[deploy] env vars: ${envVars.length} (${envVars.map(v => v.key).join(", ")})`);
  }

  let scope: string | null = null;
  steps.push({ step: "Vercel Deploy", status: "success", detail: "Running deploy command..." });

  // First attempt
  let args = [...baseArgs];
  const deployEnv = {
    ...process.env,
    VERCEL_TOKEN: vercelToken,
    PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin`,
  };

  let result = spawnSync("npx", args, {
    cwd,
    encoding: "utf-8",
    timeout: 300000,
    env: deployEnv,
    shell: true,
  });

  let stdout = (result.stdout || "").trim();
  let stderr = (result.stderr || "").trim();

  // Auto-detect scope if needed and retry
  if (result.status !== 0) {
    const output = stdout + stderr;
    try {
      const jsonMatch = output.match(/\{[\s\S]*"choices"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.choices?.length > 0) {
          scope = parsed.choices[0].name;
          console.log(`[deploy] scope detected: ${scope}, retrying...`);
          args = [...baseArgs, "--scope", scope!];
          result = spawnSync("npx", args, {
            cwd,
            encoding: "utf-8",
            timeout: 300000,
            env: deployEnv,
            shell: true,
          });
          stdout = (result.stdout || "").trim();
          stderr = (result.stderr || "").trim();
        }
      }
    } catch {
      // Scope detection failed, proceed with original error
    }
  }

  if (result.status !== 0) {
    const errorDetail = stderr || stdout || result.error?.message || "Error during deployment";

    const truncated = errorDetail.length > 500
      ? errorDetail.slice(0, 250) + "\n...\n" + errorDetail.slice(-250)
      : errorDetail;

    steps[steps.length - 1] = { step: "Vercel Deploy", status: "error", detail: truncated };

    return NextResponse.json(
      { success: false, steps, error: errorDetail },
      { status: 500 },
    );
  }

  // Extract deployment URL from output
  const outputLines = stdout.split("\n");
  const deploymentUrlMatch = outputLines
    .map((l) => l.match(/https:\/\/[^\s]+\.vercel\.app/)?.[0])
    .filter(Boolean) as string[];
  const deploymentUrl = deploymentUrlMatch[0] || outputLines[outputLines.length - 1].trim();

  // Try to get the production alias URL via vercel inspect
  let deployUrl = deploymentUrl;
  if (deploymentUrl.includes(".vercel.app")) {
    const inspectArgs = ["vercel", "inspect", deploymentUrl, "--token", vercelToken];
    if (scope) inspectArgs.push("--scope", scope);

    const inspect = spawnSync("npx", inspectArgs, {
      cwd,
      encoding: "utf-8",
      timeout: 15000,
      shell: true,
      env: {
        ...process.env,
        VERCEL_TOKEN: vercelToken,
        PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin`,
      },
    });

    const inspectOutput = (inspect.stdout || "") + (inspect.stderr || "");
    // Find all .vercel.app URLs in the Aliases section
    const allInspectUrls = inspectOutput.match(/https:\/\/[^\s]+\.vercel\.app/g);
    if (allInspectUrls && allInspectUrls.length > 0) {
      // Pick the shortest URL — that's the clean production alias
      deployUrl = allInspectUrls.sort((a, b) => a.length - b.length)[0];
    }
    // Extract Vercel project name from inspect output (e.g. "name  vienna-whale")
    const nameMatch = inspectOutput.match(/name\s+(\S+)/);
    if (nameMatch) {
      projectName = nameMatch[1];
    }
    console.log(`[deploy] vercel project: ${projectName}, scope: ${scope}`);
  }

  steps[steps.length - 1] = { step: "Vercel Deploy", status: "success", detail: deployUrl };

  // Permanently register env vars to the Vercel project via API
  if (envVars.length > 0 && projectName) {
    try {
      const envBody = envVars.map(({ key, value }) => ({
        key,
        value,
        type: "encrypted",
        target: ["production", "preview", "development"],
      }));

      const teamParam = scope ? `&slug=${scope}` : "";
      const envRes = await fetch(
        `https://api.vercel.com/v10/projects/${projectName}/env?upsert=true${teamParam}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${vercelToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(envBody),
        },
      );

      if (envRes.ok) {
        console.log(`[deploy] Registered ${envVars.length} env vars to project`);
        steps.push({ step: "env vars registration", status: "success", detail: `${envVars.length} registered` });
      } else {
        const errText = await envRes.text();
        console.error(`[deploy] env vars registration failed: ${errText}`);
        steps.push({ step: "env vars registration", status: "error", detail: errText.slice(0, 200) });
      }
    } catch (err) {
      console.error(`[deploy] env vars registration error:`, err);
    }
  }

  return NextResponse.json({ success: true, steps, deployUrl, url: deployUrl, output: stdout });
}
