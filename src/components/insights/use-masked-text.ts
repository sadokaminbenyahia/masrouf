'use client';
/**
 * Textes générés (conseils, anomalies, explications du score ou de la prévision) : en mode
 * discret, les montants qu'ils contiennent sont masqués comme ceux de <Money>.
 */
import { useCallback } from 'react';
import { maskMoneyInText } from '@/domain/money';
import { useDiscreetMode } from '@/lib/hooks/use-discreet-mode';

export function useMaskedText(): (text: string) => string {
  const { discreet } = useDiscreetMode();
  return useCallback((text: string) => (discreet ? maskMoneyInText(text) : text), [discreet]);
}

/** Composant client minimal pour afficher un texte libre depuis un Server Component. */
export function MaskedText({ text }: { text: string }) {
  const mask = useMaskedText();
  return mask(text);
}
