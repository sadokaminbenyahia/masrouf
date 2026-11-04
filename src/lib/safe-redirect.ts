/**
 * Valide une URL de retour (callbackUrl) : uniquement un chemin INTERNE de l'application.
 * Refuse les caractères de contrôle et les antislashs (le parseur WHATWG supprime \t \n
 * et traite « \ » comme « / » : « /\t/evil.com » deviendrait « //evil.com »), puis vérifie
 * que l'origine résolue est inchangée. Renvoie le chemin reconstruit (pathname + search).
 */
const FALLBACK = '/tableau-de-bord';
const FORBIDDEN_PREFIXES = ['/connexion', '/inscription', '/api/'];

export function safeInternalPath(raw: unknown, fallback: string = FALLBACK): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return fallback;
  if (/[\u0000-\u001F\u007F\\]/.test(raw)) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  let url: URL;
  try {
    url = new URL(raw, 'http://masrouf.invalid');
  } catch {
    return fallback;
  }
  if (url.origin !== 'http://masrouf.invalid') return fallback;
  const path = `${url.pathname}${url.search}`;
  if (
    FORBIDDEN_PREFIXES.some(
      (p) => url.pathname === p || url.pathname.startsWith(p.endsWith('/') ? p : `${p}/`),
    )
  ) {
    return fallback;
  }
  return path;
}
