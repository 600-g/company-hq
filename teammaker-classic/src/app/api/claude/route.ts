import { NextResponse } from "next/server";
import { getApiKey } from "@/lib/server/config";
import { executeTool } from "@/lib/server/tool-executor";
import { callClaudeMaxPlan, callClaudeMaxPlanStream } from "@/lib/server/claude-cli-bridge";

import { DEFAULT_MODEL } from "@/lib/models";

// Max 플랜(claude CLI) 사용 모드 — `USE_MAX_PLAN=1` 환경변수로 활성
const USE_MAX_PLAN = process.env.USE_MAX_PLAN === "1";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MAX_TOOL_ITERATIONS = 200;

interface ContentBlock {
  type: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  text?: string;
}

interface AnthropicResponse {
  content: ContentBlock[];
  stop_reason: string;
}

const MAX_RETRIES = 3;

async function callAnthropic(
  apiKey: string,
  messages: unknown[],
  systemPrompt?: string,
  maxTokens = 1024,
  tools?: unknown[],
  modelOverride?: string,
): Promise<AnthropicResponse> {
  // Apply cache_control to system prompt
  const system = systemPrompt
    ? [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ]
    : undefined;

  // Apply cache_control to the last tool entry
  const cachedTools =
    tools && tools.length > 0
      ? tools.map((tool, i) =>
          i === tools.length - 1
            ? {
                ...(tool as Record<string, unknown>),
                cache_control: { type: "ephemeral" },
              }
            : tool,
        )
      : undefined;

  // Add web_search as a server tool (only when tools are present)
  const allTools = cachedTools
    ? [...cachedTools, { type: "web_search_20250305" as const, name: "web_search" as const, max_uses: 5 }]
    : undefined;

  const requestBody = JSON.stringify({
    model: modelOverride || DEFAULT_MODEL,
    max_tokens: maxTokens,
    cache_control: { type: "ephemeral" },
    system,
    messages,
    ...(allTools ? { tools: allTools } : {}),
  });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: requestBody,
    });

    const data = await response.json();

    // Log cache usage
    const usage = data.usage;
    if (usage) {
      const cached = usage.cache_read_input_tokens || 0;
      const created = usage.cache_creation_input_tokens || 0;
      const uncached = usage.input_tokens || 0;
      const total = cached + created + uncached;
      const cacheRate = total > 0 ? Math.round((cached / total) * 100) : 0;
      console.log(
        `[cache] input: ${uncached} | cache_read: ${cached} | cache_created: ${created} | cache_rate: ${cacheRate}% | output: ${usage.output_tokens || 0}`,
      );
    }

    // Log rate limit headers
    const rlHeaders = {
      rpm_remaining: response.headers.get(
        "anthropic-ratelimit-requests-remaining",
      ),
      itpm_remaining: response.headers.get(
        "anthropic-ratelimit-input-tokens-remaining",
      ),
      otpm_remaining: response.headers.get(
        "anthropic-ratelimit-output-tokens-remaining",
      ),
      retry_after: response.headers.get("retry-after"),
    };
    console.log(
      `[rate-limit] ${response.status} | rpm_remaining: ${rlHeaders.rpm_remaining} | itpm_remaining: ${rlHeaders.itpm_remaining} | otpm_remaining: ${rlHeaders.otpm_remaining}${rlHeaders.retry_after ? ` | retry-after: ${rlHeaders.retry_after}s` : ""}`,
    );

    // 429 (rate limit) / 529 (overloaded) → retry
    if (
      (response.status === 429 || response.status === 529) &&
      attempt < MAX_RETRIES
    ) {
      const retryAfter = parseInt(rlHeaders.retry_after || "0", 10);
      const delay = Math.max(retryAfter * 1000, (attempt + 1) * 5000);
      console.log(
        `[retry] ${response.status} received, retrying in ${delay / 1000}s (${attempt + 1}/${MAX_RETRIES})`,
      );
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    if (!response.ok) {
      console.error(`[rate-limit] error detail:`, JSON.stringify(data));
      throw { status: response.status, data };
    }

    return data as AnthropicResponse;
  }

  // All retries exhausted
  throw {
    status: 529,
    data: { error: { type: "overloaded_error", message: "Max retries exceeded" } },
  };
}

export async function POST(request: Request) {
  const body = await request.json();
  const {
    messages,
    systemPrompt,
    maxTokens = 1024,
    tools,
    toolContext,
    maxToolIterations,
    model,
  } = body;

  // ── Max 플랜 모드: claude CLI subprocess 로 우회 (BYO-API 키 불필요) ──
  if (USE_MAX_PLAN) {
    const cwd = (toolContext && (toolContext as { cwd?: string }).cwd) || undefined;
    // 도구가 있으면 stream-json 으로 시각효과까지, 없으면 단순 호출
    if (tools && tools.length > 0) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (data: unknown) => {
            controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
          };
          try {
            for await (const evt of callClaudeMaxPlanStream(messages, {
              systemPrompt,
              cwd,
              modelOverride: model,
            })) {
              if (evt.kind === "tool") {
                send({ type: "tool", tool: evt.toolName, detail: evt.toolDetail, step: evt.step });
              } else if (evt.kind === "result") {
                send({
                  type: "result",
                  data: {
                    content: [{ type: "text", text: evt.finalText }],
                    stop_reason: "end_turn",
                    writtenFiles: evt.writtenFiles ?? [],
                  },
                });
              } else if (evt.kind === "error") {
                send({ type: "error", status: 500, data: { error: { type: "max_plan_error", message: evt.error } } });
              }
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            send({ type: "error", status: 500, data: { error: { type: "max_plan_error", message: msg } } });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache",
        },
      });
    }
    try {
      const data = await callClaudeMaxPlan(messages, {
        systemPrompt,
        cwd,
        modelOverride: model,
      });
      return NextResponse.json(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: { type: "max_plan_error", message: msg } },
        { status: 500 },
      );
    }
  }

  // ── 기본: Anthropic API 키 모드 ──
  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "API key is not configured" },
      { status: 401 },
    );
  }

  // No tools → simple pass-through
  if (!tools || tools.length === 0) {
    try {
      const data = await callAnthropic(
        apiKey,
        messages,
        systemPrompt,
        maxTokens,
        undefined,
        model,
      );
      return NextResponse.json(data);
    } catch (err: unknown) {
      const error = err as { status: number; data: unknown };
      return NextResponse.json(error.data, { status: error.status });
    }
  }

  // Tool use loop — stream tool events in real-time via NDJSON
  const iterationLimit = maxToolIterations || MAX_TOOL_ITERATIONS;
  console.log(`[agent] tool loop started (max ${iterationLimit} iterations)`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      const currentMessages = [...messages];
      const writtenFiles: { path: string; content: string }[] = [];
      let iterations = 0;

      while (iterations < iterationLimit) {
        iterations++;

        let response: AnthropicResponse;
        try {
          response = await callAnthropic(
            apiKey,
            currentMessages,
            systemPrompt,
            maxTokens,
            tools,
            model,
          );
        } catch (err: unknown) {
          const error = err as { status: number; data: unknown };
          send({ type: "error", status: error.status, data: error.data });
          controller.close();
          return;
        }

        // pause_turn: server tool (e.g. web search) executed — continue
        if (response.stop_reason === "pause_turn") {
          console.log(`[agent][${iterations}/${iterationLimit}] ⏸ pause_turn — continuing`);
          currentMessages.push(
            { role: "assistant", content: response.content },
          );
          continue;
        }

        // If no tool use, return final response
        if (response.stop_reason !== "tool_use") {
          console.log(
            `[agent] done (${iterations} iterations, ${writtenFiles.length} files written)`,
          );
          send({ type: "result", data: { ...response, writtenFiles } });
          controller.close();
          return;
        }

        // Execute tool calls (skip server tools like web_search — handled by Anthropic)
        const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
        const serverToolBlocks = response.content.filter((b) => b.type === "server_tool_use" || b.type === "server_tool_result");
        if (serverToolBlocks.length > 0) {
          const serverToolNames = serverToolBlocks.map((b) => b.name).join(", ");
          console.log(`[agent][${iterations}/${iterationLimit}] 🔍 ${serverToolNames} (server-side)`);
        }

        // Only server tools present, no client tools — pass through and continue
        if (toolUseBlocks.length === 0 && serverToolBlocks.length > 0) {
          currentMessages.push(
            { role: "assistant", content: response.content },
          );
          continue;
        }

        const toolResults: {
          type: "tool_result";
          tool_use_id: string;
          content: string;
        }[] = [];

        for (const block of toolUseBlocks) {
          const input = (block.input || {}) as Record<string, unknown>;
          const toolName = block.name || "unknown";
          let detail = "";
          if (toolName === "write_file") {
            detail = input.path as string;
          } else if (toolName === "run_command") {
            detail = input.command as string;
          } else if (toolName === "read_file") {
            detail = input.path as string;
          } else if (toolName === "list_directory") {
            detail = (input.path as string) || ".";
          }

          // Send real-time tool event
          send({ type: "tool", tool: toolName, detail, step: iterations });

          const prefix = `[agent][${iterations}/${iterationLimit}]`;
          const icons: Record<string, string> = {
            write_file: "📝", run_command: "▶", read_file: "📖", list_directory: "📁",
          };
          console.log(`${prefix} ${icons[toolName] || "🔧"} ${toolName}${detail ? `: ${detail}` : ""}`);

          const result = await executeTool(block.name!, input, {
            workingDirectory: toolContext?.workingDirectory || process.cwd(),
            previousArtifacts: toolContext?.previousArtifacts || [],
          });

          if (block.name === "write_file" && input.path && input.content) {
            writtenFiles.push({
              path: input.path as string,
              content: input.content as string,
            });
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id!,
            content: result,
          });
        }

        currentMessages.push(
          { role: "assistant", content: response.content },
          { role: "user", content: toolResults },
        );
      }

      // Max iterations reached
      try {
        const finalResponse = await callAnthropic(
          apiKey,
          currentMessages,
          systemPrompt,
          maxTokens,
          undefined,
          model,
        );
        send({ type: "result", data: { ...finalResponse, writtenFiles } });
      } catch (err: unknown) {
        const error = err as { status: number; data: unknown };
        send({ type: "error", status: error.status, data: error.data });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
