'use client';
import { RotateCcwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function RetryButton() {
  return (
    <Button type="button" size="lg" className="mt-6" onClick={() => window.location.reload()}>
      <RotateCcwIcon aria-hidden="true" />
      Réessayer
    </Button>
  );
}
