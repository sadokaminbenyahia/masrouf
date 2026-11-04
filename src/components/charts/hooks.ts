'use client';
import { useReducedMotion } from 'framer-motion';
import { useCallback } from 'react';
import { formatMoney } from '@/domain/money';
import { useDiscreetMode } from '@/lib/hooks/use-discreet-mode';
import type { MoneyText } from './chart-data';

/** Animations recharts désactivées si l'utilisateur préfère réduire les animations. */
export function useChartAnimation(): boolean {
  return useReducedMotion() !== true;
}

const MASK = '•••';

/**
 * Formateurs de montants pour les graphiques, qui respectent le mode discret :
 *  - `text` pour les résumés accessibles ;
 *  - `axis` pour les graduations (notation compacte).
 */
export function useChartMoney(): { text: MoneyText; axis: (value: number) => string } {
  const { discreet } = useDiscreetMode();
  const text = useCallback<MoneyText>(
    (m) => (discreet ? 'montant masqué' : formatMoney(m, { decimals: 0 })),
    [discreet],
  );
  const axis = useCallback(
    (value: number) => (discreet ? MASK : formatMoney(value, { compact: true })),
    [discreet],
  );
  return { text, axis };
}
