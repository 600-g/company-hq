# Step 3.13: Docker Compose

**Date**: 2026-02-19
**Status**: Complete

---

## Files Created

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage Next.js production build |
| `docker-compose.yml` | Container orchestration |
| `.dockerignore` | Exclude unnecessary files from build |

## Docker Setup

### Build & Run

```bash
docker compose up --build
```

### Access

- Application: http://localhost:3000

### Architecture

```
Dockerfile (multi-stage):
1. deps     - Install node_modules
2. builder  - Next.js production build
3. runner   - Minimal production image (standalone)
```

### Next.js Configuration

- `output: "standalone"` enabled in `next.config.ts`
- Produces self-contained server with `node server.js`

## Notes

- No database container needed (MVP uses localStorage)
- Single service deployment
- Alpine-based image for minimal size
