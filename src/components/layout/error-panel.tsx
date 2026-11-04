'use client';
import Link from 'next/link';
import { RotateCcwIcon, TriangleAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ErrorPanel({ digest, onRetry }: { digest?: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-md flex-col items-center rounded-2xl border bg-card px-6 py-10 text-center shadow-card"
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-warning/12 text-warning">
        <TriangleAlertIcon className="size-6" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Cette page n&apos;a pas pu s&apos;afficher</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Un problème inattendu est survenu. Vos données ne sont pas perdues : réessayez, ou revenez
        au tableau de bord.
      </p>
      {digest && (
        <p className="mt-3 text-xs text-muted-foreground">
          Référence : <code className="font-mono">{digest}</code>
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={onRetry}>
          <RotateCcwIcon aria-hidden="true" />
          Réessayer
        </Button>
        <Button asChild variant="outline">
          <Link href="/tableau-de-bord">Tableau de bord</Link>
        </Button>
      </div>
    </div>
  );
}
