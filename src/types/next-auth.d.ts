import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: { id: string; sessionVersion?: number } & DefaultSession['user'];
  }
  interface User {
    sessionVersion?: number;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    uid?: string;
    /** Version de session (révocation) */
    sv?: number;
  }
}
