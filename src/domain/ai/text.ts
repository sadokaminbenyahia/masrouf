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
  const folded = foldText(raw);
  const withoutPrefixes = collapse(stripNoise(folded.replace(BANK_PREFIX_RE, ' ')));
  if (withoutPrefixes !== '') return withoutPrefixes;
  return collapse(stripNoise(folded));
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
