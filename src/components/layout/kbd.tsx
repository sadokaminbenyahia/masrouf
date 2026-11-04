import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded border border-b-2 px-1.5 font-sans text-[0.6875rem] font-medium',
        className,
      )}
      {...props}
    />
  );
}
