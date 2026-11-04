'use client';
/**
 * Données d'un graphique pour les lecteurs d'écran (tableau masqué visuellement). Si le
 * graphique est cliquable, ses actions (ex. ouvrir les transactions d'un mois) sont proposées
 * dans une liste de boutons distincte : masquée tant qu'elle n'a pas le focus, elle apparaît
 * DANS LE FLUX sous le graphique dès qu'un de ses boutons reçoit le focus clavier (aucun
 * chevauchement, retour à la ligne sur mobile, pas de défilement horizontal).
 */
import { useId, type ReactNode } from 'react';

export interface ChartDataColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
}

export interface ChartDataAction<T> {
  /** Nom accessible complet du bouton (ex. « Transactions de mars 2026 ») */
  label: (row: T) => string;
  onActivate: (row: T) => void;
  /** Intitulé de la liste d'actions (défaut « Actions du graphique ») */
  title?: string;
}

export interface ChartDataTableProps<T> {
  caption: string;
  rows: readonly T[];
  columns: readonly ChartDataColumn<T>[];
  rowKey: (row: T) => string;
  /** Action par ligne (ex. ouvrir les transactions du mois) */
  action?: ChartDataAction<T>;
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
  const titleId = useId();
  return (
    <div className={className}>
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.header} scope="col">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c, i) =>
                  i === 0 ? (
                    <th key={c.header} scope="row">
                      {c.cell(row)}
                    </th>
                  ) : (
                    <td key={c.header}>{c.cell(row)}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {action ? (
        <div
          data-slot="chart-actions"
          className="sr-only focus-within:not-sr-only focus-within:mt-3 focus-within:block"
        >
          <div className="bg-card rounded-lg border p-3">
            <p id={titleId} className="text-muted-foreground mb-2 text-xs font-medium">
              {action.title ?? 'Actions du graphique'}
            </p>
            <ul aria-labelledby={titleId} className="flex flex-wrap gap-2">
              {rows.map((row) => (
                <li key={rowKey(row)}>
                  <button
                    type="button"
                    onClick={() => action.onActivate(row)}
                    className="text-primary hover:bg-accent focus-visible:ring-ring/50 min-h-11 rounded-full border px-3 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
                  >
                    {action.label(row)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
