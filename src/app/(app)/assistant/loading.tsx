import { LoadingAnnouncement } from '@/components/shared/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function AssistantLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6" aria-busy="true">
      <LoadingAnnouncement label="Chargement de l’assistant…" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="bg-card flex flex-col gap-4 rounded-xl border p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-6 w-56" />
          </div>
          <Skeleton className="h-10 w-44" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/4" />
        <div className="grid gap-2 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-dashed p-5">
        <Skeleton className="h-4 w-64" />
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11 w-56" />
          ))}
        </div>
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}
