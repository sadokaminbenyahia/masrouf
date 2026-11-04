/**
 * Lecture robuste d'un montant saisi dans un <AmountInput> au moment de valider (Entrée
 * dans un formulaire, sans blur préalable) : le texte brut du champ fait foi s'il existe,
 * sinon la dernière valeur connue.
 */
import { parseAmountInput, type Millimes } from '@/domain/money';
import { err, ok, type Result } from '@/domain/result';

export function resolveAmount(
  raw: string | null | undefined,
  fallback: Millimes | null,
): Result<Millimes, string> {
  const text = raw?.trim() ?? '';
  if (text !== '') return parseAmountInput(text);
  return fallback !== null && fallback > 0 ? ok(fallback) : err('Montant requis.');
}

/** Texte brut du champ d'identifiant `id` (côté client uniquement). */
export function readInputText(id: string): string | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el.value : null;
}
