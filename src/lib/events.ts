/**
 * Bus d'événements UI minimal (CustomEvent sur window) pour ouvrir des panneaux globaux
 * depuis n'importe où (palette de commandes, raccourcis, états vides…).
 */
import type { TransactionInput } from '@/lib/schemas/transactions';

export const QUICK_ADD_EVENT = 'masrouf:quick-add';
export const COMMAND_PALETTE_EVENT = 'masrouf:command-palette';
export const SHORTCUTS_HELP_EVENT = 'masrouf:shortcuts-help';

export interface QuickAddDetail {
  prefill?: Partial<TransactionInput>;
  /** Texte en langage naturel à analyser immédiatement */
  text?: string;
}

export function openQuickAdd(detail: QuickAddDetail = {}): void {
  window.dispatchEvent(new CustomEvent<QuickAddDetail>(QUICK_ADD_EVENT, { detail }));
}

export function openCommandPalette(): void {
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_EVENT));
}

export function openShortcutsHelp(): void {
  window.dispatchEvent(new CustomEvent(SHORTCUTS_HELP_EVENT));
}

/** Abonnement typé ; renvoie la fonction de désabonnement. */
export function onUiEvent<T = undefined>(name: string, handler: (detail: T) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<T>).detail);
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}
