import { CardSkeleton, LoadingAnnouncement, TableSkeleton } from '@/components/shared/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function RecurrentsLoading() {
  return (
    <div aria-busy="true">
      <LoadingAnnouncement label="Chargement des récurrences…" />
      <div
        className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        aria-hidden="true"
      >
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-48 rounded-lg" />
      </div>
      <div className="space-y-8" aria-hidden="true">
        <div className="grid gap-3 sm:grid-cols-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <TableSkeleton rows={4} />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
