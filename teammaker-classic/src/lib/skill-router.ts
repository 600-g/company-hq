/**
 * Skill/Reference router (client-compatible)
 *
 * Selects and returns the appropriate Skill (work procedure) + Reference (knowledge document)
 * based on agent role, project type, framework, and task description.
 *
 * .md files are preserved for documentation/maintenance purposes,
 * and the actual content is managed as strings in this module.
 * (fs cannot be used on the client side)
 */

// ── Role classification ──

function classifyRole(role: string, description: string) {
  const text = `${role} ${description}`.toLowerCase();
  return {
    isDev: /개발|엔지니어|프로그래|코딩|구현|frontend|backend|풀스택|dev/.test(
      text,
    ),
    isDesign: /디자인|ux|ui설계|비주얼|레이아웃|와이어프레임|목업|design/.test(
      text,
    ),
    isPlan: /기획|전략|분석|리서치|조사|마케팅|콘텐츠|plan|market/.test(text),
    isQA: /테스트|qa|검증|품질/.test(text),
  };
}

// ── Skills (work procedures per role) ──

const SKILLS: Record<string, string> = {
  "dev-web-nextjs": `## Work Procedure

### Step 1: Understand the project structure
- Use list_directory to check the current project structure
- If package.json is missing → go to Step 2 (initialize new project)
- If package.json exists → go to Step 3 (add code to existing project)

### Step 2: Initialize the project (new project only)
- Use run_command with the CLI to initialize the project
- Command: run_command("npx create-next-app@15 . --yes --typescript --tailwind --eslint --app --src-dir --import-alias '@/*'")
  - Must be created in "." (current directory). Do not create a new folder.
  - --yes flag is required (prevents interactive prompt)
- After initialization, use list_directory to verify the generated structure
- If the user has not specified a UI library, use shadcn/ui by default:
  - run_command("npx shadcn@4 init -y -d")
  - run_command("npx shadcn@4 add button card input -y")
  - Pre-install any additional components needed at this stage

### Step 3: Review previous step results
- Use list_directory to check the project folder structure, and read_file to directly reference files saved by previous agents
- If files are not on disk, fall back to read_previous_artifacts
- Apply the design spec's colors, typography, and layout values to the code

### Step 4: Data modeling
- Always define types/interfaces before implementing code
- Create type files in the src/types/ directory (e.g., src/types/index.ts)
- Define TypeScript interface/type for all data structures:
  - API response/request types
  - Component Props types
  - Data types for state management
- Import and use these types in the implementation code

### Step 5: Code implementation
- Use write_file to create/modify files directly in the project directory
- Use **Next.js 15** (App Router)
  - params/searchParams are Promises — always await them: \`const { id } = await params\`
  - cookies(), headers() are async — \`const cookieStore = await cookies()\`
  - Default fetch cache is no-store
  - Never change the installed Next.js version (do not run npm install next@another-version)
- Follow Next.js App Router structure (app/ or src/app/ directory)
- Use TypeScript + Tailwind CSS v4
- If the project was initialized via CLI, do not modify existing config files (package.json, tsconfig.json, etc.)
- Files to implement:
  1. src/types/ — type definitions (written in Step 4)
  2. src/app/globals.css — add custom styles if needed
  3. src/app/layout.tsx — modify RootLayout
  4. src/app/page.tsx — implement main page
  5. Additional pages/components — create as required
- Make full use of shadcn/ui (Button, Card, Input, Dialog, etc.)
- If specs from previous agents (planning/design) exist, reflect them faithfully

### Step 6: Install dependencies & verify
- If additional packages are needed: run_command("npm install <package-name>")
- Type check with run_command("npx tsc --noEmit")
- Build verification with run_command("npm run build")
- If errors occur, fix and re-verify (repeat in order: type check → build)

## Build Error Resolution Rules (Important!)
1. **Read error messages carefully**: Identify file paths and line numbers from build error output, and read the file first with read_file
2. **Change approach after 3 repeated errors**: If the same error causes build failure 3 or more times, abandon the current approach and try a different one (e.g., remove the problematic package, use an alternative library)
3. **Package compatibility issue → remove the package and find an alternative**: If a specific package keeps breaking the build, boldly npm uninstall it and implement directly or use a different package
4. **Wrap up after 5 consecutive build failures**: If build verification fails 5 consecutive times, finalize the current state and report a summary of remaining errors. Do not loop indefinitely.
5. **Do not explore inside node_modules**: Reading files inside node_modules with cat or node -e is a waste of time. Refer to package documentation or switch to a different package.

## Tool Request Log
If during the task you encounter a situation where "I could have solved this if I had this tool", leave a note at the end of the task result summary.
Write multiple lines if there are multiple items. Omit if none.

## Output Rules
- type must be "code", language field is required
- Create a separate artifact per file
- No bare HTML files; always use Next.js project structure

## Notes
- Never mix App Router (app/) with Pages Router (pages/). Do not create a pages/ directory.
- Do not use next/document, _app.tsx, or _document.tsx in App Router → use metadata export
- CSS imports must be done in layout.tsx
- Do not use useState/useEffect in Server Components → "use client" declaration required
- Only create global-error.tsx when truly necessary. Must include "use client" declaration + its own <html> and <body> tags`,

  "dev-generic": `## Work Procedure

### Step 1: Understand the project structure
- Use list_directory to check the current project structure
- Use read_file to understand existing code patterns
- Identify the language, framework, and libraries in use

### Step 2: Review previous step results
- Use list_directory to check the project folder structure, and read_file to directly reference files saved by previous agents
- If files are not on disk, fall back to read_previous_artifacts
- Faithfully reflect the requirements defined in the spec into code

### Step 3: Data modeling
- Always define types/interfaces before implementing code
- For TypeScript projects, create type files in the types/ directory
- Define types for all data structures (API responses, Props, state, etc.)
- Import and use these types in the implementation code

### Step 4: Code implementation
- Use write_file to create/modify files directly in the project directory
- Write working, functional code
- Import and use the types defined in Step 3
- If specs from previous agents (planning/design) exist, reflect them faithfully

### Step 5: Verification
- If possible, run build/lint with run_command to check for errors
- If errors occur, fix and re-verify

## Output Rules
- type must be "code", language field is required
- Create a separate artifact per file
- Include the full file content in content (no partial code)`,

  design: `## Work Procedure

### Step 1: Analyze requirements
- Extract visual elements from the user's requirements
- Identify the target audience, brand tone, and reference designs

### Step 2: Review previous step results
- Reference the planning agent's requirements document using read_previous_artifacts
- Convert the feature list from the planning doc into design elements

### Step 3: Write design specification
- Color palette (primary, secondary, accent, background, text color codes)
- Typography (font family, size scale, line height)
- Layout structure (grid system, spacing, responsive breakpoints)
- Component specs (size/style of buttons, cards, input fields, navigation, etc.)

## Output Rules
- Do not write code (CSS, HTML, etc.) directly. Code implementation is the responsibility of the development agent.
- Write the design specification as type: "document"
- Include specific values (px, color codes, etc.) for visual elements so the development agent can implement them immediately

## Notes
- Use specific values instead of abstract expressions
- Colors must be expressed in HEX or HSL codes`,

  planning: `## Work Procedure

### Step 1: Analyze requirements
- Distinguish core features from non-core features in the user's request
- Separate technical constraints from business requirements

### Step 2: Review previous results
- Reference artifacts generated in previous conversations using read_previous_artifacts
- Maintain consistency with existing outputs if available

### Step 3: Write planning document
- Project overview and objectives
- Core feature list (including priority)
- User scenarios / user flow
- Page/screen layout
- Data model (if needed)
- Implementation priority and milestones

## Output Rules
- Write planning documents, strategy documents, and analysis reports as type: "document"
- Do not write code directly
- If there are actionable items, organize them as type: "action_items"`,

  qa: `## Work Procedure

### Step 1: Code review
- Check code written by the development agent using read_previous_artifacts
- Compare with existing project code using read_file

### Step 2: Run verification
- Run build/type check with run_command (npx tsc --noEmit, npm run build, etc.)
- Collect and classify the error list

### Step 3: Write report
- Summarize discovered bugs, potential issues, and improvements
- Classify by severity (Critical, Major, Minor)
- Items requiring fixes should be organized as action_items

### Step 4: Test code (if needed)
- Write test code for core functionality

## Output Rules
- Write test results and bug reports as type: "document"
- If test code is needed, write it as type: "code"
- Items requiring fixes should be organized as type: "action_items"`,
};

// ── References (knowledge per framework/pattern) ──

const REFERENCES: Record<string, string> = {
  "nextjs-app-router": `# Next.js App Router Reference

## Project Structure
app/
├── layout.tsx        # RootLayout (globals.css import, html/body)
├── page.tsx          # Main page (/ route)
├── globals.css       # @import "tailwindcss"
└── [feature]/page.tsx

## Core Rules
- Server Component is the default; "use client" must be declared explicitly (when using useState/useEffect)
- Do not use next/document → use metadata export
- CSS imports only in the top-level layout.tsx
- Do not mix App Router (app/) with Pages Router (pages/)

## Metadata setup
import type { Metadata } from "next";
export const metadata: Metadata = { title: "App Title", description: "Description" };

## Dynamic routing
app/posts/[id]/page.tsx → params is Promise<{ id: string }> (async in Next.js 15+)

## Common mistakes
- Using pages/ and app/ simultaneously
- Using useState/useEffect in Server Components
- Creating page.tsx without layout.tsx
- Importing next/head (→ use metadata export)
- Importing globals.css in page.tsx`,

  "tailwind-v4": `# Tailwind CSS v4 Reference

## Configuration
postcss.config.mjs: export default { plugins: { "@tailwindcss/postcss": {} } }
globals.css: @import "tailwindcss"
tailwind.config.js is not needed (v4 uses CSS-based configuration)

## Dependencies
tailwindcss: ^4.0.0, @tailwindcss/postcss: ^4.0.0, postcss: ^8.0.0

## Custom theme (CSS variables)
@import "tailwindcss";
@theme {
  --color-primary: #3b82f6;
  --font-sans: "Inter", sans-serif;
}

## cn() utility
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }`,

  "shadcn-ui": `# shadcn/ui Reference

## Required dependencies
class-variance-authority, clsx, tailwind-merge, lucide-react, @radix-ui/react-slot
Per component: @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, @radix-ui/react-select, etc.

## Key components
Button: variant=(default|destructive|outline|secondary|ghost|link) size=(sm|default|lg)
Card: Card > CardHeader > CardTitle + CardDescription > CardContent > CardFooter
Input + Label: <Label htmlFor="x">Label</Label><Input id="x" />
Dialog: Dialog > DialogTrigger > DialogContent > DialogHeader > DialogTitle

## CSS variables (globals.css)
:root { --background: 0 0% 100%; --foreground: 0 0% 3.9%; --primary: 0 0% 9%; --muted: 0 0% 96.1%; --border: 0 0% 89.8%; --radius: 0.5rem; }

## File structure
src/components/ui/button.tsx, card.tsx, input.tsx, ...
src/lib/utils.ts (cn function)`,

  "auth-patterns": `# Authentication Implementation Reference

## Next.js authentication patterns
1. Login form: "use client" component, fetch("/api/auth/login") POST
2. API Route: set httpOnly session cookie with cookies()
3. Middleware: check protected routes in middleware.ts

## Security checklist
- Password hashing (bcrypt)
- httpOnly + secure + sameSite cookies
- CSRF token
- Rate limiting
- Input validation`,

  "api-patterns": `# API Design Reference

## Next.js App Router API Routes
GET/POST: app/api/[resource]/route.ts
GET/PUT/DELETE by ID: app/api/[resource]/[id]/route.ts

## Patterns
- NextResponse.json(data) / NextResponse.json(error, { status: 4xx })
- params is a Promise (Next.js 15+)
- Input validation → business logic → response

## SSE Streaming
new ReadableStream → Content-Type: text/event-stream`,

  "react-patterns": `# React Patterns Reference

## Component design
- Single responsibility, composition-first
- Define props with TypeScript interface

## State management
- Local: useState
- Derived values: useMemo (do not turn into state)
- Forms: object state + handleChange pattern

## Conditional rendering
- Ternary: {isLoading ? <Spinner /> : <Content />}
- AND: {error && <Error />}
- Early return: if (loading) return <Spinner />;

## Lists: use stable IDs for key (never index)`,
};

// ── Public API ──

export function selectSkill(
  role: string,
  description: string,
  projectType?: string,
  framework?: string,
): string | null {
  const { isDev, isDesign, isPlan, isQA } = classifyRole(role, description);

  let key: string | null = null;

  if (isDev && projectType === "web" && framework === "nextjs") {
    key = "dev-web-nextjs";
  } else if (isDev) {
    key = "dev-generic";
  } else if (isDesign && !isDev) {
    key = "design";
  } else if (isPlan) {
    key = "planning";
  } else if (isQA) {
    key = "qa";
  }

  return key ? (SKILLS[key] ?? null) : null;
}

const MAX_REFERENCES = 3;

export function selectReferences(
  role: string,
  description: string,
  projectType?: string,
  framework?: string,
  taskDescription?: string,
): string[] {
  const { isDev } = classifyRole(role, description);
  if (!isDev) return [];

  const refs: string[] = [];

  if (framework === "nextjs") {
    refs.push(REFERENCES["nextjs-app-router"]);
    refs.push(REFERENCES["tailwind-v4"]);
    refs.push(REFERENCES["shadcn-ui"]);
  } else if (projectType === "web") {
    refs.push(REFERENCES["react-patterns"]);
    refs.push(REFERENCES["tailwind-v4"]);
  }

  if (taskDescription) {
    const task = taskDescription.toLowerCase();
    if (
      refs.length < MAX_REFERENCES &&
      /인증|로그인|회원가입|auth|login|signup|session|jwt/.test(task)
    ) {
      refs.push(REFERENCES["auth-patterns"]);
    }
    if (
      refs.length < MAX_REFERENCES &&
      /api|엔드포인트|endpoint|서버|rest|crud/.test(task)
    ) {
      refs.push(REFERENCES["api-patterns"]);
    }
  }

  return refs.filter(Boolean).slice(0, MAX_REFERENCES);
}

export function selectErrorFixReferences(
  projectType?: string,
  framework?: string,
  errorOutput?: string,
): string[] {
  const refs: string[] = [];

  if (framework === "nextjs") {
    refs.push(REFERENCES["nextjs-app-router"]);
  }

  if (errorOutput) {
    const err = errorOutput.toLowerCase();
    if (/tailwind|postcss|css/.test(err)) {
      refs.push(REFERENCES["tailwind-v4"]);
    }
  }

  return refs.filter(Boolean).slice(0, 2);
}
