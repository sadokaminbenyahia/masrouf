import { Skeleton } from '@/components/ui/skeleton';

/** Squelette aux dimensions de la page Objectifs (en-tête, cartes, simulateur). */
export default function GoalsLoading() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <span className="sr-only">Chargement des objectifs…</span>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-11 w-44 rounded-lg" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-[196px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[480px] rounded-xl" />
    </div>
  );
}
