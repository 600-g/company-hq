# Authentication Implementation Reference

## Next.js authentication patterns
1. Login form: "use client" component, fetch("/api/auth/login") POST
2. API Route: set httpOnly session cookie with cookies()
3. Middleware: check protected routes in middleware.ts

## Security checklist
- Password hashing (bcrypt)
- httpOnly + secure + sameSite cookies
- CSRF token
- Rate limiting
- Input validation
