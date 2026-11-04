/**
 * Couleurs des graphiques : variables CSS du design system (clair/sombre gérés par globals.css).
 * Une catégorie garde SA couleur (définie par l'utilisateur) ; à défaut, la palette --chart-n
 * est attribuée dans un ordre fixe, jamais selon le rang.
 */

/** Nombre de couleurs catégorielles disponibles (--chart-1 … --chart-8). */
export const CHART_PALETTE_SIZE = 8;

export const INCOME_COLOR = 'var(--income)';
export const EXPENSE_COLOR = 'var(--expense)';
export const NET_COLOR = 'var(--primary)';
export const WARNING_COLOR = 'var(--warning)';
export const MUTED_COLOR = 'var(--muted-foreground)';
export const GRID_COLOR = 'var(--border)';
export const OTHER_COLOR = 'var(--muted-foreground)';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** `var(--chart-n)` pour l'index donné (0 → --chart-1). */
export function chartVar(index: number): string {
  const n =
    (((Math.trunc(index) % CHART_PALETTE_SIZE) + CHART_PALETTE_SIZE) % CHART_PALETTE_SIZE) + 1;
  return `var(--chart-${n})`;
}

/** Couleur d'une catégorie si elle est valide (#RRGGBB), sinon la couleur de palette de son index. */
export function categoryColor(color: string | null | undefined, index: number): string {
  return color && HEX_COLOR.test(color) ? color : chartVar(index);
}
