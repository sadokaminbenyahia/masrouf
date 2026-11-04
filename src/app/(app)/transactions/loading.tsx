import { LoadingAnnouncement, TableSkeleton } from '@/components/shared/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function TransactionsLoading() {
  return (
    <div aria-busy="true">
      <LoadingAnnouncement label="Chargement des transactions…" />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
      <div className="grid gap-5">
        <div className="grid gap-3">
          <div className="flex flex-col gap-3 lg:flex-row">
            <Skeleton className="h-10 w-full lg:max-w-sm" />
            <div className="flex gap-1.5">
              {[56, 88, 80, 88].map((w) => (
                <Skeleton key={w} className="h-9 rounded-full" style={{ width: w }} />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[104, 116, 130, 110, 140].map((w) => (
              <Skeleton key={w} className="h-10" style={{ width: w }} />
            ))}
          </div>
        </div>
        <Skeleton className="h-16 w-full rounded-xl" />
        <TableSkeleton rows={10} />
      </div>
    </div>
  );
}
