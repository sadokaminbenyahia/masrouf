// Propriétaire : agent J. Normalisation des libellés, socle commun de l'IA (AI-DESIGN §0).

/** Mots vides retirés des tokens. */
export const STOPWORDS: ReadonlySet<string> = new Set([
  'le',
  'la',
  'les',
  'de',
  'du',
  'des',
  'd',
  'l',
  'et',
  'a',
  'au',
  'aux',
  'en',
  'pour',
  'chez',
  'sur',
  'un',
  'une',
  'par',
]);

/** Villes et quartiers tunisiens, retirés de `merchantKey` uniquement. */
export const TUNISIAN_PLACES: ReadonlySet<string> = new Set([
  'tunis',
  'ariana',
  'sfax',
  'sousse',
  'lac',
  'marsa',
  'carthage',
  'bardo',
  'manouba',
  'nabeul',
  'hammamet',
  'bizerte',
  'monastir',
  'mahdia',
  'kairouan',
  'gabes',
  'gafsa',
  'djerba',
  'medenine',
  'tozeur',
  'kef',
  'beja',
  'jendouba',
  'siliana',
  'zaghouan',
  'kasserine',
  'kebili',
  'tataouine',
  'menzah',
  'manar',
  'ennasr',
  'nasr',
  'aouina',
  'kram',
  'goulette',
  'megrine',
  'rades',
  'ezzahra',
  'mourouj',
  'gammarth',
  'soukra',
  'mutuelleville',
  'menzeh',
  'bouhsina',
  'msaken',
  'kelibia',
  'zarzis',
  'centre',
  'ville',
]);

const LEGAL_FORMS_RE = /\b(?:sarl|sa|suarl|ste|ets)\b/g;
const BANK_PREFIX_RE =
  /\b(?:paiement(?:\s+(?:cb|tpe|carte))?|achat(?:\s+(?:cb|tpe))?|retrait\s+(?:dab|gab)|vir(?:ement)?(?:\s+(?:recu|emis|sepa))?|prlv|prelevement|fact(?:ure)?|cb|tpe)\b/g;
const DATE_RE = /\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g;
const TIME_RE = /\b\d{1,2}[:h]\d{2}\b/g;
const CARD_RE = /[x*]{2,}\d{2,4}\b/g;
const REFERENCE_RE = /\b\d{4,}\b/g;
// Caches bornés (les libellés se répètent beaucoup) : fonctions pures, résultat identique.
const CACHE_LIMIT = 5000;
const normalizeCache = new Map<string, string>();
const tokenCache = new Map<string, string[]>();
const merchantCache = new Map<string, string>();

function memo<T>(cache: Map<string, T>, key: string, compute: (k: string) => T): T {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = compute(key);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, value);
  return value;
}

const SEPARATOR_RE = /[^a-z0-9؀-ۿ]+/g;

/**
 * Minuscules, sans diacritiques (latin et arabe), apostrophes et ligatures simplifiées.
 * Conserve la ponctuation (la découpe se fait plus tard).
 */
export function foldText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[œ]/g, 'oe')
    .replace(/[æ]/g, 'ae')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[ـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[’`´]/g, "'");
}

function collapse(s: string): string {
  return s.replace(SEPARATOR_RE, ' ').trim().replace(/\s+/g, ' ');
}

function stripNoise(s: string): string {
  return s
    .replace(DATE_RE, ' ')
    .replace(TIME_RE, ' ')
    .replace(CARD_RE, ' ')
    .replace(REFERENCE_RE, ' ')
    .replace(LEGAL_FORMS_RE, ' ');
}

/**
 * Minuscules, sans accents, sans préfixes bancaires (PAIEMENT CB…), dates, heures, cartes
 * masquées, références et formes juridiques. Les mots sont séparés par une espace.
 * Si le retrait des préfixes vide le libellé (« RETRAIT DAB »), on garde ces mots.
 */
export function normalizeLabel(raw: string): string {
  return memo(normalizeCache, raw, computeNormalizedLabel);
}

function computeNormalizedLabel(raw: string): string {
  const folded = foldText(raw);
  const withoutPrefixes = collapse(stripNoise(folded.replace(BANK_PREFIX_RE, ' ')));
  if (withoutPrefixes !== '') return withoutPrefixes;
  return collapse(stripNoise(folded));
}

// ───────────────────────── Libellé lisible (import) ─────────────────────────

const CLEAN_PREFIX_RE =
  /^(?:\s*(?:paiement(?:\s+par)?(?:\s+(?:cb|tpe|carte))?|achat(?:\s+(?:par\s+)?(?:cb|tpe|carte))?|retrait(?:\s+(?:dab|gab))?|vir(?:ement)?(?:\s+(?:re[cç]u|[eé]mis|sepa|permanent))?|prlv(?:\s+sepa)?|pr[eé]l[eè]vement|cb|tpe|carte)(?![\p{L}\d])[\s:.\-/*]*)+/iu;
const CLEAN_REF_RE = /(?:\b(?:r[eé]f|n°|no|num)\s*[:.]?\s*[\w-]*\d[\w-]*)|n°\s*\S+/giu;
const CLEAN_CARD_RE = /(?:\bcarte\s+)?(?:[x*]{2,}\s?\d{2,4}\b|\b\d{4}[x*]{2,}\w*)/giu;
/** Dates « AAAA-MM(-JJ) » (les dates « JJ/MM » sont couvertes par DATE_RE). */
const CLEAN_ISO_DATE_RE = /\b(?:19|20)\d{2}[/.-]\d{1,2}(?:[/.-]\d{1,2})?\b/g;
/** Références : tout mot contenant 4 chiffres ou plus, sauf une année seule (« 2026 »). */
const CLEAN_DIGIT_TOKEN_RE = /\b(?!(?:19|20)\d{2}\b)[\p{L}]*\d{4,}[\p{L}\d]*\b/gu;
const CLEAN_LEGAL_RE = /\b(?:sarl|suarl|ste|ets|s\.a\.?)(?![\p{L}])/giu;
/** Petits mots laissés en minuscules (sauf en tête). */
const LOWER_WORDS: ReadonlySet<string> = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'et',
  'à',
  'a',
  'au',
  'aux',
  'en',
  'sur',
  'pour',
]);

function titleCaseFr(s: string): string {
  const words = s.toLocaleLowerCase('fr').split(' ');
  return words
    .map((w, i) => {
      if (w === '') return w;
      // « La Marsa », « La Goulette » : l'article fait partie du nom de lieu.
      const next = foldText(words[i + 1] ?? '');
      const placeArticle = (w === 'la' || w === 'le' || w === 'les') && TUNISIAN_PLACES.has(next);
      if (i > 0 && LOWER_WORDS.has(w) && !placeArticle) return w;
      // « l'aouina » → « L'Aouina », « d'or » → « d'Or »
      const m = /^([ld]')(.+)$/u.exec(w);
      if (m) {
        const head = i === 0 ? (m[1] ?? '').toLocaleUpperCase('fr') : (m[1] ?? '');
        const rest = m[2] ?? '';
        return `${head}${rest.charAt(0).toLocaleUpperCase('fr')}${rest.slice(1)}`;
      }
      return w
        .split('-')
        .map((part) => part.charAt(0).toLocaleUpperCase('fr') + part.slice(1))
        .join('-');
    })
    .join(' ');
}

function tidy(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/^[\s,.;:\-/]+|[\s,.;:\-/]+$/g, '')
    .replace(/\s+-\s+-\s+/g, ' - ')
    .trim();
}

/**
 * Libellé lisible pour l'import : retire les préfixes bancaires (« PAIEMENT CB »…), les dates,
 * heures, références, cartes masquées et formes juridiques ; garde le marchand ET la ville ;
 * casse « Titre » à la française. « PAIEMENT CB MONOPRIX MENZAH 02/11 » → « Monoprix Menzah ».
 * Si tout est retiré (« RETRAIT DAB 12/03 »), on garde les mots du libellé d'origine.
 */
export function cleanLabel(raw: string): string {
  const base = raw.replace(/[’`´]/g, "'").replace(/\s+/g, ' ').trim();
  const noise = (s: string) =>
    tidy(
      s
        .replace(CLEAN_CARD_RE, ' ')
        .replace(CLEAN_REF_RE, ' ')
        .replace(CLEAN_ISO_DATE_RE, ' ')
        .replace(DATE_RE, ' ')
        .replace(TIME_RE, ' ')
        .replace(CLEAN_DIGIT_TOKEN_RE, ' ')
        .replace(CLEAN_LEGAL_RE, ' '),
    );
  const cleaned = noise(base.replace(CLEAN_PREFIX_RE, ''));
  const kept = cleaned !== '' ? cleaned : noise(base);
  return kept === '' ? base : titleCaseFr(kept);
}

/** Clé de comparaison d'un nom (catégorie, compte) : « Famille & cadeaux » → « famille cadeaux ». */
export function nameKey(name: string): string {
  return collapse(foldText(name));
}

/** Racine légère : retire un « s » ou un « x » final (pluriels) sur les mots de plus de 3 lettres. */
export function stem(token: string): string {
  return token.length > 3 && /[sx]$/.test(token) ? token.slice(0, -1) : token;
}

/** Tokens significatifs (sans mots vides), d'au moins 2 caractères. */
export function tokenize(raw: string): string[] {
  return [...memo(tokenCache, raw, computeTokens)];
}

function computeTokens(raw: string): string[] {
  const normalized = normalizeLabel(raw);
  if (normalized === '') return [];
  return normalized.split(' ').filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * Clé marchand stable : les deux premiers tokens hors villes et nombres.
 * « PAIEMENT CB CARREFOUR LA MARSA 12/03 » → « carrefour » (la ville est retirée),
 * « MONOPRIX LAC 2 » → « monoprix ». Si tout est retiré, on garde les tokens bruts.
 */
export function merchantKey(raw: string): string {
  return memo(merchantCache, raw, computeMerchantKey);
}

function computeMerchantKey(raw: string): string {
  const tokens = tokenize(raw);
  const significant = tokens.filter((t) => !TUNISIAN_PLACES.has(t) && !/^\d+$/.test(t));
  const chosen = significant.length > 0 ? significant : tokens;
  return chosen.slice(0, 2).join(' ');
}

/** Trigrammes de caractères d'un mot ou d'une clé (bornes marquées par « # »). */
export function charTrigrams(key: string): string[] {
  if (key === '') return [];
  const padded = `#${key.replace(/ /g, '#')}#`;
  const out: string[] = [];
  for (let i = 0; i + 3 <= padded.length; i++) out.push(padded.slice(i, i + 3));
  return out;
}

/** Similarité de Jaccard entre deux ensembles de chaînes (0 si les deux sont vides). */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}
