import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

const PROTECTED_PREFIXES = ['/ta', '/manager', '/hr', '/admin'];
const AUTH_ROUTES = ['/sign-in', '/sign-up'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Validate actual session, not just cookie presence
  const session = await auth.api.getSession({ headers: request.headers });

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

  // Redirect unauthenticated users to sign-in
  if (isProtected && !session) {
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Redirect authenticated users away from auth pages
  // Send to /ta/dashboard as default; requireRole() on each page will re-redirect
  // to the correct role-specific home if the user is not a TA
  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL('/ta/dashboard', request.url));
  }

  // Redirect root to sign-in (or role default dashboard if authenticated)
  if (pathname === '/') {
    if (session) {
      return NextResponse.redirect(new URL('/ta/dashboard', request.url));
    }
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/ta/:path*',
    '/manager/:path*',
    '/hr/:path*',
    '/admin/:path*',
    '/sign-in',
    '/sign-up',
  ],
};
