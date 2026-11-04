/**
 * Légende statique des séries (texte en couleur d'encre, la pastille porte l'identité).
 */
import { cn } from '@/lib/utils';

export interface ChartLegendItem {
  label: string;
  color: string;
  shape: 'square' | 'line' | 'dashed' | 'band';
}

function Swatch({ color, shape }: Pick<ChartLegendItem, 'color' | 'shape'>) {
  if (shape === 'square') {
    return <span aria-hidden className="size-2.5 rounded-sm" style={{ background: color }} />;
  }
  if (shape === 'band') {
    return (
      <span
        aria-hidden
        className="h-2.5 w-4 rounded-sm"
        style={{ background: color, opacity: 0.25 }}
      />
    );
  }
  return (
    <svg aria-hidden width="18" height="6" viewBox="0 0 18 6" className="shrink-0">
      <line
        x1="1"
        y1="3"
        x2="17"
        y2="3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={shape === 'dashed' ? '4 3' : undefined}
      />
    </svg>
  );
}

export function ChartLegend({
  items,
  className,
}: {
  items: ChartLegendItem[];
  className?: string;
}) {
  return (
    <ul
      className={cn(
        'text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs',
        className,
      )}
    >
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <Swatch color={item.color} shape={item.shape} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
