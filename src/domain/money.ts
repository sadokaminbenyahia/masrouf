/**
 * Argent : TOUS les montants sont des entiers en millimes (1 TND = 1000 millimes).
 * `formatMoney` est LA fonction de formatage monétaire de l'application : aucune autre
 * fonction ne doit formater un montant (le composant <Money> l'utilise).
 */
import { err, ok, type Result } from './result';

/** Montant entier en millimes. */
export type Millimes = number;

export const MILLIMES_PER_UNIT = 1000;
export const DEFAULT_CURRENCY = 'TND';

/** Espace insécable utilisé comme séparateur de milliers (rendu identique serveur/client). */
const NBSP = ' ';

export function isMillimes(value: unknown): value is Millimes {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** Convertit un nombre de dinars (littéral, ex. seed) en millimes entiers. */
export function dinarsToMillimes(dinars: number): Millimes {
  return Math.round(dinars * MILLIMES_PER_UNIT);
}

/** Valeur décimale en dinars — UNIQUEMENT pour les axes de graphiques / calculs statistiques. */
export function millimesToDinars(m: Millimes): number {
  return m / MILLIMES_PER_UNIT;
}

export function sumMillimes(values: readonly Millimes[]): Millimes {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Applique un ratio (ex. 0.2) à un montant, arrondi au millime. */
export function applyRatio(m: Millimes, ratio: number): Millimes {
  return Math.round(m * ratio);
}

/** Ratio a/b sûr (0 si b = 0). */
export function safeRatio(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export type MoneyDirection = 'EXPENSE' | 'INCOME' | 'TRANSFER';

/** Montant signé : négatif pour une dépense, positif pour un revenu, 0 pour un virement. */
export function signedAmount(type: MoneyDirection, amount: Millimes): Millimes {
  if (type === 'EXPENSE') return -Math.abs(amount);
  if (type === 'INCOME') return Math.abs(amount);
  return 0;
}

export interface FormatMoneyOptions {
  /** Code devise (défaut TND, affiché « DT ») */
  currency?: string;
  /** 3 = millimes visibles (défaut), 0 = arrondi au dinar (agrégats) */
  decimals?: 0 | 3;
  /** 'auto' : « − » si négatif ; 'always' : « + » / « − » ; 'never' : valeur absolue */
  sign?: 'auto' | 'always' | 'never';
  /** Notation compacte (« 12,5 k DT ») pour les axes de graphiques */
  compact?: boolean;
  /** Masque le symbole de devise */
  hideCurrency?: boolean;
}

function currencySymbol(currency: string): string {
  return currency === 'TND' ? 'DT' : currency;
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/**
 * Formate un montant en millimes, à la française : « 1 234,500 DT », « −12 DT », « +2,4 k DT ».
 * Déterministe (pas d'Intl) pour éviter tout écart d'hydratation serveur/client.
 */
export function formatMoney(millimes: Millimes, options: FormatMoneyOptions = {}): string {
  const {
    currency = DEFAULT_CURRENCY,
    decimals = 3,
    sign = 'auto',
    compact = false,
    hideCurrency = false,
  } = options;
  const value = Math.round(millimes);
  const negative = value < 0;
  const abs = Math.abs(value);
  let body: string;

  if (compact && abs >= 1_000_000) {
    // >= 1000 DT : « 1,2 k » ; >= 1 000 000 DT : « 1,2 M »
    const dinars = abs / MILLIMES_PER_UNIT;
    const [div, suffix] = dinars >= 1_000_000 ? [1_000_000, 'M'] : [1_000, 'k'];
    const scaled = Math.round((dinars / div) * 10) / 10;
    body = `${String(scaled).replace('.', ',')}${NBSP}${suffix}`;
  } else if (decimals === 0 || compact) {
    body = groupThousands(String(Math.round(abs / MILLIMES_PER_UNIT)));
  } else {
    const intPart = Math.floor(abs / MILLIMES_PER_UNIT);
    const frac = abs % MILLIMES_PER_UNIT;
    body = `${groupThousands(String(intPart))},${String(frac).padStart(3, '0')}`;
  }

  const isZero = body.replace(/[^1-9]/g, '') === '';
  let prefix = '';
  if (sign === 'auto' && negative && !isZero) prefix = '−';
  if (sign === 'always' && !isZero) prefix = negative ? '−' : '+';
  const suffix = hideCurrency ? '' : `${NBSP}${currencySymbol(currency)}`;
  return `${prefix}${body}${suffix}`;
}

/** Valeur éditable d'un champ montant : 3500 → « 3,500 », 3000 → « 3 ». */
export function millimesToInputString(m: Millimes): string {
  const abs = Math.abs(Math.round(m));
  const intPart = Math.floor(abs / MILLIMES_PER_UNIT);
  const frac = abs % MILLIMES_PER_UNIT;
  const sign = m < 0 ? '-' : '';
  return frac === 0 ? `${sign}${intPart}` : `${sign}${intPart},${String(frac).padStart(3, '0')}`;
}

const UNIT_RE = /^(?:dt|tnd|dinars?|d)$/i;
const MILLIMES_UNIT_RE = /^(?:millimes?|mill?s?|m)$/i;

/**
 * Lit UN terme monétaire saisi par l'utilisateur.
 *  « 3,500 » / « 3.500 » → 3500 ; « 3,5 » / « 3.5 » → 3500 ; « 2400 » → 2 400 000 ;
 *  « 1 234,5 » → 1 234 500 ; « 500 millimes » → 500 ; « 12 dt » → 12 000.
 * Une virgule ou un point est TOUJOURS un séparateur décimal (« 1.200 » = 1,2 DT).
 */
export function parseMoneyTerm(raw: string): Result<Millimes, string> {
  const s = raw.trim().replace(/[  ]/g, ' ');
  const m = /^(\d{1,3}(?:[ ]\d{3})+|\d+)(?:[.,](\d{1,3}))?\s*([a-zA-Z]+)?$/.exec(s);
  if (!m) return err(`Montant invalide : « ${raw.trim()} ». Exemple : 12,500`);
  const intDigits = (m[1] ?? '').replace(/ /g, '');
  const fracDigits = m[2];
  const unit = m[3];
  if (unit && MILLIMES_UNIT_RE.test(unit)) {
    if (fracDigits) return err('Les millimes doivent être un nombre entier.');
    const v = Number(intDigits);
    return Number.isSafeInteger(v) ? ok(v) : err('Montant trop grand.');
  }
  if (unit && !UNIT_RE.test(unit)) return err(`Unité inconnue : « ${unit} ».`);
  const frac = fracDigits ? Number(fracDigits.padEnd(3, '0')) : 0;
  const v = Number(intDigits) * MILLIMES_PER_UNIT + frac;
  return Number.isSafeInteger(v) ? ok(v) : err('Montant trop grand.');
}

/**
 * Lit une saisie de montant, avec calcul simple : « 12,5+3 » → 15 500, « 20 - 2,750 » → 17 250.
 * Le résultat doit être strictement positif.
 */
export function parseAmountInput(raw: string): Result<Millimes, string> {
  const input = raw.trim();
  if (input === '') return err('Montant requis.');
  const parts = input.split(/\s*([+-])\s*/).filter((p) => p !== '');
  let total = 0;
  let op: '+' | '-' = '+';
  let expectTerm = true;
  for (const part of parts) {
    if (part === '+' || part === '-') {
      if (expectTerm && part === '-' && total === 0) return err('Le montant doit être positif.');
      op = part;
      expectTerm = true;
      continue;
    }
    const term = parseMoneyTerm(part);
    if (!term.ok) return term;
    total = op === '+' ? total + term.value : total - term.value;
    expectTerm = false;
  }
  if (expectTerm) return err(`Montant invalide : « ${input} ».`);
  if (total <= 0) return err('Le montant doit être supérieur à zéro.');
  return ok(total);
}
