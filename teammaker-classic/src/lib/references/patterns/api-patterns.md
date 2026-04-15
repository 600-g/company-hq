# API Design Patterns

## Next.js App Router API Routes

### Basic Structure
```tsx
// app/api/[resource]/route.ts
import { NextResponse } from "next/server";

// GET /api/items
export async function GET() {
  const items = await db.items.findMany();
  return NextResponse.json(items);
}

// POST /api/items
export async function POST(request: Request) {
  const body = await request.json();
  const item = await db.items.create({ data: body });
  return NextResponse.json(item, { status: 201 });
}
```

### Dynamic Routes
```tsx
// app/api/items/[id]/route.ts

// GET /api/items/123
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await db.items.findUnique({ where: { id } });

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}

// PUT /api/items/123
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const item = await db.items.update({ where: { id }, data: body });
  return NextResponse.json(item);
}

// DELETE /api/items/123
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.items.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
```

## Error Handling

```tsx
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Input validation
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json(
        { error: "name field is required" },
        { status: 400 }
      );
    }

    const result = await createItem(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

## Client-side Fetch Patterns

```tsx
// Read
const res = await fetch("/api/items");
const items = await res.json();

// Create
const res = await fetch("/api/items", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "New item" }),
});

// Update
await fetch(`/api/items/${id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(updates),
});

// Delete
await fetch(`/api/items/${id}`, { method: "DELETE" });
```

## SSE (Server-Sent Events) Streaming

```tsx
// app/api/stream/route.ts
export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const chunk of data) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```
