import 'server-only';

/**
 * IP du client pour le rate limiting. `X-Forwarded-For` est fourni par le client et n'est
 * fiable que pour les entrées ajoutées par NOS proxys : on prend la N-ième entrée en partant
 * de la fin, N = TRUST_PROXY_HOPS (0 = aucun proxy de confiance → l'en-tête est ignoré).
 */
const HOPS = (() => {
  const v = Number(process.env.TRUST_PROXY_HOPS ?? '0');
  return Number.isInteger(v) && v >= 0 && v <= 10 ? v : 0;
})();

export function clientIpFromHeaders(h: Pick<Headers, 'get'> | undefined | null): string {
  if (!h || HOPS === 0) return 'direct';
  const chain = (h.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = chain[chain.length - HOPS];
  return ip && /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : 'unknown';
}
