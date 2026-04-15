# Next.js App Router

## Project Structure

```
app/
├── layout.tsx        # RootLayout (globals.css import, html/body)
├── page.tsx          # Main page (/ route)
├── globals.css       # @import "tailwindcss"
├── loading.tsx       # Suspense loading UI (optional)
├── error.tsx         # Error boundary (optional, "use client" required)
├── not-found.tsx     # 404 page (optional)
└── [feature]/
    ├── page.tsx      # /feature route
    └── layout.tsx    # Nested layout (optional)

next.config.ts        # Next.js configuration
tsconfig.json         # TypeScript configuration
postcss.config.mjs    # Tailwind CSS plugin
package.json          # Project metadata/dependencies
```

## Core Rules

- **Server Component is the default**: When using `useState`, `useEffect`, or event handlers, `"use client"` declaration at the top of the file is required
- **Do not use next/document**: In App Router, set head info via `metadata` export
- **CSS import**: Import `globals.css` in the root `layout.tsx`
- **Do not mix App Router and Pages Router**: Use only the `app/` directory

## metadata Configuration

```tsx
// app/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "App Title",
  description: "App Description",
};
```

## layout.tsx Basic Structure

```tsx
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

## Common Mistakes

- Using `pages/` and `app/` simultaneously → routing conflicts
- Using `useState`/`useEffect` in Server Component → build error
- Creating `page.tsx` without `layout.tsx` → missing html/body
- Importing `next/head` → use `metadata` export in App Router
- Importing globals.css in page.tsx → must import in layout.tsx

## Dynamic Routing

```
app/
├── posts/
│   ├── page.tsx           # /posts
│   └── [id]/
│       └── page.tsx       # /posts/123
```

```tsx
// app/posts/[id]/page.tsx
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div>Post {id}</div>;
}
```
