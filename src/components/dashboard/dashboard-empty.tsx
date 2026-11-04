'use client';
/**
 * État vide global : aucune transaction enregistrée.
 */
import { Plus, Upload, WalletMinimal } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { openQuickAdd } from '@/lib/events';

export function DashboardEmpty() {
  return (
    <EmptyState
      icon={WalletMinimal}
      title="Votre tableau de bord vous attend"
      description="Commencez par ajouter une dépense ou importer un relevé : vos soldes, graphiques et conseils apparaîtront ici."
      action={
        <>
          <Button type="button" className="h-11" onClick={() => openQuickAdd()}>
            <Plus aria-hidden />
            Ajouter une dépense
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link href="/import">
              <Upload aria-hidden />
              Importer un relevé
            </Link>
          </Button>
        </>
      }
    />
  );
}
