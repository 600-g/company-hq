# API Design Reference

## Next.js App Router API Routes
GET/POST: app/api/[resource]/route.ts
GET/PUT/DELETE by ID: app/api/[resource]/[id]/route.ts

## Patterns
- NextResponse.json(data) / NextResponse.json(error, { status: 4xx })
- params is a Promise (Next.js 15+)
- Input validation → business logic → response

## SSE Streaming
new ReadableStream → Content-Type: text/event-stream

## FastAPI patterns (우리 서버)
- @app.get/post("/path") + async def
- Pydantic model → request body validation
- StreamingResponse(generator, media_type="text/event-stream") for SSE
