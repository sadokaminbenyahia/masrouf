import { CardSkeleton, LoadingAnnouncement } from '@/components/shared/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function AccountsLoading() {
  return (
    <div aria-busy="true">
      <LoadingAnnouncement label="Chargement des comptes…" />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>
      <div className="grid gap-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <CardSkeleton className="h-40" />
          <CardSkeleton className="h-40" />
          <CardSkeleton className="h-40" />
        </div>
      </div>
    </div>
  );
}
