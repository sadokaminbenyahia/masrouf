import { LoadingAnnouncement } from '@/components/shared/skeletons';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function KpiSkeleton() {
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-full" />
      </CardContent>
    </Card>
  );
}

function BlockSkeleton({ height, rows }: { height?: number; rows?: number }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </CardHeader>
      <CardContent className="space-y-3">
        {height ? <Skeleton className="w-full rounded-lg" style={{ height }} /> : null}
        {Array.from({ length: rows ?? 0 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function DashboardLoading() {
  return (
    <div>
      <LoadingAnnouncement label="Chargement du tableau de bord…" />
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-5 w-64 max-w-full" />
      </div>
      <div className="space-y-4" aria-hidden>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 lg:col-span-2">
            <BlockSkeleton height={276} />
            <BlockSkeleton height={290} />
            <BlockSkeleton rows={5} />
          </div>
          <div className="min-w-0 space-y-4">
            <BlockSkeleton rows={3} />
            <BlockSkeleton height={220} />
            <BlockSkeleton height={180} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <BlockSkeleton rows={3} />
          <BlockSkeleton rows={3} />
        </div>
      </div>
    </div>
  );
}
