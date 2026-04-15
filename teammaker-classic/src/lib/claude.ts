import type { Artifact } from "@/types/artifact";
import type { ChatMessage } from "@/types/chat";
import type { ToolDefinition } from "@/lib/agent-tools";
import { getToolsForRole } from "@/lib/agent-tools";
import {
  selectSkill,
  selectReferences,
  selectErrorFixReferences,
} from "@/lib/skill-router";
import { DEBUG_MODEL } from "@/lib/models";
import { useSettingsStore } from "@/stores/settingsStore";

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClaudeResponse {
  text: string;
  writtenFiles: { path: string; content: string }[];
}

export interface ToolUseEvent {
  tool: string;
  detail: string;
  step: number;
}

async function callClaude(
  messages: ClaudeMessage[],
  systemPrompt?: string,
  maxTokens = 1024,
  tools?: ToolDefinition[],
  toolContext?: {
    workingDirectory?: string;
    previousArtifacts?: Artifact[];
  },
  maxToolIterations?: number,
  model?: string,
  onToolUse?: (event: ToolUseEvent) => void,
  signal?: AbortSignal,
): Promise<ClaudeResponse> {
  const response = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      systemPrompt,
      maxTokens,
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(toolContext ? { toolContext } : {}),
      ...(maxToolIterations ? { maxToolIterations } : {}),
      model: model || useSettingsStore.getState().selectedModel,
    }),
    signal,
  });

  // If tools are present, handle NDJSON stream response
  if (tools && tools.length > 0 && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let finalResult: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);

        if (event.type === "tool" && onToolUse) {
          onToolUse(event);
        } else if (event.type === "result") {
          finalResult = event.data;
        } else if (event.type === "error") {
          const status = event.status || 500;
          if (status === 401) throw new Error("Invalid API key");
          if (status === 429)
            throw new Error(
              "API rate limit exceeded. Please try again later.",
            );
          throw new Error(`API error (${status})`);
        }
      }
    }

    if (!finalResult) throw new Error("No response received");

    const textBlock = finalResult.content?.find(
      (b: { type: string }) => b.type === "text",
    );
    const text = textBlock?.text || finalResult.content?.[0]?.text || "";
    const writtenFiles = finalResult.writtenFiles || [];
    return { text, writtenFiles };
  }

  // If no tools, handle regular JSON response
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const errorData = error as {
      error?: { type?: string; message?: string } | string;
    };

    if (response.status === 401) {
      const msg =
        typeof errorData.error === "string"
          ? errorData.error
          : errorData.error?.message || "Invalid API key";
      throw new Error(msg);
    }
    if (response.status === 429) {
      throw new Error("API rate limit exceeded. Please try again later.");
    }

    const msg =
      typeof errorData.error === "object" && errorData.error?.message
        ? `[${response.status}] ${errorData.error.message}`
        : `API error (${response.status})`;
    throw new Error(msg);
  }

  const data = await response.json();
  const textBlock = data.content?.find(
    (b: { type: string }) => b.type === "text",
  );
  const text = textBlock?.text || data.content?.[0]?.text || "";
  const writtenFiles = data.writtenFiles || [];
  return { text, writtenFiles };
}

/**
 * Claude call with tool use loop (server-side loop handling)
 * Used when calling directly from the server
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function callClaudeWithTools(
  messages: ClaudeMessage[],
  systemPrompt?: string,
  maxTokens = 1024,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const response = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, systemPrompt, maxTokens }),
  });

  if (!response.ok) {
    throw new Error(`API error (${response.status})`);
  }

  return response.json();
}

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
}

function buildConversationSummary(messages: ChatMessage[]): string {
  const recent = messages.slice(-6);
  if (recent.length === 0) return "";

  return recent
    .filter((m) => m.type === "user" || m.type === "ai")
    .map((m) => {
      if (m.type === "user") return `User: ${m.content}`;
      const artifactInfo = m.artifacts?.length
        ? ` (artifacts: ${m.artifacts.map((a) => a.title).join(", ")})`
        : "";
      return `AI${m.agentName ? ` [${m.agentName}]` : ""}: ${m.content}${artifactInfo}`;
    })
    .join("\n");
}

function buildArtifactContext(messages: ChatMessage[]): string {
  const lastAI = [...messages]
    .reverse()
    .find((m) => m.type === "ai" && m.artifacts?.length);
  if (!lastAI?.artifacts) return "";

  return lastAI.artifacts
    .map((a) => {
      const header =
        a.type === "code"
          ? `[${a.title}] (${a.language || "code"})`
          : `[${a.title}] (${a.type})`;
      return `${header}\n${a.content}`;
    })
    .join("\n\n");
}

export type StorageType = "database" | "localStorage" | "none";

export type RefineResult =
  | { type: "question"; content: string }
  | {
      type: "ready";
      spec: string;
      pipeline: { agentId: string; agentName: string }[];
      projectType?: "web" | "script" | "document" | "other";
      framework?: string;
      storageType?: StorageType;
    }
  | {
      type: "ready_direct";
      spec: string;
      target: {
        agentId: string;
        agentName: string;
      };
      projectType?: "web" | "script" | "document" | "other";
      framework?: string;
      storageType?: StorageType;
    }
  | {
      type: "create_agents";
      spec: string;
      agentsToReuse?: { agentId: string; agentName: string }[];
      agentsToCreate: {
        name: string;
        description: string;
        role: string;
        outputHint?: string;
      }[];
      projectType?: "web" | "script" | "document" | "other";
      framework?: string;
      storageType?: StorageType;
    }
  | { type: "fix_error"; content: string };

export async function refineRequirements(
  conversationHistory: ChatMessage[],
  agents: {
    id: string;
    name: string;
    description: string;
    role: string;
  }[],
  signal?: AbortSignal,
): Promise<RefineResult> {
  const agentList = agents
    .map(
      (t) =>
        `- ID: ${t.id}, Name: ${t.name}, Role: ${t.role}, Description: ${t.description}`,
    )
    .join("\n");

  const hasAgents = agents.length > 0;

  const systemPrompt = `You are the "Manager" — a capable PM overseeing the user's project.
When the user shares an idea, you proactively form a concrete plan and propose it for the user's approval.

## Core Principle: The Manager leads the planning
- Do not ask the user many questions. Make your own judgment and propose a plan first.
- If the user says "make me a calculator" → you decide the features, target audience, and form, then propose a plan.
- The user only needs to give feedback like "looks good", "remove this", or "add this".

## Conversation Flow
- On first request: form a concrete plan yourself and confirm with "Shall we proceed like this?"
- If the user requests changes: incorporate them and re-present the updated plan
- If the user agrees: move straight to "ready"
- Tone: capable and friendly colleague
- Plans should be specific: include key feature list, target users, and technology shape

## Decision Criteria
If the user agrees with the plan or responds positively without changes, decide "ready".
If the first request is already very specific, you may go straight to "ready".

## Available Agents
${hasAgents ? agentList : "(No agents have been created yet)"}
${
  !hasAgents
    ? `
## Auto Agent Creation (Important!)
If there are no agents or no agents suited for the request, respond with the "create_agents" type.
You directly decide and design the required agent configuration.

Examples:
- "Build a shopping mall" → Planning agent + Frontend dev agent + Backend dev agent
- "Write a report" → Research agent + Document writing agent
- "Build an app" → Design agent + Development agent

Agent design rules:
- Each agent must have a clearly distinct role
- 1–4 agents is appropriate (too many is inefficient)
- role should be in the form "~ in charge" (e.g., "Frontend Development")
- description explains specifically what the agent does
- outputHint specifies the form of deliverables
`
    : `
## Auto Agent Creation (Deduplication Rules!)
If no existing agents suit the request, create new ones using "create_agents".
If existing agents are sufficient, use "ready".

### Criteria for reusing existing agents:
- If an existing agent's name and role are the same or very similar to what is needed → reuse (add to agentsToReuse)
- If the name is the same but the role is completely different → create new (add to agentsToCreate)
- If the role does not exist yet → create new (add to agentsToCreate)

Examples:
- Existing "Developer" (Frontend Development) and new request needs frontend → add existing ID to agentsToReuse
- Existing "Developer" (Frontend Development) and new request needs backend → add new agent to agentsToCreate
- When reusing existing agents, include their agent ID in the pipeline
`
}

## Project Type Detection
Analyze the request and determine the project type:
- "web": websites, web apps, dashboards, frontend-based projects
- "script": CLI tools, automation scripts, backend services, etc.
- "document": documents, reports, planning documents, etc.
- "other": anything that doesn't fit the above

For web projects (projectType: "web"), set the default framework to "nextjs".
If the user mentions a specific framework, use that (e.g., "build it with React" → "react").

## Data Storage Method (Important! You must ask the user!)
If a web project may require data storage, you must ask the user before moving to "ready".
This is an exception where you must ask — it affects code implementation and third-party service sign-up.

Use the following message as-is (only change the project name to match context):

"We need to decide how to store the data.

**1. Use a database** — Data can be accessed from any device, and multiple users can use it together. However, you'll need to sign up for Supabase, a free service.

**2. Browser storage** — No sign-up required, ready to use immediately, but data is only kept in that browser. It won't be visible on other devices or browsers.

Which would you prefer?"

When the user chooses, set storageType accordingly:
- "database": when database is chosen. Uses Supabase.
- "localStorage": when browser storage is chosen.
- "none": when no data storage is needed at all (portfolio, landing page, calculator, etc.). No need to ask in this case.

When database is selected, instruct agents to:
- Use the @supabase/supabase-js package to connect to Supabase
- Always generate a "schema.sql" file as an artifact (including DDL statements like CREATE TABLE)
- schema.sql will be automatically run on Supabase after the pipeline completes

## Error Detection
If the user mentions runtime errors in the current project — such as "there's an error", "it's broken", "build failed", "not working" — respond with the "fix_error" type.
This only applies when code has already been generated in a previous conversation. It does not apply to new project requests.

## Routing Decision (Important!)
If artifacts (code, documents, etc.) have already been generated in a previous conversation and the user requests a small change,
do not re-run the entire pipeline — route directly to the relevant agent ("ready_direct").

Direct routing targets:
- Color/text/style changes → the relevant development agent
- Specific component modification → the relevant development agent
- Document content changes → the relevant planning agent
- Design changes → the relevant design agent

Cases requiring the full pipeline:
- Completely new project or feature request
- Large-scale changes requiring collaboration between multiple agents
- First request (no artifacts yet)

## Response Format
Respond with exactly one of the following JSON formats. Do not include any other text.

When a question is needed:
{
  "type": "question",
  "content": "natural question message (in the user's language)"
}

When ready to execute (full pipeline):
{
  "type": "ready",
  "spec": "refined requirements summary (in the user's language, 3–5 sentences)",
  "projectType": "web | script | document | other",
  "framework": "nextjs | react | vue | ...",
  "storageType": "database | localStorage | none",
  "pipeline": [
    { "agentId": "agentId", "agentName": "agentName" }
  ]
}

When routing directly to a specific agent:
{
  "type": "ready_direct",
  "spec": "what to change (in the user's language, 1–2 sentences)",
  "projectType": "web | script | document | other",
  "framework": "nextjs | react | vue | ...",
  "storageType": "database | localStorage | none",
  "target": {
    "agentId": "agentId",
    "agentName": "agentName"
  }
}

When new agents need to be created (existing agents may be reused):
{
  "type": "create_agents",
  "spec": "refined requirements summary (in the user's language, 3–5 sentences)",
  "projectType": "web | script | document | other",
  "framework": "nextjs | react | vue | ...",
  "storageType": "database | localStorage | none",
  "agentsToReuse": [
    { "agentId": "existing agent ID", "agentName": "existing agent name" }
  ],
  "agentsToCreate": [
    {
      "name": "job title (e.g., Planner, Designer, Developer, Writer, Researcher)",
      "description": "description of what this agent does",
      "role": "role name (e.g., Frontend Development)",
      "outputHint": "form of deliverables"
    }
  ]
}

When error fixing is needed:
{
  "type": "fix_error",
  "content": "Got it, I'll analyze the error and fix it!"
}

pipeline rules:
- List agents in execution order as needed for the task
- Example: if design is needed first → design agent → development agent
- If only one agent is needed, list only one
- Do not include agents not in the available agents list

create_agents rules:
- Put reusable existing agents in agentsToReuse and only put newly needed ones in agentsToCreate
- agentsToReuse can be omitted if empty
- Combine agentsToCreate + agentsToReuse and list them in execution order as the pipeline
- Each agent's role must be clearly distinct
- 1–4 new agents is appropriate
- name should be a job title, not "~ Agent" format (e.g., Planner, Designer, Developer, Writer, QA)`;

  const claudeMessages: ClaudeMessage[] = conversationHistory
    .filter((m) => m.type === "user" || m.type === "ai")
    .map((m) => ({
      role: (m.type === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    }));

  const { text: raw } = await callClaude(
    claudeMessages,
    systemPrompt,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    signal,
  );
  try {
    return JSON.parse(extractJSON(raw));
  } catch {
    return { type: "question" as const, content: raw.trim() };
  }
}

export async function generateAgentConfig(
  agentName: string,
  agentDescription: string,
): Promise<{
  role: string;
  description: string;
  outputHint?: string;
  steps?: string[];
}> {
  const systemPrompt = `You are an expert in designing AI agent roles. You must design a single AI agent that matches the role described by the user.

Respond only in the following JSON format. Do not include any other text.

{
  "role": "role name (in the user's language, concise)",
  "description": "plain-language explanation of what this agent does (in the user's language, 1-2 sentences). Must cover all responsibilities of the agent.",
  "outputHint": "form of deliverables this agent produces (e.g., 'design docs, code, tests', 'marketing strategy, content')",
  "steps": ["Step 1 description", "Step 2 description", "Step 3 description"]
}

Rules:
- A single agent handles all given roles in an integrated manner
- Role name should be in the form "~ in charge" (e.g., "Marketing Director")
- Description should be in plain language that non-developers can understand
- outputHint should specifically list the deliverables to be produced (comma-separated, 2–4 items)
- steps should list the stages the agent follows to complete work, in order (2–4 stages, each a short sentence)`;

  const { text: result } = await callClaude(
    [
      {
        role: "user",
        content: `Agent name: ${agentName}\nAgent description: ${agentDescription}\n\nPlease design this agent.`,
      },
    ],
    systemPrompt,
  );

  const config: {
    role: string;
    description: string;
    outputHint?: string;
    steps?: string[];
  } = JSON.parse(extractJSON(result));

  return config;
}

export async function routeTaskToAgent(
  userMessage: string,
  agents: { id: string; name: string; description: string }[],
  conversationHistory?: ChatMessage[],
): Promise<{ agentId: string; agentName: string; explanation: string }> {
  const agentList = agents
    .map((t) => `- ID: ${t.id}, Name: ${t.name}, Description: ${t.description}`)
    .join("\n");

  const systemPrompt = `You are a task router. You must forward the user's request to the most suitable agent.
If there is previous conversation context, refer to it and route follow-up requests to the same agent.

Available agents:
${agentList}

Respond only in the following JSON format:
{
  "agentId": "ID of the selected agent",
  "agentName": "name of the selected agent",
  "explanation": "reason for choosing this agent (in the user's language, 1 sentence)"
}`;

  const summary = conversationHistory
    ? buildConversationSummary(conversationHistory)
    : "";
  const userContent = summary
    ? `[Previous conversation]\n${summary}\n\n[Current request]\n${userMessage}`
    : userMessage;

  const { text: result } = await callClaude(
    [{ role: "user", content: userContent }],
    systemPrompt,
  );

  return JSON.parse(extractJSON(result));
}

export interface AgentTaskResult {
  summary: string;
  artifacts: Artifact[];
}

function extractResultFallback(raw: string): AgentTaskResult {
  const summaryMatch = raw.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const summary = summaryMatch
    ? summaryMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"')
    : "";

  const artifacts: Artifact[] = [];
  const artifactPattern =
    /\{\s*"type"\s*:\s*"(code|document|action_items)"\s*,\s*"title"\s*:\s*"((?:[^"\\]|\\.)*)"\s*(?:,\s*"language"\s*:\s*"((?:[^"\\]|\\.)*)"\s*)?(?:,\s*"content"\s*:\s*")/g;

  let match;
  while ((match = artifactPattern.exec(raw)) !== null) {
    const type = match[1] as Artifact["type"];
    const title = match[2].replace(/\\"/g, '"');
    const language = match[3]?.replace(/\\"/g, '"');

    const contentStart = artifactPattern.lastIndex;
    const remaining = raw.slice(contentStart);
    const endMatch = remaining.match(/"\s*\}\s*(?:,|\])/);
    if (endMatch && endMatch.index !== undefined) {
      const contentRaw = remaining.slice(0, endMatch.index);
      const content = contentRaw
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");

      artifacts.push({
        id: crypto.randomUUID(),
        type,
        title,
        ...(language ? { language } : {}),
        content,
      });
    }
  }

  if (summary) {
    return { summary, artifacts };
  }

  const cleaned = raw
    .replace(/^\s*\{?\s*"summary"\s*:\s*/, "")
    .replace(/,\s*"artifacts"\s*:\s*\[[\s\S]*$/, "")
    .replace(/^"|"$/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .trim();

  return { summary: cleaned || raw, artifacts: [] };
}

function selectRelevantFiles(
  allFiles: Artifact[],
  errorOutput: string,
): { relevant: Artifact[]; fileTree: string } {
  const codeFiles = allFiles.filter((a) => a.type === "code");
  const fileTree = codeFiles.map((a) => a.title).join("\n");

  const errorLower = errorOutput.toLowerCase();
  const scored = codeFiles.map((file) => {
    let score = 0;
    const name = file.title.toLowerCase();
    const baseName = name.split("/").pop() || name;

    if (errorLower.includes(name) || errorLower.includes(baseName)) score += 10;

    if (
      /package\.json|tsconfig|next\.config|postcss\.config|tailwind\.config/.test(
        name,
      )
    )
      score += 5;
    if (/layout\.(tsx?|jsx?)$|page\.(tsx?|jsx?)$|_app\.|_document\./.test(name))
      score += 3;
    if (/globals\.css|index\.(css|tsx?|jsx?)/.test(name)) score += 2;

    return { file, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const relevant: Artifact[] = [];
  let totalChars = 0;
  const CHAR_BUDGET = 40000;

  for (const { file } of scored) {
    if (totalChars + file.content.length > CHAR_BUDGET && relevant.length > 0)
      break;
    relevant.push(file);
    totalChars += file.content.length;
  }

  return { relevant, fileTree };
}

export async function fixErrorWithAI(
  errorOutput: string,
  originalArtifacts: Artifact[],
  projectType?: string,
  framework?: string,
): Promise<AgentTaskResult> {
  const { relevant, fileTree } = selectRelevantFiles(
    originalArtifacts,
    errorOutput,
  );

  const artifactList = relevant
    .map(
      (a) => `### ${a.title}\n\`\`\`${a.language || ""}\n${a.content}\n\`\`\``,
    )
    .join("\n\n");

  const detectedFramework =
    framework ||
    (relevant.some((a) => a.title.includes("next.config"))
      ? "nextjs"
      : undefined) ||
    (relevant.some((a) => {
      try {
        return JSON.parse(a.content).dependencies?.next;
      } catch {
        return false;
      }
    })
      ? "nextjs"
      : undefined);

  const errorRefs = selectErrorFixReferences(
    projectType,
    detectedFramework,
    errorOutput,
  );
  const referenceSection =
    errorRefs.length > 0
      ? `\n## References\n${errorRefs.join("\n\n---\n\n")}`
      : "";

  const systemPrompt = `You are a senior full-stack developer and code error debugger.
Analyze build/runtime errors and return the corrected code.

## Rules
- Accurately identify the root cause of the error message
- Only include files that need to be modified in artifacts
- title must match the path in the file tree exactly (e.g., "app/page.tsx")
- Include the full content of the modified file in content (no partial code)
- Do not modify files unrelated to the error
${referenceSection}

## Response Format
Respond only in the following JSON format. Do not include any other text.

{
  "summary": "summary of the error cause and fix (in the user's language, 2-3 sentences)",
  "artifacts": [
    {
      "type": "code",
      "title": "path/filename.extension",
      "language": "language name",
      "content": "full corrected code"
    }
  ]
}`;

  const userContent = `## Error Log\n\`\`\`\n${errorOutput}\n\`\`\`\n\n## Project File List\n\`\`\`\n${fileTree}\n\`\`\`\n\n## Source Code\n${artifactList}`;

  const { text: raw } = await callClaude(
    [{ role: "user", content: userContent }],
    systemPrompt,
    8192,
    undefined,
    undefined,
    undefined,
    DEBUG_MODEL,
  );

  try {
    const parsed = JSON.parse(extractJSON(raw));
    const artifacts: Artifact[] = (parsed.artifacts || []).map(
      (a: Omit<Artifact, "id">) => ({
        ...a,
        id: crypto.randomUUID(),
      }),
    );
    return { summary: parsed.summary || raw, artifacts };
  } catch {
    return extractResultFallback(raw);
  }
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateAgentOutput(result: AgentTaskResult): ValidationResult {
  const issues: string[] = [];

  if (!result.summary || !result.summary.trim()) {
    issues.push("summary is empty");
  }

  for (const artifact of result.artifacts) {
    if (!artifact.content || !artifact.content.trim()) {
      issues.push(`empty content: ${artifact.title}`);
    }
    if (artifact.type === "code" && !artifact.language) {
      issues.push(`missing language: ${artifact.title}`);
    }
    if (
      artifact.type === "code" &&
      artifact.title.endsWith(".json") &&
      artifact.content.trim()
    ) {
      try {
        JSON.parse(artifact.content);
      } catch {
        issues.push(`invalid JSON: ${artifact.title}`);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

export async function executeAgentTask(
  agentRole: string,
  agentDescription: string,
  taskDescription: string,
  previousResults?: string,
  conversationHistory?: ChatMessage[],
  projectType?: string,
  framework?: string,
  options?: {
    enableTools?: boolean;
    workingDirectory?: string;
    previousArtifacts?: Artifact[];
    onToolUse?: (event: ToolUseEvent) => void;
    signal?: AbortSignal;
  },
): Promise<AgentTaskResult> {
  // Load Skill (task procedure) + Reference (knowledge documents)
  const skill = selectSkill(
    agentRole,
    agentDescription,
    projectType,
    framework,
  );
  const references = selectReferences(
    agentRole,
    agentDescription,
    projectType,
    framework,
    taskDescription,
  );

  const tools = options?.enableTools
    ? getToolsForRole(agentRole, agentDescription)
    : undefined;

  const toolInstructions =
    tools && tools.length > 0
      ? `\n\n## Available Tools
You can use tools to read project files, inspect directory structures, or run commands.

## How to Work
1. First analyze the requirements and plan the implementation yourself (which files to create and in what order)
2. Use tools step by step according to the plan
   - list_directory / read_file to understand the current state
   - write_file to create/modify files
   - run_command to initialize, install, build, and verify
3. After each step, move on to the next. Keep using tools until all work is complete.
4. If verification (build/type-check) produces errors, fix them directly and verify again.
5. Only return the final JSON result after all work is done.

Files saved with write_file do not need to be included in the artifacts array (they are tracked automatically).`
      : "";

  const skillSection = skill ? `\n\n## Task Guide\n${skill}` : "";
  const referenceSection =
    references.length > 0
      ? `\n\n## References\n${references.join("\n\n---\n\n")}`
      : "";

  const systemPrompt = `You are an AI agent with the role of "${agentRole}".
Role description: ${agentDescription}

Perform the given task and return the result in the following JSON format.
Return only JSON. Do not include any other text.

{
  "summary": "result summary (in the user's language, 2-3 sentences)",
  "artifacts": [
    {
      "type": "code",
      "title": "filename.extension",
      "language": "language name",
      "content": "code content"
    },
    {
      "type": "document",
      "title": "document title",
      "content": "document content"
    },
    {
      "type": "action_items",
      "title": "action items title",
      "content": "- [ ] item1\\n- [ ] item2"
    }
  ]
}

Rules:
- type must be one of "code", "document", "action_items"
- Code files use type: "code", language field is required
- General documents/reports use type: "document"
- To-do lists use type: "action_items"
- If there are no artifacts, use an empty array []
- summary must always be included${skillSection}${referenceSection}${toolInstructions}`;

  const artifactContext = conversationHistory
    ? buildArtifactContext(conversationHistory)
    : "";

  let userContent = previousResults
    ? `Task: ${taskDescription}\n\nPrevious step results:\n${previousResults}`
    : `Task: ${taskDescription}`;

  if (artifactContext) {
    userContent += `\n\n[Previously generated artifacts - refer to or improve as needed]\n${artifactContext}`;
  }

  const toolContext =
    tools && tools.length > 0
      ? {
          workingDirectory: options?.workingDirectory,
          previousArtifacts: options?.previousArtifacts,
        }
      : undefined;

  const { text: raw, writtenFiles } = await callClaude(
    [{ role: "user", content: userContent }],
    systemPrompt,
    tools && tools.length > 0 ? 16384 : 4096,
    tools,
    toolContext,
    undefined,
    undefined,
    options?.onToolUse,
    options?.signal,
  );

  // Convert files written to disk via write_file into artifacts
  const fileArtifacts: Artifact[] = writtenFiles.map(
    (f: { path: string; content: string }) => ({
      id: crypto.randomUUID(),
      type: "code" as const,
      title: f.path,
      language: inferLanguage(f.path),
      content: f.content,
    }),
  );

  // Generate default summary when writtenFiles exist
  const fileSummary =
    fileArtifacts.length > 0
      ? `Created ${fileArtifacts.length} files: ${fileArtifacts.map((a) => a.title).join(", ")}`
      : "";

  try {
    const parsed = JSON.parse(extractJSON(raw));
    const jsonArtifacts: Artifact[] = (parsed.artifacts || []).map(
      (a: Omit<Artifact, "id">) => ({
        ...a,
        id: crypto.randomUUID(),
      }),
    );

    // Merge file artifacts and JSON artifacts (dedup: file version takes precedence for same title)
    const artifactMap = new Map<string, Artifact>();
    for (const a of jsonArtifacts) artifactMap.set(a.title, a);
    for (const a of fileArtifacts) artifactMap.set(a.title, a);
    const artifacts = Array.from(artifactMap.values());

    return { summary: parsed.summary || fileSummary || raw, artifacts };
  } catch {
    // raw is empty or parse failed — build result from writtenFiles
    if (fileArtifacts.length > 0) {
      return { summary: fileSummary, artifacts: fileArtifacts };
    }
    const fallback = extractResultFallback(raw);
    return fallback;
  }
}

function inferLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    css: "css",
    html: "html",
    json: "json",
    md: "markdown",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
  };
  return langMap[ext] || ext;
}
