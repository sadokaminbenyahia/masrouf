'use client';
/**
 * Erreur locale d'un bloc : le reste de la page continue de s'afficher.
 */
import { RotateCw, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface SectionErrorProps {
  title: string;
  message: string;
  testId?: string;
  className?: string;
}

export function SectionError({ title, message, testId, className }: SectionErrorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Card data-testid={testId} role="alert" className={cn('min-w-0 border-dashed', className)}>
      <CardContent className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <TriangleAlert aria-hidden className="text-warning size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-muted-foreground text-sm">{message}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={pending}
          onClick={() => startTransition(() => router.refresh())}
        >
          <RotateCw
            aria-hidden
            className={cn(pending && 'animate-spin motion-reduce:animate-none')}
          />
          Réessayer
        </Button>
      </CardContent>
    </Card>
  );
}
