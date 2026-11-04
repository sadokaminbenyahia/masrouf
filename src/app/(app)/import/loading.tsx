import { LoadingAnnouncement } from '@/components/shared/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function ImportLoading() {
  return (
    <div aria-busy="true">
      <LoadingAnnouncement label="Chargement de l’import…" />
      <div className="mb-6 space-y-2" aria-hidden="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card" aria-hidden="true">
        <div className="flex items-center gap-3 border-b px-4 py-4 sm:px-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-1 items-center gap-2">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="hidden h-3 w-20 sm:block" />
            </div>
          ))}
        </div>
        <div className="space-y-5 px-4 py-6 sm:px-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-52 w-full rounded-2xl" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}
