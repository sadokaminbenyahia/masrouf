/**
 * Mini-courbe sans axes (SVG pur, aucune mesure du DOM). Décorative par défaut ;
 * fournir `ariaLabel` pour qu'elle soit annoncée comme une image.
 */
import { cn } from '@/lib/utils';
import { NET_COLOR } from './colors';

export interface SparklineProps {
  values: readonly number[];
  color?: string;
  /** Hauteur en px (défaut 32) */
  height?: number;
  /** Remplit l'aire sous la courbe (défaut true) */
  area?: boolean;
  ariaLabel?: string;
  className?: string;
}

const W = 100;

/** Points SVG (x 0..100, y 0..h, y inversé) normalisés sur l'étendue des valeurs. */
export function sparklinePoints(values: readonly number[], height: number): [number, number][] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = 2;
  const usable = height - pad * 2;
  return values.map((v, i) => {
    const x = values.length === 1 ? W / 2 : (i / (values.length - 1)) * W;
    const y = span === 0 ? height / 2 : pad + usable - ((v - min) / span) * usable;
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
  });
}

export function Sparkline({
  values,
  color = NET_COLOR,
  height = 32,
  area = true,
  ariaLabel,
  className,
}: SparklineProps) {
  const points = sparklinePoints(values, height);
  if (points.length < 2) return null;
  const line = points.map(([x, y]) => `${x},${y}`).join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const areaPath =
    first && last
      ? `M${first[0]},${height} L${points.map(([x, y]) => `${x},${y}`).join(' L')} L${last[0]},${height} Z`
      : '';
  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      className={cn('w-full overflow-visible', className)}
      style={{ height }}
      {...(ariaLabel ? { role: 'img', 'aria-label': ariaLabel } : { 'aria-hidden': true })}
    >
      {area ? <path d={areaPath} fill={color} opacity={0.12} /> : null}
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
