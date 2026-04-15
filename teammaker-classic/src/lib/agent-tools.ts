/**
 * Agent tool definitions & role-based mapping
 * Tool definitions conforming to Claude API tool use spec
 */

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const AVAILABLE_TOOLS: Record<string, ToolDefinition> = {
  read_file: {
    name: "read_file",
    description:
      "Reads the contents of a project file. Use when referencing or modifying existing code.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to project root (e.g. app/page.tsx)",
        },
      },
      required: ["path"],
    },
  },
  list_directory: {
    name: "list_directory",
    description:
      "Lists files and folders in a directory. Use when exploring project structure.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            'Directory path relative to project root (use "." for root)',
        },
      },
      required: ["path"],
    },
  },
  run_command: {
    name: "run_command",
    description:
      "Executes a shell command. Allowed: npm, npx, node, tsc, eslint, etc. Project initialization (npx create-next-app) and dependency installation (npm install) are also supported. Always use flags like --yes to prevent interactive prompts.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Command to run (e.g. npm run build, npx create-next-app my-app --yes --typescript --tailwind --eslint --app --src-dir --import-alias '@/*')",
        },
      },
      required: ["command"],
    },
  },
  write_file: {
    name: "write_file",
    description:
      "Creates or overwrites a file in the project directory. Intermediate directories are created automatically if they don't exist.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to project root (e.g. src/app/page.tsx)",
        },
        content: {
          type: "string",
          description: "Full content to write to the file",
        },
      },
      required: ["path", "content"],
    },
  },
  read_previous_artifacts: {
    name: "read_previous_artifacts",
    description:
      "References artifacts produced by previous agents. Use to check results from prior steps.",
    input_schema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["code", "document", "action_items", "all"],
          description: "Artifact type to filter by (default: all)",
        },
      },
    },
  },
};

/**
 * Returns the list of tools available for a given role
 */
export function getToolsForRole(
  role: string,
  description: string,
): ToolDefinition[] {
  const text = `${role} ${description}`.toLowerCase();

  const isDev =
    /개발|엔지니어|프로그래|코딩|구현|frontend|backend|풀스택|dev/.test(text);
  const isQA = /테스트|qa|검증|품질/.test(text);

  if (isDev) {
    return [
      AVAILABLE_TOOLS.read_file,
      AVAILABLE_TOOLS.write_file,
      AVAILABLE_TOOLS.list_directory,
      AVAILABLE_TOOLS.run_command,
      AVAILABLE_TOOLS.read_previous_artifacts,
    ];
  }

  if (isQA) {
    return [
      AVAILABLE_TOOLS.read_file,
      AVAILABLE_TOOLS.run_command,
      AVAILABLE_TOOLS.read_previous_artifacts,
    ];
  }

  // Other roles: design, planning, etc.
  return [AVAILABLE_TOOLS.read_previous_artifacts];
}
