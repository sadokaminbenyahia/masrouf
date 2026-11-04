import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      data-slot="card-skeleton"
      aria-hidden="true"
      className={cn('bg-card shadow-card flex flex-col gap-4 rounded-xl border p-5', className)}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="size-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

export function TableSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div
      data-slot="table-skeleton"
      aria-hidden="true"
      className={cn('bg-card shadow-card overflow-hidden rounded-xl border', className)}
    >
      <div className="flex items-center gap-4 border-b px-4 py-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="ml-auto h-3 w-20" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
          <Skeleton className="size-8 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-[min(14rem,60%)]" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({
  height = 260,
  className,
}: {
  height?: number;
  className?: string;
}) {
  const bars = [45, 70, 55, 85, 60, 75, 40, 90, 65, 50, 80, 58];
  return (
    <div
      data-slot="chart-skeleton"
      aria-hidden="true"
      className={cn('bg-card shadow-card rounded-xl border p-5', className)}
    >
      <Skeleton className="mb-4 h-4 w-36" />
      <div className="flex items-end gap-2" style={{ height }}>
        {bars.map((h, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t-md rounded-b-none"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Annonce aux lecteurs d'écran qu'un contenu se charge (à placer une fois par loading.tsx). */
export function LoadingAnnouncement({ label = 'Chargement…' }: { label?: string }) {
  return (
    <p role="status" className="sr-only">
      {label}
    </p>
  );
}
