'use client';
/**
 * Compteur animé de 0 au montant (KPI). Toujours rendu via <Money> ; aucune animation en mode
 * discret ou si l'utilisateur préfère réduire les animations.
 */
import { animate, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { Millimes } from '@/domain/money';
import type { TransactionType } from '@/domain/types';
import { Money } from '@/components/shared/money';
import { useDiscreetMode } from '@/lib/hooks/use-discreet-mode';

export interface AnimatedMoneyProps {
  value: Millimes;
  type?: TransactionType;
  sign?: 'auto' | 'always' | 'never';
  decimals?: 0 | 3;
  className?: string;
}

export function AnimatedMoney({ value, type, sign, decimals = 0, className }: AnimatedMoneyProps) {
  const reduce = useReducedMotion() === true;
  const { discreet } = useDiscreetMode();
  const still = reduce || discreet;
  const [shown, setShown] = useState<Millimes>(value);

  useEffect(() => {
    if (still) return;
    const controls = animate(0, value, {
      duration: 0.8,
      ease: 'easeOut',
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, still]);

  return (
    <Money
      value={still ? value : shown}
      type={type}
      sign={sign}
      decimals={decimals}
      className={className}
    />
  );
}
