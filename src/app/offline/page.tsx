import type { Metadata } from 'next';
import { WifiOffIcon } from 'lucide-react';
import { BrandMark } from '@/components/layout/brand';
import { RetryButton } from './retry-button';

export const dynamic = 'force-static';
export const metadata: Metadata = { title: 'Hors ligne', robots: { index: false } };

/** Page de repli du service worker (statique, accessible sans session). */
export default function OfflinePage() {
  return (
    <main
      id="contenu"
      className="flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center"
    >
      <BrandMark className="mb-10" />
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-brand-tint text-primary">
        <WifiOffIcon className="size-7" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hors ligne</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        Vous n&apos;êtes pas connecté à Internet. Vos données sont en sécurité : reconnectez-vous
        pour consulter et saisir vos transactions.
      </p>
      <RetryButton />
    </main>
  );
}
