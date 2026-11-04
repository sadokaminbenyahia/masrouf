import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function SettingsSection({
  id,
  title,
  description,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={`${id}-titre`}
      className={cn('rounded-xl border bg-card p-5 shadow-card sm:p-6', className)}
    >
      <div className="mb-5">
        <h2 id={`${id}-titre`} className="text-base font-semibold">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
