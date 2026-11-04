/**
 * Normalisation des questions posées à l'assistant : minuscules, sans accents, apostrophes et
 * tirets ramenés à des espaces, espaces compactés. Les chiffres, virgules et points sont gardés
 * (montants, dates « 12/03 »).
 */

const STOPWORDS = new Set([
  'le',
  'la',
  'les',
  'de',
  'du',
  'des',
  'un',
  'une',
  'et',
  'en',
  'au',
  'aux',
  'pour',
  'par',
  'sur',
  'dans',
  'avec',
  'chez',
  'mon',
  'ma',
  'mes',
  'ton',
  'ta',
  'tes',
  'son',
  'sa',
  'ses',
  'je',
  'tu',
  'il',
  'elle',
  'on',
  'nous',
  'vous',
  'me',
  'te',
  'se',
  'ai',
  'est',
  'ce',
  'cet',
  'cette',
  'ces',
  'que',
  'qui',
  'quoi',
  'qu',
  'quel',
  'quelle',
  'quels',
  'quelles',
  'combien',
  'mois',
  'annee',
  'semaine',
  'jour',
  'jours',
  'dernier',
  'derniere',
  'derniers',
  'dernieres',
  'depuis',
  'entre',
  'plus',
  'moins',
  'tout',
  'tous',
  'toutes',
  'fait',
  'ca',
  'cela',
  'y',
  'a',
  'j',
  'l',
  'd',
  'm',
  't',
  's',
  'n',
  'c',
]);

/** Texte normalisé : « Combien j’ai dépensé en RESTO ? » → « combien j ai depense en resto ? ». */
export function normalizeQuestion(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’'`´‘ʼ]/g, ' ')
    .replace(/(\p{L})-(\p{L})/gu, '$1 $2')
    .replace(/(\p{L})-(\p{L})/gu, '$1 $2')
    .replace(/[«»"“”!?;:()[\]{}]/g, ' ')
    .replace(/[\s  ]+/g, ' ')
    .trim();
}

/** Mots alphabétiques significatifs (sans mots vides), ≥ 3 lettres. */
export function contentWords(norm: string): string[] {
  return (norm.match(/\p{L}+/gu) ?? []).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** Pluriel simple : « cafes » → « cafe », « bijoux » → « bijou ». */
export function singular(word: string): string {
  if (word.length > 3 && (word.endsWith('s') || word.endsWith('x'))) return word.slice(0, -1);
  return word;
}

/** Trigrammes de caractères avec bornes (« cafe » → « _ca », « caf », « afe », « fe_ »). */
export function trigrams(word: string): Set<string> {
  const padded = ` ${word} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Similarité floue entre deux mots (pluriels neutralisés). */
export function wordSimilarity(a: string, b: string): number {
  const sa = singular(a);
  const sb = singular(b);
  if (sa === sb) return 1;
  return jaccard(trigrams(sa), trigrams(sb));
}

/** Masque (par des espaces) les portions [start, end[ du texte, pour éviter de les relire. */
export function maskSpans(text: string, spans: readonly (readonly [number, number])[]): string {
  let out = text;
  for (const [start, end] of spans) {
    out = out.slice(0, start) + ' '.repeat(Math.max(0, end - start)) + out.slice(end);
  }
  return out;
}

/** Hash FNV-1a 32 bits (choix déterministe de gabarits). */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Première lettre en majuscule. */
export function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}
