'use client';
/**
 * Célébration discrète (confettis légers) quand un objectif est atteint.
 * Rien n'est animé si l'utilisateur préfère réduire les animations ; purement décoratif
 * (le message est annoncé par le toast).
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

const COLORS = ['#1F5FAD', '#15803D', '#FDB022', '#F97066', '#6AA6F0', '#4ADE80'];
const PIECES = 28;
const DURATION_MS = 1600;

/** Trajectoire déterministe de chaque confetti (pas d'aléatoire au rendu). */
function piece(i: number) {
  const angle = (i / PIECES) * Math.PI * 2;
  const spread = 120 + ((i * 37) % 90);
  return {
    x: Math.cos(angle) * spread,
    y: Math.sin(angle) * spread * 0.6 + 160,
    rotate: ((i * 53) % 360) - 180,
    delay: (i % 7) * 0.025,
    color: COLORS[i % COLORS.length] ?? '#1F5FAD',
    round: i % 3 === 0,
  };
}

/** Rejoue l'animation à chaque changement de `burst` (> 0). */
export function Celebration({ burst }: { burst: number }) {
  const reducedMotion = useReducedMotion() ?? false;
  const [visibleBurst, setVisibleBurst] = useState(0);

  useEffect(() => {
    if (burst === 0 || reducedMotion) return;
    const show = setTimeout(() => setVisibleBurst(burst), 0);
    const hide = setTimeout(() => setVisibleBurst(0), DURATION_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [burst, reducedMotion]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      <AnimatePresence>
        {visibleBurst > 0 && (
          <motion.div
            key={visibleBurst}
            className="absolute top-1/3 left-1/2"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {Array.from({ length: PIECES }, (_, i) => {
              const p = piece(i);
              return (
                <motion.span
                  key={i}
                  className="absolute block size-2"
                  style={{ backgroundColor: p.color, borderRadius: p.round ? '9999px' : '2px' }}
                  initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
                  animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.rotate, scale: 1 }}
                  transition={{ duration: 1.3, delay: p.delay, ease: [0.22, 1, 0.36, 1] }}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
