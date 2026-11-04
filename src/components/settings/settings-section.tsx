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
      className={cn('bg-card shadow-card rounded-xl border p-5 sm:p-6', className)}
    >
      <div className="mb-5">
        <h2 id={`${id}-titre`} className="text-base font-semibold">
          {title}
        </h2>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {children}
    </section>
  );
}
