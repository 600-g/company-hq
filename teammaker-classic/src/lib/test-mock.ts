import type { RefineResult, AgentTaskResult } from "./claude";

const MOCK_AGENT_PRESETS = [
  [
    { name: "Planner", description: "Service planning and requirements analysis", role: "Planning", outputHint: "PRD document" },
    { name: "Designer", description: "UI/UX design and prototyping", role: "Design", outputHint: "Design mockup" },
    { name: "Developer", description: "Frontend/backend development", role: "Development", outputHint: "Source code" },
  ],
  [
    { name: "Researcher", description: "Market research and data analysis", role: "Research", outputHint: "Analysis report" },
    { name: "Writer", description: "Content writing and editing", role: "Content", outputHint: "Document" },
  ],
  [
    { name: "PM", description: "Project management and scheduling", role: "Management", outputHint: "Project plan" },
    { name: "QA", description: "Quality assurance and testing", role: "Testing", outputHint: "Test results" },
    { name: "DevOps", description: "Infrastructure and deployment management", role: "Infrastructure", outputHint: "Deployment config" },
    { name: "Frontend", description: "UI implementation and user experience", role: "Frontend Development", outputHint: "React components" },
  ],
];

let presetIndex = 0;

/**
 * Mock refineRequirements: returns create_agents with sample data.
 * Cycles through different presets on each call.
 */
export function mockRefineRequirements(userMessage: string): RefineResult {
  const preset = MOCK_AGENT_PRESETS[presetIndex % MOCK_AGENT_PRESETS.length];
  presetIndex++;

  return {
    type: "create_agents",
    spec: `[Test mode] Configuring agents for task: "${userMessage}"`,
    agentsToCreate: preset,
    projectType: "web",
    framework: "Next.js",
  };
}

/**
 * Mock executeAgentTask: returns fake result after a delay.
 */
export async function mockExecuteAgentTask(
  agentName: string,
  _spec: string,
): Promise<AgentTaskResult> {
  // Simulate work delay (3-5 seconds) — slow enough to observe animations
  await new Promise((r) => setTimeout(r, 3000 + Math.random() * 2000));

  return {
    summary: `[Test] ${agentName} task complete! All items processed successfully.`,
    artifacts: [
      {
        id: crypto.randomUUID(),
        title: `${agentName} output`,
        type: "document",
        content: `# ${agentName} Result\n\nSample output generated in test mode.\n\n- Item 1: Done\n- Item 2: Done\n- Item 3: Done`,
      },
    ],
  };
}
