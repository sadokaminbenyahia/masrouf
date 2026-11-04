'use client';
/**
 * Infobulle commune des graphiques recharts : montants via <Money> (mode discret respecté).
 * Usage : <Tooltip content={(p) => <ChartTooltip {...p} />} />
 */
import type { ReactNode } from 'react';
import type { TooltipPayload, TooltipPayloadEntry } from 'recharts';
import { Money } from '@/components/shared/money';
import { formatPercent } from './format';

export interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipPayload;
  /** Titre de l'infobulle (défaut : le libellé de l'axe) */
  title?: (label: string | number | undefined, payload: TooltipPayload) => ReactNode;
  /** Format des valeurs : montant (défaut) ou pourcentage (ratio 0..1) */
  format?: 'money' | 'percent';
  /** Ligne additionnelle sous les valeurs */
  footer?: (payload: TooltipPayload) => ReactNode;
}

function renderValue(entry: TooltipPayloadEntry, format: 'money' | 'percent'): ReactNode {
  const { value } = entry;
  if (Array.isArray(value)) {
    const [low, high] = value;
    if (typeof low !== 'number' || typeof high !== 'number') return null;
    return (
      <span>
        <Money value={low} decimals={0} /> – <Money value={high} decimals={0} />
      </span>
    );
  }
  if (typeof value !== 'number') return null;
  if (format === 'percent') return <span className="tabular-nums">{formatPercent(value)}</span>;
  return <Money value={value} decimals={0} />;
}

export function ChartTooltip({
  active,
  label,
  payload,
  title,
  format = 'money',
  footer,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((e) => e.value !== null && e.value !== undefined && !e.hide);
  if (rows.length === 0) return null;
  const heading = title ? title(label, payload) : label;
  return (
    <div className="bg-popover text-popover-foreground min-w-40 rounded-lg border px-3 py-2 text-sm shadow-md">
      {heading !== null && heading !== undefined && heading !== '' ? (
        <div className="mb-1 font-medium">{heading}</div>
      ) : null}
      <ul className="space-y-1">
        {rows.map((entry) => (
          <li
            key={String(entry.dataKey ?? entry.name)}
            className="flex items-center justify-between gap-4"
          >
            <span className="text-muted-foreground flex items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: entry.color ?? entry.stroke ?? entry.fill }}
              />
              {entry.name}
            </span>
            <span className="font-medium">{renderValue(entry, format)}</span>
          </li>
        ))}
      </ul>
      {footer ? (
        <div className="text-muted-foreground mt-1 border-t pt-1 text-xs">{footer(payload)}</div>
      ) : null}
    </div>
  );
}
