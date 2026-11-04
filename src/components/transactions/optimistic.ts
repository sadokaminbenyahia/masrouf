/**
 * Mises à jour optimistes du cache d'une page de transactions et construction des
 * patchs d'annulation (fonctions pures).
 */
import type { TransactionPage } from '@/app/actions/transactions';
import type { Transaction, TransactionTotals } from '@/domain/types';
import type { TransactionPatch } from '@/lib/schemas/transactions';

type PatchKey = keyof TransactionPatch;
const PATCH_KEYS: readonly PatchKey[] = [
  'accountId',
  'categoryId',
  'type',
  'amount',
  'date',
  'label',
  'note',
  'tags',
  'transferAccountId',
];

/** Applique un patch localement (même règles que le serveur pour la catégorie). */
export function applyPatch(t: Transaction, patch: TransactionPatch): Transaction {
  const next: Transaction = { ...t };
  if (patch.accountId !== undefined) next.accountId = patch.accountId;
  if (patch.type !== undefined) next.type = patch.type;
  if (patch.amount !== undefined) next.amount = patch.amount;
  if (patch.date !== undefined) next.date = patch.date;
  if (patch.label !== undefined) next.label = patch.label.trim();
  if (patch.note !== undefined) next.note = patch.note === null ? null : patch.note.trim() || null;
  if (patch.tags !== undefined) next.tags = patch.tags.map((x) => x.trim());
  if (patch.transferAccountId !== undefined) next.transferAccountId = patch.transferAccountId;
  if (patch.categoryId !== undefined) {
    next.categoryId = patch.categoryId;
    next.categorySource = patch.categoryId === null ? null : 'USER';
    next.aiConfidence = null;
  }
  if (next.type === 'TRANSFER') {
    next.categoryId = null;
    next.categorySource = null;
    next.aiConfidence = null;
  } else {
    next.transferAccountId = null;
  }
  return next;
}

function contribution(t: Transaction): { income: number; expense: number } {
  return {
    income: t.type === 'INCOME' ? t.amount : 0,
    expense: t.type === 'EXPENSE' ? t.amount : 0,
  };
}

function adjustTotals(
  totals: TransactionTotals,
  removed: readonly Transaction[],
  added: readonly Transaction[],
  countDelta: number,
): TransactionTotals {
  let { income, expense } = totals;
  for (const t of removed) {
    const c = contribution(t);
    income -= c.income;
    expense -= c.expense;
  }
  for (const t of added) {
    const c = contribution(t);
    income += c.income;
    expense += c.expense;
  }
  return { income, expense, net: income - expense, count: Math.max(0, totals.count + countDelta) };
}

/** Remplace des transactions de la page par leur version patchée (totaux ajustés). */
export function patchPage(
  page: TransactionPage,
  patches: ReadonlyMap<string, TransactionPatch>,
): TransactionPage {
  const removed: Transaction[] = [];
  const added: Transaction[] = [];
  const items = page.items.map((t) => {
    const patch = patches.get(t.id);
    if (!patch) return t;
    const next = applyPatch(t, patch);
    removed.push(t);
    added.push(next);
    return next;
  });
  if (removed.length === 0) return page;
  return { ...page, items, totals: adjustTotals(page.totals, removed, added, 0) };
}

/** Retire des transactions de la page (suppression optimiste). */
export function removeFromPage(page: TransactionPage, ids: Iterable<string>): TransactionPage {
  const set = new Set(ids);
  const removed = page.items.filter((t) => set.has(t.id));
  if (removed.length === 0) return page;
  const total = Math.max(0, page.total - removed.length);
  return {
    ...page,
    items: page.items.filter((t) => !set.has(t.id)),
    total,
    pageCount: Math.ceil(total / page.pageSize),
    totals: adjustTotals(page.totals, removed, [], -removed.length),
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

/** Valeur d'un champ du patch lue sur une transaction existante. */
function fieldOf(t: Transaction, key: PatchKey): TransactionPatch[PatchKey] {
  switch (key) {
    case 'accountId':
      return t.accountId;
    case 'categoryId':
      return t.categoryId;
    case 'type':
      return t.type;
    case 'amount':
      return t.amount;
    case 'date':
      return t.date;
    case 'label':
      return t.label;
    case 'note':
      return t.note;
    case 'tags':
      return t.tags;
    case 'transferAccountId':
      return t.transferAccountId;
  }
}

/** Patch qui rétablit les valeurs `before` des champs modifiés par `patch`. */
export function buildUndoPatch(before: Transaction, patch: TransactionPatch): TransactionPatch {
  const undo: Record<string, unknown> = {};
  for (const key of PATCH_KEYS) {
    if (patch[key] === undefined) continue;
    undo[key] = fieldOf(before, key);
  }
  // Un changement de type peut avoir vidé la catégorie ou le compte destinataire.
  if (patch.type !== undefined) {
    undo.categoryId = before.categoryId;
    undo.transferAccountId = before.transferAccountId;
  }
  return undo as TransactionPatch;
}

/** Différence entre une transaction et une saisie complète (édition par formulaire). */
export function diffPatch(before: Transaction, after: Transaction): TransactionPatch {
  const out: Record<string, unknown> = {};
  for (const key of PATCH_KEYS) {
    const a = fieldOf(before, key);
    const b = fieldOf(after, key);
    if (!sameValue(a, b)) out[key] = b;
  }
  return out as TransactionPatch;
}
