import { parseAmountInput } from '@/domain/money';

/**
 * Lit un champ <AmountInput> tel qu'affiché : il ne valide qu'au blur, or Entrée ou
 * Ctrl+Entrée peuvent soumettre avant. Repli sur `fallback` si le champ est introuvable.
 */
export function readAmountField(
  id: string,
  fallback: number | null,
): { value: number | null; error?: string } {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) return { value: fallback };
  const raw = el.value.trim();
  if (raw === '') return { value: null };
  const r = parseAmountInput(raw);
  return r.ok ? { value: r.value } : { value: null, error: r.error };
}
