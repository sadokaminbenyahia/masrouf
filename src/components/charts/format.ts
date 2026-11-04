/**
 * Formatage des pourcentages (les montants passent exclusivement par formatMoney / <Money>).
 */

const NBSP = ' ';

export interface FormatPercentOptions {
  /** Affiche « + » pour une valeur positive */
  signed?: boolean;
  /** Nombre de décimales (défaut 0) */
  decimals?: 0 | 1;
}

/** 0.123 → « 12 % » ; signé : « +12 % » / « −12 % ». Virgule décimale à la française. */
export function formatPercent(ratio: number, options: FormatPercentOptions = {}): string {
  const { signed = false, decimals = 0 } = options;
  const factor = decimals === 1 ? 10 : 1;
  const rounded = Math.round(Math.abs(ratio) * 100 * factor) / factor;
  const body = (decimals === 1 ? rounded.toFixed(1) : String(rounded)).replace('.', ',');
  const isZero = rounded === 0;
  let prefix = '';
  if (ratio < 0 && !isZero) prefix = '−';
  else if (signed && ratio > 0 && !isZero) prefix = '+';
  return `${prefix}${body}${NBSP}%`;
}
