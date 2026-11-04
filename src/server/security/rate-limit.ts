/**
 * Rate limiting en mémoire (fenêtre glissante). Suffisant pour une instance unique ;
 * à remplacer par un stockage partagé (Redis…) si l'app est déployée sur plusieurs instances.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Millisecondes avant qu'une nouvelle tentative soit possible */
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
  reset(key: string): void;
}

export function createRateLimiter(max: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    check(key) {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        const oldest = recent[0] ?? now;
        return { allowed: false, remaining: 0, retryAfterMs: windowMs - (now - oldest) };
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      }
      return { allowed: true, remaining: max - recent.length, retryAfterMs: 0 };
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

const envInt = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/** Connexion / inscription : par e-mail et par IP. */
export const authLimiter = createRateLimiter(
  envInt('RATE_LIMIT_AUTH_MAX', 10),
  envInt('RATE_LIMIT_AUTH_WINDOW_MS', 60_000),
);
/** Appels IA : par utilisateur. */
export const aiLimiter = createRateLimiter(
  envInt('RATE_LIMIT_AI_MAX', 60),
  envInt('RATE_LIMIT_AI_WINDOW_MS', 60_000),
);
