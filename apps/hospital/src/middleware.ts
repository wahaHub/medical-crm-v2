import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_FILE_PATTERN = /\.[^/]+$/;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    PUBLIC_FILE_PATTERN.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Check for session cookie — if absent, redirect to login.
  // We do NOT verify the JWT here (too slow at edge) — the Hono API does that.
  const sessionCookie = request.cookies.get('medical-crm-hospital-session');

  if (!sessionCookie?.value) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect all routes except auth, public assets, and Next.js internals
    '/((?!auth|api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
