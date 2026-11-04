'use client';
/**
 * Apparition en cascade discrète des blocs (désactivée si prefers-reduced-motion).
 */
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' } },
};

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion() === true;
  return (
    <motion.div
      className={className}
      variants={container}
      initial={reduce ? false : 'hidden'}
      animate="show"
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion() === true;
  return (
    <motion.div className={className} variants={reduce ? undefined : item}>
      {children}
    </motion.div>
  );
}
