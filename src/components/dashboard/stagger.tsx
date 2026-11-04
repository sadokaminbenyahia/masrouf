/**
 * Apparition en cascade discrète des blocs, en CSS pur (utilitaire `animate-in` de globals.css).
 *
 * Pourquoi pas framer-motion : une variante « hidden » rendue côté serveur (opacity: 0 en style
 * inline) n'était jamais ramenée à « show » quand `useReducedMotion()` valait true à
 * l'hydratation, et le contenu restait invisible sans JavaScript. Ici, le HTML serveur est le
 * contenu final : l'animation CSS part d'une opacité de 40 % et s'exécute sans JS ; avec
 * prefers-reduced-motion, `motion-reduce:animate-none` la supprime et le bloc est affiché tel quel.
 * Compatible Server Components.
 */
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Décalage entre deux blocs successifs (ms) et nombre maximal de paliers. */
const STEP_MS = 50;
const MAX_STEPS = 8;

/** Classes de l'animation d'entrée (exportées pour les tests). */
export const STAGGER_ITEM_CLASSES =
  'animate-in fade-in-40 slide-in-from-bottom-2 duration-300 ease-out motion-reduce:animate-none';

export function staggerDelay(index: number): number {
  const step = Math.min(MAX_STEPS, Math.max(0, Math.trunc(index)));
  return step * STEP_MS;
}

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

export function StaggerItem({
  children,
  className,
  index = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Rang du bloc dans la page (détermine le décalage de l'animation) */
  index?: number;
}) {
  const delay = staggerDelay(index);
  const style: CSSProperties | undefined = delay > 0 ? { animationDelay: `${delay}ms` } : undefined;
  return (
    <div className={cn(STAGGER_ITEM_CLASSES, className)} style={style}>
      {children}
    </div>
  );
}
