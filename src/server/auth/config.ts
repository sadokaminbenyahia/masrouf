import 'server-only';
import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { loginSchema } from '@/lib/schemas/auth';
import { prisma } from '@/server/db';
import { verifyPassword } from './password';
import { authLimiter } from '@/server/security/rate-limit';

export class RateLimitedSignin extends CredentialsSignin {
  override code = 'rate_limited';
}

function clientIp(request: Request | undefined): string {
  const fwd = request?.headers.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || request?.headers.get('x-real-ip') || 'local';
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/connexion' },
  providers: [
    Credentials({
      credentials: { email: { type: 'email' }, password: { type: 'password' } },
      async authorize(raw, request) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const ip = clientIp(request);
        if (
          !authLimiter.check(`login:email:${email}`).allowed ||
          !authLimiter.check(`login:ip:${ip}`).allowed
        ) {
          throw new RateLimitedSignin();
        }
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, passwordHash: true },
        });
        const valid = await verifyPassword(password, user?.passwordHash ?? null);
        if (!user || !valid) return null;
        authLimiter.reset(`login:email:${email}`);
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid;
      return session;
    },
  },
});
