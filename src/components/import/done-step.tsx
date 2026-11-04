'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { animate, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react';
import type { ImportCommitResult } from '@/domain/types';
import { Button } from '@/components/ui/button';
import { plural } from './import-logic';

function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const controls = animate(0, value, {
      duration: Math.min(1.2, 0.4 + value / 200),
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, reduce]);
  return <>{reduce ? value : display}</>;
}

interface DoneStepProps {
  result: ImportCommitResult;
  transactionsHref: string;
  onRestart: () => void;
}

export function DoneStep({ result, transactionsHref, onRestart }: DoneStepProps) {
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <motion.span
        initial={reduce ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="bg-success/12 text-success flex size-16 items-center justify-center rounded-full"
      >
        <CheckCircle2 className="size-9" aria-hidden="true" />
      </motion.span>

      <div className="space-y-1">
        <p className="text-xl font-semibold">Import terminé</p>
        <p className="text-muted-foreground" role="status">
          {plural(result.created, 'transaction créée', 'transactions créées')}
          {result.skipped > 0 &&
            `, ${plural(result.skipped, 'doublon ignoré', 'doublons ignorés')}`}
          .
        </p>
      </div>

      <dl className="grid w-full max-w-md grid-cols-2 gap-3" aria-hidden="true">
        <div className="bg-card rounded-xl border px-4 py-4">
          <dt className="text-muted-foreground text-sm">Créées</dt>
          <dd className="text-income text-3xl font-semibold tabular-nums">
            <CountUp value={result.created} />
          </dd>
        </div>
        <div className="bg-card rounded-xl border px-4 py-4">
          <dt className="text-muted-foreground text-sm">Ignorées</dt>
          <dd className="text-muted-foreground text-3xl font-semibold tabular-nums">
            <CountUp value={result.skipped} />
          </dd>
        </div>
      </dl>

      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button asChild>
          <Link href={transactionsHref}>
            Voir les transactions
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <Button type="button" variant="outline" onClick={onRestart}>
          <RotateCcw aria-hidden="true" />
          Importer un autre fichier
        </Button>
      </div>
    </div>
  );
}
