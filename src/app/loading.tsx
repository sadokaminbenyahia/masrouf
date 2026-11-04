import { BrandMark } from '@/components/layout/brand';

export default function RootLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
      <BrandMark className="animate-pulse motion-reduce:animate-none" />
      <span className="sr-only">Chargement…</span>
    </div>
  );
}
