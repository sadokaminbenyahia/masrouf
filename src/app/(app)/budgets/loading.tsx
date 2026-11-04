import { Skeleton } from '@/components/ui/skeleton';

/** Squelette aux dimensions de la page Budgets (en-tête, mois, résumé, cartes). */
export default function BudgetsLoading() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <span className="sr-only">Chargement des budgets…</span>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-11 w-40 rounded-lg" />
      </div>
      <Skeleton className="h-11 w-56 rounded-lg" />
      <Skeleton className="h-28 rounded-xl" />
      <div className="grid gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[124px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
