'use client';
import Link from 'next/link';
import { RotateCcwIcon, TriangleAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ErrorPanel({ digest, onRetry }: { digest?: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="bg-card shadow-card mx-auto flex w-full max-w-md flex-col items-center rounded-2xl border px-6 py-10 text-center"
    >
      <div className="bg-warning/12 text-warning mb-4 flex size-12 items-center justify-center rounded-2xl">
        <TriangleAlertIcon className="size-6" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">
        Cette page n&apos;a pas pu s&apos;afficher
      </h1>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
        Un problème inattendu est survenu. Vos données ne sont pas perdues : réessayez, ou revenez
        au tableau de bord.
      </p>
      {digest && (
        <p className="text-muted-foreground mt-3 text-xs">
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
