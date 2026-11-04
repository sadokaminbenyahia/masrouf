import 'server-only';
import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { loginSchema } from '@/lib/schemas/auth';
import { prisma } from '@/server/db';
import { verifyPassword } from './password';
import { authLimiter, loginEmailLimiter } from '@/server/security/rate-limit';
import { clientIpFromHeaders } from '@/server/security/client-ip';

export class RateLimitedSignin extends CredentialsSignin {
  override code = 'rate_limited';
}

const EXAMPLE_SECRET = 'remplacez-moi-par-une-chaine-aleatoire-de-32-octets';

/** En production, refuse de démarrer avec un secret absent, d'exemple ou trop court. */
function resolveSecret(): string | undefined {
  const secret = process.env.AUTH_SECRET;
  const isProdServer =
    process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build';
  if (isProdServer && (!secret || secret === EXAMPLE_SECRET || secret.length < 32)) {
    throw new Error(
      'AUTH_SECRET invalide : définissez une valeur aléatoire d’au moins 32 caractères (openssl rand -base64 32).',
    );
  }
  return secret;
}

/** Durée de session : 7 jours (révocable via User.sessionVersion). */
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: resolveSecret(),
  trustHost: process.env.AUTH_TRUST_HOST === 'true',
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE },
  pages: { signIn: '/connexion' },
  providers: [
    Credentials({
      credentials: { email: { type: 'email' }, password: { type: 'password' } },
      async authorize(raw, request) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const ip = clientIpFromHeaders(request?.headers);
        // IP connue (proxy de confiance) : limites par IP et par couple e-mail+IP.
        // Toujours : plafond par e-mail (court) + plafond large sur 15 min.
        const checks = [
          authLimiter.check(`login:email:${email}`),
          loginEmailLimiter.check(`login:email:${email}`),
          ...(ip === 'direct' ? [] : [authLimiter.check(`login:ip:${ip}`)]),
        ];
        if (checks.some((c) => !c.allowed)) throw new RateLimitedSignin();
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, passwordHash: true, sessionVersion: true },
        });
        const valid = await verifyPassword(password, user?.passwordHash ?? null);
        if (!user || !valid) return null;
        authLimiter.reset(`login:email:${email}`);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
        token.sv = user.sessionVersion ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid;
      session.user.sessionVersion = token.sv ?? 0;
      return session;
    },
  },
});
