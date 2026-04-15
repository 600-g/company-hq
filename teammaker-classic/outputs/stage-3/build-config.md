# Step 3.12: Build Configuration

**Date**: 2026-02-19
**Status**: Complete

---

## Build Commands

```bash
npm run dev      # Development server (Turbopack)
npm run build    # Production build
npm run start    # Production server
npm run lint     # ESLint
```

## Build Output

- Framework: Next.js 16.1.6 (Turbopack)
- Output: `.next/` directory
- Static pages: 6 routes pre-rendered
- Build time: ~1.3s compilation

## Environment Requirements

- Node.js: 22.x
- npm: 10.x

## Configuration Files

| File | Purpose |
|---|---|
| `next.config.ts` | Next.js configuration |
| `tsconfig.json` | TypeScript configuration |
| `postcss.config.mjs` | PostCSS + Tailwind CSS v4 |
| `components.json` | shadcn/ui configuration |
| `package.json` | Dependencies and scripts |
