import { LoadingAnnouncement } from '@/components/shared/skeletons';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function SectionSkeleton({ height, rows = 0 }: { height?: number; rows?: number }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="space-y-3">
        {height ? <Skeleton className="w-full rounded-lg" style={{ height }} /> : null}
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </CardContent>
    </Card>
  );
}

export default function AnalysesLoading() {
  return (
    <div>
      <LoadingAnnouncement label="Chargement des analyses…" />
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div aria-hidden className="space-y-6">
        <div className="-mt-2 flex flex-wrap gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>
        <SectionSkeleton height={360} rows={2} />
        <SectionSkeleton height={160} rows={3} />
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionSkeleton rows={3} />
          <SectionSkeleton rows={3} />
        </div>
        <SectionSkeleton height={260} />
        <SectionSkeleton height={520} />
      </div>
    </div>
  );
}
