/**
 * Formatage des nombres NON monétaires (pourcentages, compteurs), à la française et sans Intl
 * (rendu identique serveur/client). Les montants passent exclusivement par `formatMoney`.
 */

/** Espace insécable (séparateur de milliers, avant « % »). */
const NBSP = ' ';

export interface FormatPercentOptions {
  /** Affiche « + » pour une valeur positive (le « − » est toujours affiché) */
  signed?: boolean;
  /**
   * Décimales : 0 (défaut), 1, ou 'auto' (une décimale seulement sous 1 % : « 0,5 % »,
   * sinon entier : « 12 % »).
   */
  decimals?: 0 | 1 | 'auto';
}

/** Ratio → pourcentage : 0.123 → « 12 % » ; signé : « +12 % » / « −12 % ». */
export function formatPercent(ratio: number, options: FormatPercentOptions = {}): string {
  const { signed = false, decimals = 0 } = options;
  const pct = Number.isFinite(ratio) ? ratio * 100 : 0;
  const abs = Math.abs(pct);
  const oneDecimal = decimals === 1 || (decimals === 'auto' && abs > 0 && abs < 1);
  const rounded = oneDecimal ? Math.round(abs * 10) / 10 : Math.round(abs);
  const body = (decimals === 1 ? rounded.toFixed(1) : String(rounded)).replace('.', ',');
  const isZero = rounded === 0;
  let prefix = '';
  if (pct < 0 && !isZero) prefix = '−';
  else if (signed && pct > 0 && !isZero) prefix = '+';
  return `${prefix}${body}${NBSP}%`;
}

/** Entier à la française, séparateur de milliers insécable : 12345 → « 12 345 ». */
export function formatNumber(n: number): string {
  const value = Number.isFinite(n) ? Math.round(n) : 0;
  const grouped = String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return value < 0 ? `−${grouped}` : grouped;
}
