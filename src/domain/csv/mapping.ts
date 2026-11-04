/**
 * Correspondance colonnes CSV → transactions : devinette des colonnes à partir des en-têtes
 * (français ou anglais, avec ou sans accents), lecture des dates et des montants bancaires,
 * puis conversion en `ImportRow[]` (côté client, avant l'aperçu serveur).
 */
import { isISODate, toISODate, type ISODate } from '../dates';
import { MAX_AMOUNT_MILLIMES, type Millimes } from '../money';
import type { ImportRow } from '../types';

export type DateFormat = 'DMY' | 'YMD' | 'MDY';

export interface ColumnMapping {
  date: number;
  label: number;
  /** Montant signé (négatif = dépense) */
  amount: number | null;
  debit: number | null;
  /** OU deux colonnes */
  credit: number | null;
  note: number | null;
  dateFormat: DateFormat;
}

/** Longueurs maximales acceptées par le serveur (`importRowSchema`). */
export const MAX_LABEL_LENGTH = 140;
export const MAX_NOTE_LENGTH = 500;
/** Plafond de sécurité (identique à `MAX_AMOUNT_MILLIMES`). */
const MAX_AMOUNT: Millimes = MAX_AMOUNT_MILLIMES;

// ───────────────────────── En-têtes ─────────────────────────

/** « Date opération (TND) » → « date operation tnd » : minuscules, sans accents ni ponctuation. */
export function normalizeHeader(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

type Field = 'date' | 'label' | 'amount' | 'debit' | 'credit' | 'note';

/**
 * Motifs par champ, du plus spécifique au moins spécifique. Un motif correspond si l'en-tête
 * normalisé lui est égal (score fort) ou contient tous ses mots (score plus faible).
 */
const HEADER_PATTERNS: Record<Field, readonly string[]> = {
  date: [
    'date',
    'date operation',
    'date op',
    'date de l operation',
    'transaction date',
    'booking date',
    'posting date',
    'jour',
    'date valeur',
    'value date',
  ],
  label: [
    'libelle',
    'libelle operation',
    'description',
    'operation',
    'label',
    'intitule',
    'designation',
    'details',
    'detail',
    'motif',
    'narration',
    'payee',
    'beneficiaire',
    'transaction',
  ],
  amount: ['montant', 'amount', 'somme', 'montant tnd', 'montant dt'],
  debit: [
    'debit',
    'debits',
    'retrait',
    'retraits',
    'sortie',
    'sorties',
    'depense',
    'withdrawal',
    'paid out',
  ],
  credit: [
    'credit',
    'credits',
    'versement',
    'versements',
    'entree',
    'entrees',
    'recette',
    'deposit',
    'paid in',
  ],
  note: ['note', 'notes', 'commentaire', 'commentaires', 'remarque', 'reference', 'ref', 'memo'],
};

function headerScore(header: string, field: Field): number {
  const words = header.split(' ');
  const patterns = HEADER_PATTERNS[field];
  let best = 0;
  patterns.forEach((pattern, rank) => {
    const weight = patterns.length - rank;
    if (header === pattern) {
      best = Math.max(best, 1000 + weight);
      return;
    }
    const patternWords = pattern.split(' ');
    if (patternWords.every((w) => words.includes(w))) best = Math.max(best, 100 + weight);
  });
  return best;
}

function bestColumn(
  headers: readonly string[],
  field: Field,
  used: ReadonlySet<number>,
): number | null {
  let best: number | null = null;
  let bestScore = 0;
  headers.forEach((h, index) => {
    if (used.has(index)) return;
    const score = headerScore(h, field);
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

// ───────────────────────── Dates ─────────────────────────

const DATE_RE = /^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})$/;
const COMPACT_DATE_RE = /^((?:19|20)\d{2})(\d{2})(\d{2})$/;

/** Année sur 2 chiffres → 20xx (les longueurs 1 et 3 sont refusées en amont). */
function expandYear(raw: string): number {
  return raw.length === 2 ? 2000 + Number(raw) : Number(raw);
}

function buildDate(year: number, month: number, day: number): ISODate | null {
  if (year < 1900 || year > 2100) return null;
  const iso = toISODate(year, month, day);
  return isISODate(iso) ? iso : null;
}

/** Partie date d'une cellule « 12/03/2026 10:45 » ou « 2026-03-12T10:45:00Z ». */
function datePart(raw: string): string {
  const s = raw.trim().replace(/^"|"$/g, '');
  const iso = /^(\d{4}-\d{2}-\d{2})T/.exec(s);
  if (iso?.[1]) return iso[1];
  return s.split(/\s+/)[0] ?? '';
}

/**
 * Lit une date bancaire. L'année sur 4 chiffres en tête impose AAAA-MM-JJ quel que soit le format.
 * Années sur 2 chiffres → 20xx. Le jour est validé selon le mois (pas de 31/02).
 *  « 12/03/2026 », « 12-03-26 », « 12.03.2026 » (DMY), « 2026-03-12 », « 20260312 ».
 */
export function parseDateCell(raw: string, format: DateFormat): ISODate | null {
  const s = datePart(raw);
  if (s === '') return null;
  const compact = COMPACT_DATE_RE.exec(s);
  if (compact) return buildDate(Number(compact[1]), Number(compact[2]), Number(compact[3]));
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const a = m[1] ?? '';
  const b = m[2] ?? '';
  const c = m[3] ?? '';
  if (a.length === 4) return buildDate(Number(a), Number(b), Number(c));
  if (a.length > 2 || c.length === 3 || c.length === 1) return null;
  switch (format) {
    case 'DMY':
      return buildDate(expandYear(c), Number(b), Number(a));
    case 'MDY':
      return buildDate(expandYear(c), Number(a), Number(b));
    case 'YMD':
      return buildDate(expandYear(a), Number(b), Number(c));
  }
}

/**
 * Devine le format de date d'un échantillon : AAAA en tête → YMD ; un premier nombre > 12 → DMY ;
 * un second nombre > 12 → MDY. DMY par défaut (usage tunisien).
 */
export function detectDateFormat(values: readonly string[]): DateFormat {
  let ymd = 0;
  let dmy = 0;
  let mdy = 0;
  for (const value of values) {
    const s = datePart(value);
    if (COMPACT_DATE_RE.test(s)) {
      ymd++;
      continue;
    }
    const m = DATE_RE.exec(s);
    if (!m) continue;
    const a = m[1] ?? '';
    const b = Number(m[2]);
    if (a.length === 4) ymd++;
    else if (Number(a) > 12 && b <= 12) dmy++;
    else if (b > 12 && Number(a) <= 12) mdy++;
  }
  if (ymd > 0 && ymd >= dmy + mdy) return 'YMD';
  if (mdy > 0 && dmy === 0) return 'MDY';
  return 'DMY';
}

// ───────────────────────── Montants ─────────────────────────

const CURRENCY_RE =
  /^(?:tnd|dt|d\.t\.?|dinars?|eur|euros?|usd|€|\$)\s*|\s*(?:tnd|dt|d\.t\.?|dinars?|eur|euros?|usd|€|\$)$/i;
const MINUS_RE = /^[-−–]/;
const TRAILING_MINUS_RE = /[-−–]$/;

/** Vérifie des groupes de milliers « 1 234 567 » (le premier groupe a 1 à 3 chiffres). */
function isGrouped(parts: readonly string[]): boolean {
  return parts.every((p, i) => (i === 0 ? /^\d{1,3}$/.test(p) : /^\d{3}$/.test(p)));
}

/** « 1234 » + « 5 » → 1 234 500 millimes ; au-delà de 3 décimales, arrondi au millime. */
function toMillimes(intDigits: string, fracDigits: string): Millimes | null {
  const head = fracDigits.slice(0, 3).padEnd(3, '0');
  const roundUp = fracDigits.length > 3 && Number(fracDigits[3]) >= 5 ? 1 : 0;
  const value = Number(intDigits) * 1000 + Number(head) + roundUp;
  return Number.isSafeInteger(value) ? value : null;
}

/** Lit la partie numérique (sans signe ni devise) : séparateurs décimaux et de milliers. */
function parseUnsigned(s: string): Millimes | null {
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    // Les deux : le dernier est le séparateur décimal, l'autre groupe les milliers.
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    const [intPart = '', fracPart = '', ...rest] = s.split(decimalSep);
    if (rest.length > 0) return null;
    const groups = intPart.split(thousandSep);
    if (!isGrouped(groups)) return null;
    return toMillimes(groups.join(''), fracPart);
  }

  const sep = lastComma >= 0 ? ',' : lastDot >= 0 ? '.' : null;
  if (sep === null) return toMillimes(s, '');
  const parts = s.split(sep);
  if (parts.length === 2) {
    // Un seul séparateur : toujours décimal (« 45,000 » = 45 DT ; « 1.234 » = 1,234 DT).
    const [intPart = '', fracPart = ''] = parts;
    return toMillimes(intPart === '' ? '0' : intPart, fracPart);
  }
  // Plusieurs fois le même séparateur : milliers (« 1.234.567 »).
  return isGrouped(parts) ? toMillimes(parts.join(''), '') : null;
}

/**
 * Lit un montant bancaire signé, en millimes entiers. `null` si la cellule est vide ou illisible.
 *  « -1 234,500 » → −1 234 500 ; « 1.234,500 » → 1 234 500 ; « 12.5 » → 12 500 ;
 *  « (45,000) » → −45 000 ; « 45,000 DT » → 45 000 ; « −12 » → −12 000 ; « 1,234.50 » → 1 234 500.
 */
export function parseAmountCell(raw: string): Millimes | null {
  let s = raw
    .replace(/[    ]/g, ' ')
    .trim()
    .replace(/^"|"$/g, '')
    .trim();
  if (s === '') return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(CURRENCY_RE, '').trim();
  if (MINUS_RE.test(s)) {
    negative = !negative;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim();
  } else if (TRAILING_MINUS_RE.test(s)) {
    negative = !negative;
    s = s.slice(0, -1).trim();
  }
  s = s.replace(CURRENCY_RE, '').trim();
  // Espaces et apostrophes de milliers (« 1 234 », « 1'234 »).
  s = s.replace(/[\s'’]/g, '');

  const value = parseUnsigned(s);
  if (value === null) return null;
  return negative && value !== 0 ? -value : value;
}

// ───────────────────────── Devinette du mapping ─────────────────────────

function columnValues(sample: readonly string[][], index: number): string[] {
  return sample.map((row) => row[index] ?? '').filter((v) => v.trim() !== '');
}

function ratio(values: readonly string[], test: (v: string) => boolean): number {
  if (values.length === 0) return 0;
  return values.filter(test).length / values.length;
}

/**
 * Indique si une ligne ressemble à des en-têtes : aucune cellule n'est une date ni un montant,
 * et au moins une cellule contient des lettres.
 */
export function hasHeaderRow(firstRow: readonly string[]): boolean {
  const cells = firstRow.map((c) => c.trim()).filter((c) => c !== '');
  if (cells.length === 0) return false;
  const looksLikeData = cells.some(
    (c) =>
      parseDateCell(c, 'DMY') !== null ||
      parseDateCell(c, 'MDY') !== null ||
      parseAmountCell(c) !== null,
  );
  return !looksLikeData && cells.some((c) => /\p{L}/u.test(c));
}

/**
 * Devine la correspondance des colonnes à partir des en-têtes (« Date », « Libellé », « Débit »,
 * « Crédit », « Montant »…) puis, à défaut, du contenu de l'échantillon. Le format de date est
 * déduit des valeurs de la colonne date.
 */
export function guessMapping(headers: string[], sample: string[][]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const width = Math.max(headers.length, ...sample.map((r) => r.length), 1);
  const used = new Set<number>();
  const take = (field: Field): number | null => {
    const index = bestColumn(normalized, field, used);
    if (index !== null) used.add(index);
    return index;
  };

  let date = take('date');
  let debit = take('debit');
  let credit = take('credit');
  let amount = take('amount');
  let label = take('label');
  const note = take('note');

  const free = () => Array.from({ length: width }, (_, i) => i).filter((i) => !used.has(i));

  if (date === null) {
    let bestRatio = 0;
    for (const i of free()) {
      const r = ratio(
        columnValues(sample, i),
        (v) => parseDateCell(v, detectDateFormat([v])) !== null,
      );
      if (r > bestRatio) {
        bestRatio = r;
        date = i;
      }
    }
    date ??= free()[0] ?? 0;
    used.add(date);
  }

  if (amount === null && (debit === null || credit === null)) {
    // Une colonne de débit seule ou de crédit seule ne suffit pas : on cherche un montant signé.
    let bestRatio = 0;
    let candidate: number | null = null;
    for (const i of free()) {
      const values = columnValues(sample, i);
      const r = ratio(
        values,
        (v) => parseAmountCell(v) !== null && parseDateCell(v, 'DMY') === null,
      );
      if (r > bestRatio && r >= 0.6) {
        bestRatio = r;
        candidate = i;
      }
    }
    if (candidate !== null) {
      amount = candidate;
      used.add(candidate);
      if (debit !== null) used.delete(debit);
      if (credit !== null) used.delete(credit);
      debit = null;
      credit = null;
    }
  }

  if (label === null) {
    let bestLength = -1;
    for (const i of free()) {
      const values = columnValues(sample, i);
      const textual = values.filter((v) => /\p{L}/u.test(v) && parseAmountCell(v) === null);
      const avg = textual.reduce((s, v) => s + v.length, 0) / Math.max(values.length, 1);
      if (textual.length > 0 && avg > bestLength) {
        bestLength = avg;
        label = i;
      }
    }
    if (label !== null) used.add(label);
  }

  const dateIndex = date;
  const labelIndex = label ?? free()[0] ?? (dateIndex === 0 ? Math.min(1, width - 1) : 0);
  const splitMode = amount === null && (debit !== null || credit !== null);

  return {
    date: dateIndex,
    label: labelIndex,
    amount: splitMode ? null : amount,
    debit: splitMode ? debit : null,
    credit: splitMode ? credit : null,
    note,
    dateFormat: detectDateFormat(columnValues(sample, dateIndex)),
  };
}

// ───────────────────────── Application ─────────────────────────

function cleanText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

type CellRead =
  { kind: 'empty' } | { kind: 'value'; value: Millimes } | { kind: 'invalid'; raw: string };

function readAmount(row: readonly string[], index: number | null): CellRead {
  if (index === null) return { kind: 'empty' };
  const raw = (row[index] ?? '').trim();
  if (raw === '') return { kind: 'empty' };
  const value = parseAmountCell(raw);
  if (value === null) return { kind: 'invalid', raw };
  return value === 0 ? { kind: 'empty' } : { kind: 'value', value };
}

type RowOutcome = { ok: true; row: ImportRow } | { ok: false; message: string };

function mapRow(row: readonly string[], index: number, mapping: ColumnMapping): RowOutcome {
  if (row.length <= Math.max(mapping.date, mapping.label)) {
    return { ok: false, message: `Ligne incomplète : ${row.length} colonne(s) seulement.` };
  }

  const rawDate = (row[mapping.date] ?? '').trim();
  const date = parseDateCell(rawDate, mapping.dateFormat);
  if (date === null) {
    return {
      ok: false,
      message: rawDate === '' ? 'Date manquante.' : `Date illisible : « ${rawDate} ».`,
    };
  }

  const label = cleanText(row[mapping.label] ?? '').slice(0, MAX_LABEL_LENGTH);
  if (label === '') return { ok: false, message: 'Libellé vide.' };

  let amount: Millimes;
  let type: ImportRow['type'];
  if (mapping.amount !== null) {
    const cell = readAmount(row, mapping.amount);
    if (cell.kind === 'invalid')
      return { ok: false, message: `Montant illisible : « ${cell.raw} ».` };
    if (cell.kind === 'empty') return { ok: false, message: 'Montant manquant ou nul.' };
    amount = Math.abs(cell.value);
    type = cell.value < 0 ? 'EXPENSE' : 'INCOME';
  } else if (mapping.debit !== null || mapping.credit !== null) {
    const debit = readAmount(row, mapping.debit);
    const credit = readAmount(row, mapping.credit);
    if (debit.kind === 'invalid')
      return { ok: false, message: `Débit illisible : « ${debit.raw} ».` };
    if (credit.kind === 'invalid')
      return { ok: false, message: `Crédit illisible : « ${credit.raw} ».` };
    if (debit.kind === 'value' && credit.kind === 'value') {
      return { ok: false, message: 'Débit et crédit renseignés sur la même ligne.' };
    }
    if (debit.kind === 'value') {
      amount = Math.abs(debit.value);
      type = 'EXPENSE';
    } else if (credit.kind === 'value') {
      // Un crédit négatif est traité comme une sortie.
      amount = Math.abs(credit.value);
      type = credit.value < 0 ? 'EXPENSE' : 'INCOME';
    } else {
      return { ok: false, message: 'Ni débit ni crédit renseigné.' };
    }
  } else {
    return { ok: false, message: 'Aucune colonne de montant sélectionnée.' };
  }
  if (amount > MAX_AMOUNT) return { ok: false, message: 'Montant trop élevé.' };

  const result: ImportRow = { index, date, label, amount, type };
  if (mapping.note !== null) {
    const note = cleanText(row[mapping.note] ?? '').slice(0, MAX_NOTE_LENGTH);
    if (note !== '') result.note = note;
  }
  return { ok: true, row: result };
}

/**
 * Convertit les lignes du fichier (sans les en-têtes) en `ImportRow[]`. `index` est la position
 * de la ligne dans `rows`. Les lignes entièrement vides sont ignorées ; les autres lignes
 * illisibles sont collectées dans `errors` avec un message en français.
 */
export function applyMapping(
  rows: string[][],
  mapping: ColumnMapping,
): { rows: ImportRow[]; errors: { index: number; message: string }[] } {
  const out: ImportRow[] = [];
  const errors: { index: number; message: string }[] = [];
  rows.forEach((row, index) => {
    if (row.every((cell) => cell.trim() === '')) return;
    const outcome = mapRow(row, index, mapping);
    if (outcome.ok) out.push(outcome.row);
    else errors.push({ index, message: outcome.message });
  });
  return { rows: out, errors };
}
