'use client';
import { useEffect } from 'react';
import { ErrorPanel } from '@/components/layout/error-panel';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app] erreur de rendu', error);
  }, [error]);
  return (
    <div className="py-10">
      <ErrorPanel digest={error.digest} onRetry={reset} />
    </div>
  );
}
