'use client';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorPanelProps {
  title?: string;
  message: string;
  onRetry: () => void;
  pending?: boolean;
  className?: string;
}

/** Erreur de chargement avec bouton « Réessayer ». */
export function ErrorPanel({
  title = 'Impossible de charger les données',
  message,
  onRetry,
  pending = false,
  className,
}: ErrorPanelProps) {
  return (
    <div
      role="alert"
      className={cn(
        'border-destructive/30 bg-destructive/5 flex flex-col items-start gap-3 rounded-xl border p-5 sm:flex-row sm:items-center',
        className,
      )}
    >
      <CircleAlert className="text-destructive size-6 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{message}</p>
      </div>
      <Button type="button" variant="outline" onClick={onRetry} disabled={pending}>
        <RefreshCw className={cn('size-4', pending && 'animate-spin')} aria-hidden />
        Réessayer
      </Button>
    </div>
  );
}

/** Erreur d'une page RSC : « Réessayer » relance le rendu serveur. */
export function LoadError({ title, message }: { title?: string; message: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <ErrorPanel
      {...(title ? { title } : {})}
      message={message}
      pending={pending}
      onRetry={() => startTransition(() => router.refresh())}
    />
  );
}
