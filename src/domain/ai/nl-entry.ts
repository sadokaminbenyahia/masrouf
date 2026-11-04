// Propriétaire : agent J. Saisie en langage naturel (règles + regex, AI-DESIGN §2).
// Ordre : montant → date → type → compte → catégorie ; le reste devient le libellé.
import { addDays, daysInMonth, diffDays, isISODate, isoWeekday, parseISODate, toISODate } from '../dates';
import type { ISODate } from '../dates';
import type { Millimes } from '../money';
import { categorize } from './categorizer';
import { nameKey } from './text';
import type { ParseEntryContext, ParseEntryResult, ParsedEntry } from './types';

export interface AmountMatch {
  /** Montant en millimes (> 0) */
  amount: Millimes;
  /** Position dans le texte d'origine (fin exclue) */
  start: number;
  end: number;
}

export interface DateMatch {
  date: ISODate;
  start: number;
  end: number;
}

interface Span {
  start: number;
  end: number;
}

export const NL_EXAMPLES: readonly string[] = [
  'café 3,500 hier',
  'salaire 2400 le 1er',
  'courses carrefour 87,250 avant-hier',
  'taxi 7 dt en espèces',
];

/**
 * Minuscules et sans accents, en conservant la LONGUEUR du texte (les positions trouvées sur
 * le texte replié valent pour le texte d'origine). Les apostrophes typographiques deviennent « ' ».
 */
export function foldKeepLength(text: string): string {
  let out = '';
  for (const ch of text) {
    let f = ch.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    if (/[’`´]/.test(f)) f = "'";
    if (/[  ]/.test(f)) f = ' ';
    out += f.length === ch.length ? f : (f + ' '.repeat(ch.length)).slice(0, ch.length);
  }
  return out;
}

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

// ───────────────────────── Dates ─────────────────────────

const MONTHS: Record<string, number> = {
  janvier: 1,
  janv: 1,
  jan: 1,
  fevrier: 2,
  fevr: 2,
  fev: 2,
  mars: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  juil: 7,
  aout: 8,
  septembre: 9,
  sept: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  decembre: 12,
  dec: 12,
};
const MONTH_ALT = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|');
const WEEKDAYS: Record<string, number> = {
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
  dimanche: 7,
};
const SMALL_NUMBERS: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5 };

const NUMERIC_DATE_RE = /(?<![\d/.,-])(\d{1,2})(?:([/-])(\d{1,2})(?:\2(\d{2}|\d{4}))?|\.(\d{1,2})\.(\d{2}|\d{4}))(?![\d/.,-])/gu;
const DAY_MONTH_RE = new RegExp(
  `(?<![\\p{L}\\d])(?:le\\s+)?(1er|\\d{1,2})\\s+(${MONTH_ALT})\\.?(?:\\s+(\\d{4}))?(?![\\p{L}\\d])`,
  'gu',
);
const AGO_RE = /(?<![\p{L}\d])il\s+y\s+a\s+(\d{1,3}|une?|deux|trois|quatre|cinq)\s+(jours?|semaines?)(?![\p{L}\d])/gu;
const DAY_OF_MONTH_RE = /(?<![\p{L}\d])(?:le\s+(\d{1,2})(?:er)?|(\d{1,2})er)(?![\p{L}\d]|[.,/]\d)/gu;
const RELATIVE_RE = /(?<![\p{L}\d])(avant[\s-]hier|aujourd\s?'?\s?hui|auj|ce\s+(?:matin|midi|soir)|hier(?:\s+soir)?)(?![\p{L}\d])/gu;
const WEEKDAY_RE = /(?<![\p{L}\d])(?:(?:ce|le)\s+)?(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?:\s+dernier)?(?![\p{L}\d])/gu;

/** Dernière occurrence passée (ou aujourd'hui) du jour `day` du mois, en remontant au besoin. */
function lastDayOfMonth(today: ISODate, day: number): ISODate | null {
  if (day < 1 || day > 31) return null;
  const t = parseISODate(today);
  let year = t.year;
  let month = t.month;
  for (let i = 0; i < 12; i++) {
    if (day <= daysInMonth(year, month)) {
      const d = toISODate(year, month, day);
      if (d <= today) return d;
    }
    month--;
    if (month === 0) {
      month = 12;
      year--;
    }
  }
  return null;
}

/** Date (jour/mois) la plus récente passée ou égale à aujourd'hui, ou de l'année donnée. */
function dayMonthDate(today: ISODate, day: number, month: number, year?: number): ISODate | null {
  const t = parseISODate(today);
  if (month < 1 || month > 12) return null;
  if (year !== undefined) {
    const d = toISODate(year, month, Math.max(1, day));
    return day >= 1 && isISODate(d) ? d : null;
  }
  for (const y of [t.year, t.year - 1]) {
    const d = toISODate(y, month, Math.max(1, day));
    if (day >= 1 && isISODate(d) && d <= today) return d;
  }
  return null;
}

function fullYear(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const y = Number(raw);
  return raw.length === 2 ? 2000 + y : y;
}

interface DateCandidate extends DateMatch {
  /** Priorité (plus petit = plus spécifique) */
  rank: number;
}

function dateCandidates(folded: string, today: ISODate): DateCandidate[] {
  const out: DateCandidate[] = [];
  const push = (m: RegExpExecArray, date: ISODate | null, rank: number) => {
    if (date === null) return;
    out.push({ date, start: m.index, end: m.index + m[0].length, rank });
  };
  for (const m of folded.matchAll(NUMERIC_DATE_RE)) {
    const day = Number(m[1]);
    const month = Number(m[3] ?? m[5]);
    push(m, dayMonthDate(today, day, month, fullYear(m[4] ?? m[6])), 0);
  }
  for (const m of folded.matchAll(DAY_MONTH_RE)) {
    const day = m[1] === '1er' ? 1 : Number(m[1]);
    push(m, dayMonthDate(today, day, MONTHS[m[2] ?? ''] ?? 0, fullYear(m[3])), 0);
  }
  for (const m of folded.matchAll(AGO_RE)) {
    const raw = m[1] ?? '';
    const n = SMALL_NUMBERS[raw] ?? Number(raw);
    const days = (m[2] ?? '').startsWith('semaine') ? 7 * n : n;
    push(m, addDays(today, -days), 1);
  }
  for (const m of folded.matchAll(RELATIVE_RE)) {
    const w = m[1] ?? '';
    const offset = w.startsWith('avant') ? -2 : w.startsWith('hier') ? -1 : 0;
    push(m, addDays(today, offset), 1);
  }
  for (const m of folded.matchAll(WEEKDAY_RE)) {
    const target = WEEKDAYS[m[1] ?? ''] ?? 1;
    const back = (isoWeekday(today) - target + 7) % 7 || 7;
    push(m, addDays(today, -back), 2);
  }
  for (const m of folded.matchAll(DAY_OF_MONTH_RE)) {
    push(m, lastDayOfMonth(today, Number(m[1] ?? m[2])), 3);
  }
  // Retire les candidats inclus dans un candidat plus spécifique (« le 12 mars » ⊃ « le 12 »).
  return out
    .filter((c) => !out.some((o) => o !== c && o.rank < c.rank && overlaps(o, c)))
    .sort((a, b) => a.rank - b.rank || a.start - b.start);
}

/**
 * Trouve une date dans le texte : aujourd'hui, hier, avant-hier, « il y a N jours »,
 * un jour de semaine (le plus récent passé, aujourd'hui exclu), « le 1er », « le 15 »
 * (dernière occurrence passée ou aujourd'hui), « 12/03 », « 12 mars ».
 */
export function extractDate(text: string, today: ISODate): DateMatch | null {
  const best = dateCandidates(foldKeepLength(text), today)[0];
  return best ? { date: best.date, start: best.start, end: best.end } : null;
}

/** Zones numériques qui ressemblent à une date (exclues de la recherche du montant). */
function dateLikeSpans(folded: string): Span[] {
  const spans: Span[] = [];
  for (const re of [NUMERIC_DATE_RE, DAY_MONTH_RE, AGO_RE, DAY_OF_MONTH_RE]) {
    for (const m of folded.matchAll(re)) spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

// ───────────────────────── Montant ─────────────────────────

const AMOUNT_RE =
  /(?<![\p{L}\d])(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d{1,3}))?\s*(dt|tnd|dinars?|d|millimes?|mill?|m)?(?![\p{L}\d])/gu;

interface AmountCandidate extends AmountMatch {
  hasUnit: boolean;
  hasDecimals: boolean;
}

function amountCandidates(folded: string): AmountCandidate[] {
  const dates = dateLikeSpans(folded);
  const out: AmountCandidate[] = [];
  for (const m of folded.matchAll(AMOUNT_RE)) {
    const intDigits = (m[1] ?? '').replace(/[   ]/g, '');
    const frac = m[2];
    const unit = m[3];
    const start = m.index;
    const end = start + m[0].trimEnd().length;
    const hasUnit = unit !== undefined;
    if (!hasUnit && dates.some((d) => overlaps(d, { start, end }))) continue;
    let amount: number;
    if (unit !== undefined && /^m/.test(unit)) amount = Number(intDigits);
    else amount = Number(intDigits) * 1000 + (frac ? Number(frac.padEnd(3, '0')) : 0);
    if (!Number.isSafeInteger(amount) || amount <= 0) continue;
    out.push({ amount, start, end, hasUnit, hasDecimals: frac !== undefined });
  }
  return out;
}

/**
 * Trouve le montant d'une phrase. « 3,500 » = 3500, « 3.5 » = 3500, « 2400 » = 2 400 000,
 * « 500 millimes » = 500, « 1 200 » = 1 200 000. Les nombres collés à des lettres (« 9ahwa »)
 * et ceux qui forment une date (« le 15 », « 12/03 », « il y a 3 jours ») sont ignorés.
 * Plusieurs candidats : celui avec une unité, sinon avec des décimales, sinon le plus grand.
 */
export function extractAmount(text: string): AmountMatch | null {
  const candidates = amountCandidates(foldKeepLength(text));
  const score = (c: AmountCandidate) => (c.hasUnit ? 2 : 0) + (c.hasDecimals ? 1 : 0);
  let best: AmountCandidate | null = null;
  for (const c of candidates) {
    if (!best || score(c) > score(best) || (score(c) === score(best) && c.amount > best.amount)) best = c;
  }
  return best ? { amount: best.amount, start: best.start, end: best.end } : null;
}

// ───────────────────────── Type et compte ─────────────────────────

const INCOME_RE =
  /(?<![\p{L}\d])(salaire|paie|prime|bonus|recu|recue|remboursement|rembourse|vente|vendu|freelance|upwork|fiverr|virement\s+recu)(?![\p{L}\d])/u;

const ACCOUNT_RE =
  /(?<![\p{L}\d])(?:(?:en|par|avec|via|au|a|sur|du|de)\s+(?:la\s+|ma\s+|le\s+|mon\s+)?)?(especes|espece|cash|liquide|carte\s+bancaire|carte|cb|visa|mastercard|banque|virement|cheque)(?![\p{L}\d])/u;

const ACCOUNT_TYPES: Record<string, string> = {
  especes: 'CASH',
  espece: 'CASH',
  cash: 'CASH',
  liquide: 'CASH',
  carte: 'CARD',
  cb: 'CARD',
  visa: 'CARD',
  mastercard: 'CARD',
  banque: 'BANK',
  virement: 'BANK',
  cheque: 'BANK',
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectAccount(
  folded: string,
  accounts: ParseEntryContext['accounts'],
): { accountId: string | null; span: Span | null } {
  for (const a of accounts) {
    const key = nameKey(a.name);
    if (key.length < 3) continue;
    const re = new RegExp(
      `(?<![\\p{L}\\d])(?:(?:en|par|avec|via|sur|du|de)\\s+(?:la\\s+|ma\\s+|le\\s+|mon\\s+)?)?${key
        .split(' ')
        .map(escapeRe)
        .join('[\\s\\p{P}]+')}(?![\\p{L}\\d])`,
      'u',
    );
    const m = re.exec(folded);
    if (m) return { accountId: a.id, span: { start: m.index, end: m.index + m[0].length } };
  }
  const m = ACCOUNT_RE.exec(folded);
  if (!m) return { accountId: null, span: null };
  const word = (m[1] ?? '').split(/\s+/)[0] ?? '';
  const type = ACCOUNT_TYPES[word];
  const account = accounts.find((a) => a.type === type);
  return { accountId: account?.id ?? null, span: { start: m.index, end: m.index + m[0].length } };
}

// ───────────────────────── Libellé ─────────────────────────

const FILLER = new Set([
  "j'ai",
  'jai',
  'paye',
  'payee',
  'depense',
  'achete',
  'dt',
  'tnd',
  'dinar',
  'dinars',
  'millime',
  'millimes',
]);
const EDGE_WORDS = new Set([
  'le',
  'la',
  'les',
  'de',
  'du',
  'des',
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
  'avec',
  'et',
  'ce',
  'cette',
  'pour',
]);
const PUNCT_EDGES = /^[\s,;:.!?()"«»—–-]+|[\s,;:.!?()"«»—–-]+$/gu;

function cleanLabel(text: string, removed: readonly Span[]): string {
  let kept = '';
  for (let i = 0; i < text.length; i++) {
    kept += removed.some((s) => i >= s.start && i < s.end) ? ' ' : text[i];
  }
  const words = kept
    .split(/\s+/)
    .map((w) => w.replace(PUNCT_EDGES, ''))
    .filter((w) => w !== '' && !FILLER.has(foldKeepLength(w)));
  const fold = (w: string) => foldKeepLength(w).replace(/^[ld]'/, '');
  while (words.length > 0 && EDGE_WORDS.has(fold(words[0] ?? ''))) words.shift();
  while (words.length > 0 && EDGE_WORDS.has(fold(words[words.length - 1] ?? ''))) words.pop();
  const label = words.join(' ').replace(/^[lLdD]['’](?=\p{L})/u, '');
  return label === '' ? '' : label.charAt(0).toLocaleUpperCase('fr') + label.slice(1);
}

// ───────────────────────── Analyse complète ─────────────────────────

const UNUSUAL_EXPENSE = 5_000_000;
const UNUSUAL_INCOME = 50_000_000;
const OLD_DATE_DAYS = 60;

/**
 * « café 3,500 hier » → { amount: 3500, date: hier, label: « Café », type: EXPENSE, … }.
 * Sans montant : `{ ok: false, message, examples }`.
 */
export function parseEntry(text: string, ctx: ParseEntryContext): ParseEntryResult {
  const source = text.slice(0, 500);
  const folded = foldKeepLength(source);
  const amount = extractAmount(source);
  if (!amount) {
    return {
      ok: false,
      message: 'Je n’ai pas trouvé de montant. Indiquez-le en dinars, par exemple « café 3,500 ».',
      examples: [...NL_EXAMPLES],
    };
  }

  const removed: Span[] = [{ start: amount.start, end: amount.end }];
  const dateMatch = dateCandidates(folded, ctx.today).find((d) => !overlaps(d, amount));
  if (dateMatch) removed.push(dateMatch);

  const lead = /^\s*([+-])/.exec(source);
  if (lead) removed.push({ start: lead.index, end: lead.index + lead[0].length });
  const explicitIncome = lead?.[1] === '+' || INCOME_RE.test(folded);
  const explicitExpense = lead?.[1] === '-';

  const account = detectAccount(folded, ctx.accounts);
  if (account.span && !overlaps(account.span, amount)) removed.push(account.span);

  const tags: string[] = [];
  for (const m of source.matchAll(/(?<![\p{L}\d])#([\p{L}\d][\p{L}\d_-]*)/gu)) {
    const tag = m[1] ?? '';
    if (!tags.includes(tag)) tags.push(tag);
    removed.push({ start: m.index, end: m.index + m[0].length });
  }

  const label = cleanLabel(source, removed);
  let type: 'EXPENSE' | 'INCOME' = explicitIncome ? 'INCOME' : 'EXPENSE';
  let prediction =
    label === '' ? null : categorize(ctx.model, { label, amount: amount.amount, type }, ctx.categories);
  if (!explicitIncome && !explicitExpense && label !== '') {
    // Sans indice explicite, un libellé reconnu comme revenu (« chahriya ») bascule en revenu.
    const asIncome = categorize(ctx.model, { label, amount: amount.amount, type: 'INCOME' }, ctx.categories);
    if (asIncome && asIncome.confidence > (prediction?.confidence ?? 0) && asIncome.source !== 'RULE') {
      type = 'INCOME';
      prediction = asIncome;
    } else if (asIncome && !prediction) {
      type = 'INCOME';
      prediction = asIncome;
    }
  }

  const date = dateMatch?.date ?? ctx.today;
  const warnings: string[] = [];
  if (amount.amount >= (type === 'EXPENSE' ? UNUSUAL_EXPENSE : UNUSUAL_INCOME)) {
    warnings.push('Montant inhabituel : vérifiez-le.');
  }
  if (diffDays(date, ctx.today) > OLD_DATE_DAYS) warnings.push('Date éloignée : vérifiez-la.');

  const entry: ParsedEntry = {
    amount: amount.amount,
    type,
    date,
    label: label === '' ? (type === 'INCOME' ? 'Revenu' : 'Dépense') : label,
    categoryId: prediction?.categoryId ?? null,
    categoryConfidence: prediction?.confidence ?? null,
    accountId: account.accountId,
    tags,
    warnings,
  };
  return { ok: true, entry };
}
