'use client';
/**
 * Tableau de données d'un graphique, réservé aux lecteurs d'écran. S'il contient des actions
 * (boutons), il devient visible dès qu'il reçoit le focus clavier : les éléments cliquables
 * d'un graphique restent ainsi atteignables au clavier.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ChartDataColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
}

export interface ChartDataTableProps<T> {
  caption: string;
  rows: readonly T[];
  columns: readonly ChartDataColumn<T>[];
  rowKey: (row: T) => string;
  /** Action par ligne (ex. ouvrir les transactions du mois) */
  action?: { label: (row: T) => string; onActivate: (row: T) => void };
  className?: string;
}

export function ChartDataTable<T>({
  caption,
  rows,
  columns,
  rowKey,
  action,
  className,
}: ChartDataTableProps<T>) {
  return (
    <div
      className={cn(
        'sr-only',
        action &&
          'focus-within:bg-card focus-within:not-sr-only focus-within:mt-3 focus-within:block focus-within:max-h-72 focus-within:overflow-auto focus-within:rounded-lg focus-within:border',
        className,
      )}
    >
      <table className="w-full text-sm">
        <caption className="px-3 py-2 text-left font-medium">{caption}</caption>
        <thead>
          <tr className="text-muted-foreground border-b">
            {columns.map((c) => (
              <th
                key={c.header}
                scope="col"
                className={cn(
                  'px-3 py-1.5 font-medium',
                  c.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                {c.header}
              </th>
            ))}
            {action ? (
              <th scope="col" className="px-3 py-1.5 text-right font-medium">
                Action
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b last:border-0">
              {columns.map((c, i) =>
                i === 0 ? (
                  <th key={c.header} scope="row" className="px-3 py-1.5 text-left font-normal">
                    {c.cell(row)}
                  </th>
                ) : (
                  <td
                    key={c.header}
                    className={cn(
                      'px-3 py-1.5 tabular-nums',
                      c.align === 'right' ? 'text-right' : 'text-left',
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ),
              )}
              {action ? (
                <td className="px-3 py-1 text-right">
                  <button
                    type="button"
                    onClick={() => action.onActivate(row)}
                    className="text-primary focus-visible:ring-ring/50 min-h-11 rounded-md px-2 underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:outline-none"
                  >
                    {action.label(row)}
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
