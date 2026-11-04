/**
 * Règles métier des transactions (pures) : cohérence type ↔ catégorie, tags, source de la
 * catégorie, pagination, totaux.
 */
import type { AiTransaction } from './ai/types';
import type { Millimes } from './money';
import type {
  CategoryKind,
  CategorySource,
  Transaction,
  TransactionTotals,
  TransactionType,
} from './types';

export const MAX_TAGS = 10;

/** Le type de catégorie attendu pour un type de transaction (null : pas de catégorie). */
export function expectedCategoryKind(type: TransactionType): CategoryKind | null {
  return type === 'TRANSFER' ? null : type;
}

/** Une catégorie de ce `kind` peut-elle être affectée à une transaction de ce `type` ? */
export function isCategoryCompatible(type: TransactionType, kind: CategoryKind): boolean {
  return expectedCategoryKind(type) === kind;
}

/** Message d'erreur (FR) si la catégorie ne convient pas au type, sinon null. */
export function categoryMismatchMessage(type: TransactionType, kind: CategoryKind): string | null {
  if (type === 'TRANSFER') return 'Un virement ne peut pas avoir de catégorie.';
  if (kind === type) return null;
  return type === 'EXPENSE'
    ? 'Choisissez une catégorie de dépense.'
    : 'Choisissez une catégorie de revenu.';
}

/** Tags nettoyés : espaces superflus retirés, doublons (insensibles à la casse) supprimés. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (name === '') continue;
    const key = name.toLocaleLowerCase('fr');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** Sources considérées comme « confirmées » par l'utilisateur (servent à l'apprentissage). */
export const CONFIRMED_SOURCES: readonly CategorySource[] = ['USER', 'IMPORT', 'SEED', 'RECURRING'];

export interface CategoryChangeDecision {
  /** La catégorie (ou sa confirmation) doit être enregistrée comme choix de l'utilisateur */
  markAsUser: boolean;
  /** L'IA doit apprendre l'exemple */
  learn: boolean;
}

/**
 * Décide de l'effet d'une catégorie saisie par l'utilisateur sur une transaction existante.
 * - `next === undefined` : la catégorie n'est pas modifiée → rien.
 * - catégorie différente → choix utilisateur, et apprentissage si elle n'est pas nulle.
 * - même catégorie alors qu'elle venait de l'IA → confirmation : choix utilisateur + apprentissage.
 */
export function decideCategoryChange(
  before: { categoryId: string | null; categorySource: CategorySource | null },
  next: string | null | undefined,
): CategoryChangeDecision {
  if (next === undefined) return { markAsUser: false, learn: false };
  if (next !== before.categoryId) return { markAsUser: true, learn: next !== null };
  if (before.categorySource === 'AI' && next !== null) return { markAsUser: true, learn: true };
  return { markAsUser: false, learn: false };
}

export interface PageWindow {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function pageWindow(page: number, pageSize: number): PageWindow {
  const p = Math.max(1, Math.floor(page));
  const size = Math.max(1, Math.floor(pageSize));
  return { page: p, pageSize: size, skip: (p - 1) * size, take: size };
}

/** Nombre de pages (au moins 1, pour un affichage « page 1 sur 1 » d'une liste vide). */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

/** Somme par type (sortie d'un `groupBy`). */
export interface TypeSum {
  type: TransactionType;
  amount: Millimes;
  count: number;
}

/**
 * Totaux d'un ensemble de transactions : les virements sont exclus des revenus et dépenses,
 * mais comptés dans `count`.
 */
export function totalsFromTypeSums(sums: readonly TypeSum[]): TransactionTotals {
  let income = 0;
  let expense = 0;
  let count = 0;
  for (const s of sums) {
    if (s.type === 'INCOME') income += s.amount;
    else if (s.type === 'EXPENSE') expense += s.amount;
    count += s.count;
  }
  return { income, expense, net: income - expense, count };
}

export function totalsOf(rows: readonly Pick<Transaction, 'type' | 'amount'>[]): TransactionTotals {
  return totalsFromTypeSums(rows.map((r) => ({ type: r.type, amount: r.amount, count: 1 })));
}

/** Intervalle min/max (montant positif) quel que soit le signe saisi. */
export function amountBounds(
  min: Millimes | undefined,
  max: Millimes | undefined,
): { gte?: Millimes; lte?: Millimes } {
  const lo = min === undefined ? undefined : Math.abs(min);
  const hi = max === undefined ? undefined : Math.abs(max);
  if (lo !== undefined && hi !== undefined && lo > hi) return { gte: hi, lte: lo };
  const out: { gte?: Millimes; lte?: Millimes } = {};
  if (lo !== undefined) out.gte = lo;
  if (hi !== undefined) out.lte = hi;
  return out;
}

/** Vue minimale pour les algorithmes d'IA. */
export function toAiTransaction(t: Transaction): AiTransaction {
  return {
    id: t.id,
    date: t.date,
    amount: t.amount,
    type: t.type,
    label: t.label,
    categoryId: t.categoryId,
    accountId: t.accountId,
    recurringId: t.recurringId,
  };
}
