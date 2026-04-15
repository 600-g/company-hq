import { NextResponse } from "next/server";
import { spawn } from "child_process";

export async function POST(request: Request) {
  const { tool } = await request.json();

  if (!["node", "git"].includes(tool)) {
    return NextResponse.json({ error: "Invalid tool" }, { status: 400 });
  }

  const platform = process.env.TEAMMAKER_PLATFORM || process.platform;
  const isWin = platform === "win32";

  let command: string;
  let args: string[];

  if (isWin) {
    if (tool === "node") {
      command = "winget";
      args = ["install", "OpenJS.NodeJS.LTS", "--accept-source-agreements", "--accept-package-agreements"];
    } else {
      command = "winget";
      args = ["install", "Git.Git", "--accept-source-agreements", "--accept-package-agreements"];
    }
  } else {
    command = "brew";
    args = ["install", tool === "node" ? "node" : "git"];
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (type: string, data: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));
      };

      const proc = spawn(command, args, {
        shell: true,
        env: {
          ...process.env,
          PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin`,
        },
      });

      proc.stdout?.on("data", (chunk) => {
        send("stdout", chunk.toString());
      });

      proc.stderr?.on("data", (chunk) => {
        send("stderr", chunk.toString());
      });

      proc.on("close", (code) => {
        send("exit", String(code ?? 1));
        controller.close();
      });

      proc.on("error", (err) => {
        send("error", err.message);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
