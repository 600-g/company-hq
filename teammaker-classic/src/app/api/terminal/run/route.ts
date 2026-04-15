import { runProcess } from "@/lib/server/processes";

export async function POST(request: Request) {
  const { id, command, cwd } = await request.json();

  if (!id || !command || !cwd) {
    return new Response(
      JSON.stringify({ error: "id, command, and cwd are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      runProcess(id, command, cwd, {
        onStdout(data) {
          if (closed) return;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ stream: "stdout", text: data })}\n\n`,
            ),
          );
        },
        onStderr(data) {
          if (closed) return;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ stream: "stderr", text: data })}\n\n`,
            ),
          );
        },
        onExit(code) {
          if (closed) return;
          closed = true;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ stream: "exit", code })}\n\n`,
            ),
          );
          controller.close();
        },
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
