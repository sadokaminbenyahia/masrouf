/**
 * Logique pure du formulaire de transaction (diff d'édition, erreurs par champ, catégories
 * fréquentes).
 */
import type { Category } from '@/domain/types';
import type { TransactionInput, TransactionPatch } from '@/lib/schemas/transactions';

export const FORM_FIELDS = [
  'type',
  'amount',
  'date',
  'label',
  'categoryId',
  'accountId',
  'transferAccountId',
  'tags',
  'note',
] as const;
export type FormField = (typeof FORM_FIELDS)[number];
export type FieldErrors = Partial<Record<FormField, string>>;

export function isFormField(key: string): key is FormField {
  return (FORM_FIELDS as readonly string[]).includes(key);
}

/** Erreurs serveur « tags.0 » → « tags » ; garde le premier message par champ. */
export function toFieldErrors(raw: Record<string, string[]>): FieldErrors {
  const out: FieldErrors = {};
  for (const [path, messages] of Object.entries(raw)) {
    const key = path.split('.')[0] ?? '';
    const message = messages[0];
    if (isFormField(key) && message && !out[key]) out[key] = message;
  }
  return out;
}

export function normalizedNote(note: string | null | undefined): string | null {
  const t = (note ?? '').trim();
  return t === '' ? null : t;
}

/**
 * Patch minimal entre les valeurs initiales et la saisie (édition). Sans changement, renvoie
 * le libellé (opération neutre) afin d'obtenir la transaction à jour.
 */
export function diffInput(
  initial: Partial<TransactionInput>,
  next: TransactionInput,
): TransactionPatch {
  const patch: TransactionPatch = {};
  if (next.type !== initial.type) patch.type = next.type;
  if (next.amount !== initial.amount) patch.amount = next.amount;
  if (next.date !== initial.date) patch.date = next.date;
  if (next.label.trim() !== (initial.label ?? '').trim()) patch.label = next.label;
  if (next.accountId !== initial.accountId) patch.accountId = next.accountId;
  if ((next.categoryId ?? null) !== (initial.categoryId ?? null)) {
    patch.categoryId = next.categoryId ?? null;
  }
  if ((next.transferAccountId ?? null) !== (initial.transferAccountId ?? null)) {
    patch.transferAccountId = next.transferAccountId ?? null;
  }
  const a = next.tags ?? [];
  const b = initial.tags ?? [];
  if (a.length !== b.length || a.some((t, i) => t !== b[i])) patch.tags = a;
  if (normalizedNote(next.note) !== normalizedNote(initial.note)) {
    patch.note = normalizedNote(next.note);
  }
  return Object.keys(patch).length > 0 ? patch : { label: next.label };
}

/**
 * Catégories les plus fréquentes (nombre d'opérations récentes), à égalité par ordre
 * d'affichage : sans historique, on obtient les premières catégories du type.
 */
export function pickFrequent(
  kindCategories: readonly Category[],
  counts: ReadonlyMap<string, number>,
  limit: number,
): Category[] {
  return [...kindCategories]
    .sort(
      (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.sortOrder - b.sortOrder,
    )
    .slice(0, limit);
}
