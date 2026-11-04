/**
 * Empreinte d'import (détection des doublons) : FNV-1a 64 bits sur
 * `date|montant|type|libellé normalisé`.
 */
import type { ISODate } from '../dates';
import type { Millimes } from '../money';

/**
 * Libellé normalisé pour la comparaison : minuscules, sans accents, sans références
 * numériques de 4 chiffres ou plus, ponctuation réduite à des espaces.
 *  « PAIEMENT CB Café  Mrabet 004512 » → « paiement cb cafe mrabet »
 */
export function normalizeForHash(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\d{4,}/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** FNV-1a 64 bits sur les octets UTF-8, en hexadécimal (16 caractères). */
export function fnv1a64(input: string): string {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

export function computeImportHash(row: {
  date: ISODate;
  amount: Millimes;
  type: 'EXPENSE' | 'INCOME';
  label: string;
}): string {
  return fnv1a64(`${row.date}|${row.amount}|${row.type}|${normalizeForHash(row.label)}`);
}
