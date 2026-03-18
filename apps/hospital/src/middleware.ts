import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Check for session cookie — if absent, redirect to login.
  // We do NOT verify the JWT here (too slow at edge) — the Hono API does that.
  const sessionCookie = request.cookies.get('medical-crm-hospital-session');

  if (!sessionCookie?.value) {
    const adminLogin = `${process.env.ADMIN_ORIGIN ?? 'http://localhost:3002'}/auth/login`;
    return NextResponse.redirect(adminLogin);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect all routes except auth, public assets, and Next.js internals
    '/((?!auth|api|_next/static|_next/image|favicon.ico).*)',
  ],
};
