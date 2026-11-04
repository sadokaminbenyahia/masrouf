import { CardSkeleton, LoadingAnnouncement, TableSkeleton } from '@/components/shared/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function ParametresLoading() {
  return (
    <div aria-busy="true">
      <LoadingAnnouncement />
      <div className="mb-6 flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <CardSkeleton className="h-56" />
        <CardSkeleton className="h-56" />
        <TableSkeleton rows={6} />
        <CardSkeleton className="h-56" />
      </div>
    </div>
  );
}
