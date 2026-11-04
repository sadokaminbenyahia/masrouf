import Link from 'next/link';
import { CompassIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/layout/brand';

export default function NotFound() {
  return (
    <main id="contenu" className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <BrandMark className="mb-10" />
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-brand-tint text-primary">
        <CompassIcon className="size-7" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Erreur 404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Page introuvable</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        Cette page n&apos;existe pas ou a été déplacée. Reprenons depuis votre tableau de bord.
      </p>
      <Button asChild className="mt-6" size="lg">
        <Link href="/tableau-de-bord">Retour au tableau de bord</Link>
      </Button>
    </main>
  );
}
