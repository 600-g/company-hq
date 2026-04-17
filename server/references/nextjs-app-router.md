# Next.js App Router Reference

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
- Importing globals.css in page.tsx
