import { cn } from '@/lib/utils';

/**
 * Logo Masrouf : une porte de Sidi Bou Saïd (arc) sur fond bleu, avec une pièce au seuil.
 * Décoratif : le nom « Masrouf » est toujours rendu à côté en texte.
 */
export function LogoGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={cn('size-8 shrink-0', className)}
    >
      <rect width="64" height="64" rx="16" fill="#1F5FAD" />
      <path
        d="M20 52V30.5C20 23.6 25.4 18 32 18s12 5.6 12 12.5V52Z"
        fill="#FFFFFF"
        fillOpacity="0.96"
      />
      <path d="M25 52V31.5C25 27.4 28.1 24 32 24s7 3.4 7 7.5V52Z" fill="#1F5FAD" />
      <circle cx="32" cy="44" r="4.5" fill="#F4C247" />
      <path d="M14 52h36" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function BrandMark({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoGlyph />
      {compact ? (
        <span className="sr-only">Masrouf</span>
      ) : (
        <span className="text-lg font-semibold tracking-tight">Masrouf</span>
      )}
    </span>
  );
}
