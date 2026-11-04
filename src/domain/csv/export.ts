/**
 * Export CSV des transactions, compatible Excel FR :
 *  - séparateur « ; », fins de ligne CRLF, UTF-8 avec BOM ;
 *  - date JJ/MM/AAAA, montant signé « -12,500 » (sans séparateur de milliers) ;
 *  - échappement RFC 4180 ;
 *  - protection contre l'injection de formules (cellule préfixée d'une apostrophe si elle
 *    commence par = + - @ ou une tabulation), sauf pour la colonne Montant.
 */
import { formatDateFR } from '../dates';
import { MILLIMES_PER_UNIT, type Millimes } from '../money';
import type { Transaction, TransactionType } from '../types';

export const CSV_HEADERS = [
  'Date',
  'Libellé',
  'Montant',
  'Type',
  'Catégorie',
  'Compte',
  'Tags',
  'Note',
] as const;

export const CSV_BOM = '﻿';
const SEPARATOR = ';';
const EOL = '\r\n';

const TYPE_LABELS: Record<TransactionType, string> = {
  EXPENSE: 'Dépense',
  INCOME: 'Revenu',
  TRANSFER: 'Virement',
};

/** « -12,500 » / « 2600,000 » : virgule décimale, 3 décimales, pas de séparateur de milliers. */
export function formatCsvAmount(signed: Millimes): string {
  const abs = Math.abs(Math.round(signed));
  const intPart = Math.floor(abs / MILLIMES_PER_UNIT);
  const frac = String(abs % MILLIMES_PER_UNIT).padStart(3, '0');
  return `${signed < 0 ? '-' : ''}${intPart},${frac}`;
}

/** Neutralise une cellule qui serait interprétée comme une formule par un tableur. */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Échappement RFC 4180 : guillemets si nécessaire, guillemets internes doublés. */
export function escapeCsvCell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function signedFor(t: Pick<Transaction, 'type' | 'amount'>): Millimes {
  if (t.type === 'EXPENSE') return -Math.abs(t.amount);
  return Math.abs(t.amount);
}

export function transactionsToCsv(
  rows: Transaction[],
  lookups: { accounts: Map<string, string>; categories: Map<string, string> },
): string {
  const lines: string[] = [CSV_HEADERS.join(SEPARATOR)];
  for (const t of rows) {
    const account = lookups.accounts.get(t.accountId) ?? '';
    const accountCell =
      t.type === 'TRANSFER' && t.transferAccountId !== null
        ? `${account} → ${lookups.accounts.get(t.transferAccountId) ?? ''}`
        : account;
    const category = t.categoryId === null ? '' : (lookups.categories.get(t.categoryId) ?? '');
    const text = (v: string) => escapeCsvCell(neutralizeFormula(v));
    lines.push(
      [
        text(formatDateFR(t.date, 'short')),
        text(t.label),
        escapeCsvCell(formatCsvAmount(signedFor(t))),
        text(TYPE_LABELS[t.type]),
        text(category),
        text(accountCell),
        text(t.tags.join(', ')),
        text(t.note ?? ''),
      ].join(SEPARATOR),
    );
  }
  return CSV_BOM + lines.join(EOL) + EOL;
}
