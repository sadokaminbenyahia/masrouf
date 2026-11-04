import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'bg-card/60 flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <div className="relative mb-4">
        <div
          aria-hidden="true"
          className="bg-primary/8 absolute inset-0 -m-2 rounded-full blur-md"
        />
        <div className="bg-brand-tint text-primary ring-primary/15 relative flex size-12 items-center justify-center rounded-2xl ring-1">
          <Icon className="size-6" aria-hidden="true" />
        </div>
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      {description && (
        <p className="text-muted-foreground mt-1.5 max-w-sm text-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>
      )}
    </div>
  );
}
