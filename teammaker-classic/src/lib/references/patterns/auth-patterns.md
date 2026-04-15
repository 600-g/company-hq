# Authentication Implementation Patterns

## Authentication Method Comparison

| Method | Pros | Cons | Best For |
|--------|------|------|----------|
| JWT | Stateless, scalable | Hard to invalidate tokens | API-centric apps, SPA |
| Session | Server-controlled, security advantage | Server memory usage | Traditional web apps |
| OAuth 2.0 | Social login, standardized | Complex flow | When social login is needed |

## Next.js Authentication Implementation

### 1. Login Form (Client Component)
```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      window.location.href = "/dashboard";
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
      <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
      <Button type="submit" className="w-full">Login</Button>
    </form>
  );
}
```

### 2. API Route (Server-side)
```tsx
// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const { email, password } = await request.json();

  // Authentication logic (DB query, etc.)
  const user = await authenticateUser(email, password);
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Session/token setup
  const cookieStore = await cookies();
  cookieStore.set("session", generateToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return NextResponse.json({ success: true });
}
```

### 3. Middleware Protection
```tsx
// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const session = request.cookies.get("session");

  if (!session && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

## Security Checklist
- Password hashing (bcrypt)
- CSRF token usage
- httpOnly cookie setting
- Rate limiting (limit login attempts)
- Input validation (email format, password strength)
