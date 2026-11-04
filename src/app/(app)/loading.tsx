import { CardSkeleton, ChartSkeleton, LoadingAnnouncement } from '@/components/shared/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function AppLoading() {
  return (
    <div aria-busy="true">
      <LoadingAnnouncement />
      <div className="mb-6 flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartSkeleton className="lg:col-span-2" />
        <ChartSkeleton />
      </div>
    </div>
  );
}
