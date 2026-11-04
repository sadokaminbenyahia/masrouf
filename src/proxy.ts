import { NextResponse, type NextRequest } from 'next/server';

/**
 * Vérification OPTIMISTE (présence du cookie de session) pour rediriger vers /connexion.
 * La vraie vérification a lieu côté serveur dans chaque layout/page/action (getCurrentUserId).
 */
const PUBLIC_PATHS = ['/connexion', '/inscription'];
const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = SESSION_COOKIES.some((c) => request.cookies.has(c));
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/connexion';
    url.search = pathname !== '/' ? `?callbackUrl=${encodeURIComponent(pathname)}` : '';
    return NextResponse.redirect(url);
  }
  if (hasSession && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/tableau-de-bord';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|robots.txt|offline).*)',
  ],
};
