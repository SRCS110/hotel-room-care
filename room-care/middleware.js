import { NextResponse } from 'next/server';
import { readToken } from './lib/token';
import { SESSION_COOKIE } from './lib/constants';

// Routes reachable without a session: the sign-in page and the sign-in call.
const PUBLIC = ['/login', '/api/login'];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC.includes(pathname);
  const session = await readToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session && !isPublic) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    const url = req.nextUrl.clone(); url.pathname = '/login'; url.search = '';
    return NextResponse.redirect(url);
  }
  if (session && pathname === '/login') {
    const url = req.nextUrl.clone(); url.pathname = '/'; return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next's static files, robots.txt and the icon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)']
};
