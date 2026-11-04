'use client';
import { useEffect } from 'react';
import { ErrorPanel } from '@/components/layout/error-panel';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[page] erreur de rendu', error);
  }, [error]);
  return (
    <main id="contenu" className="flex min-h-dvh items-center justify-center p-4">
      <ErrorPanel digest={error.digest} onRetry={reset} />
    </main>
  );
}
