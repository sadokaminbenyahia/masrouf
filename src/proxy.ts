import { NextResponse, type NextRequest } from 'next/server';

/**
 * 1. Content-Security-Policy à NONCE par requête (scripts : 'nonce-…' + 'strict-dynamic',
 *    plus de 'unsafe-inline'). Next.js lit l'en-tête CSP de la requête et applique le nonce
 *    à ses propres scripts ; le layout racine le transmet à next-themes.
 * 2. Vérification OPTIMISTE de la session (présence du cookie) pour rediriger vers /connexion.
 *    La vraie vérification a lieu côté serveur dans chaque page/action (getCurrentUserId).
 */
const PUBLIC_PATHS = ['/connexion', '/inscription', '/offline'];
const AUTH_ONLY_PATHS = ['/connexion', '/inscription'];
const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token'];
const isDev = process.env.NODE_ENV !== 'production';

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Styles inline nécessaires à Recharts / Framer Motion (pas d'exécution de code).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

const matches = (pathname: string, list: string[]) =>
  list.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = SESSION_COOKIES.some((c) => request.cookies.has(c));

  if (!hasSession && !matches(pathname, PUBLIC_PATHS)) {
    const url = request.nextUrl.clone();
    url.pathname = '/connexion';
    url.search = pathname !== '/' ? `?callbackUrl=${encodeURIComponent(pathname)}` : '';
    return NextResponse.redirect(url);
  }
  if (hasSession && matches(pathname, AUTH_ONLY_PATHS)) {
    const url = request.nextUrl.clone();
    url.pathname = '/tableau-de-bord';
    url.search = '';
    return NextResponse.redirect(url);
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        '/((?!api/|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|robots.txt).*)',
      // Les préchargements (prefetch) n'ont pas besoin d'un nonce frais.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
