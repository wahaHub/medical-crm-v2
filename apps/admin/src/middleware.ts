import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Check for session cookie — if absent, redirect to login.
  // We do NOT verify the JWT here (too slow at edge) — the Hono API does that.
  const sessionCookie = request.cookies.get('medical-crm-admin-session');

  if (!sessionCookie?.value) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect all routes except auth pages, public registration, public assets, and Next.js internals
    '/((?!auth|api/auth/login|api/auth/hospital/register|_next/static|_next/image|favicon.ico).*)',
  ],
};
