/**
 * Navigation clavier et édition inline du tableau des transactions (reducer pur).
 *
 * - Une seule cellule « active » (tabindex roving) : flèches / j / k pour bouger.
 * - Entrée ou double-clic : édition ; Entrée valide, Échap annule, Tab valide et passe
 *   à la cellule éditable suivante (Maj+Tab : précédente).
 */
import { isISODate } from '@/domain/dates';
import { parseAmountInput } from '@/domain/money';
import { err, ok, type Result } from '@/domain/result';
import type { Transaction } from '@/domain/types';
import type { TransactionPatch } from '@/lib/schemas/transactions';

export const EDITABLE_COLUMNS = ['date', 'label', 'category', 'account', 'amount'] as const;
export type EditableColumn = (typeof EDITABLE_COLUMNS)[number];

export interface CellRef {
  rowId: string;
  column: EditableColumn;
}

export interface TableEditState {
  /** Cellule active (focus roving) ; null = première cellule de la première ligne */
  active: CellRef | null;
  /** Cellule en cours d'édition */
  editing: CellRef | null;
}

export const initialTableEditState: TableEditState = { active: null, editing: null };

export type IsEditable = (rowId: string, column: EditableColumn) => boolean;

export type TableEditAction =
  | { type: 'focus'; cell: CellRef }
  | { type: 'moveRow'; delta: number; rowIds: readonly string[] }
  | { type: 'moveColumn'; delta: number; rowIds: readonly string[] }
  | { type: 'startEdit'; cell?: CellRef; rowIds: readonly string[]; isEditable: IsEditable }
  | { type: 'stopEdit' }
  | {
      type: 'editNext';
      direction: 1 | -1;
      rowIds: readonly string[];
      isEditable: IsEditable;
    }
  ;

/** Cellule active effective (repli sur la première ligne). */
export function resolveActive(state: TableEditState, rowIds: readonly string[]): CellRef | null {
  if (state.active && rowIds.includes(state.active.rowId)) return state.active;
  const firstRow = rowIds[0];
  return firstRow === undefined ? null : { rowId: firstRow, column: 'date' };
}

/** Cellule en édition, si sa ligne est toujours affichée (page, filtres, suppression). */
export function resolveEditing(state: TableEditState, rowIds: readonly string[]): CellRef | null {
  return state.editing && rowIds.includes(state.editing.rowId) ? state.editing : null;
}

/** Cellule éditable suivante (même ligne d'abord, puis lignes voisines), ou null. */
export function nextEditableCell(
  from: CellRef,
  direction: 1 | -1,
  rowIds: readonly string[],
  isEditable: IsEditable,
): CellRef | null {
  const rowIndex = rowIds.indexOf(from.rowId);
  if (rowIndex < 0) return null;
  const cols = EDITABLE_COLUMNS;
  let r = rowIndex;
  let c = cols.indexOf(from.column) + direction;
  while (r >= 0 && r < rowIds.length) {
    while (c >= 0 && c < cols.length) {
      const rowId = rowIds[r];
      const column = cols[c];
      if (rowId !== undefined && column !== undefined && isEditable(rowId, column)) {
        return { rowId, column };
      }
      c += direction;
    }
    r += direction;
    c = direction === 1 ? 0 : cols.length - 1;
  }
  return null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function tableEditReducer(state: TableEditState, action: TableEditAction): TableEditState {
  switch (action.type) {
    case 'focus':
      return { ...state, active: action.cell };
    case 'moveRow': {
      if (state.editing) return state;
      const active = resolveActive(state, action.rowIds);
      if (!active) return state;
      const i = action.rowIds.indexOf(active.rowId);
      const rowId = action.rowIds[clamp(i + action.delta, 0, action.rowIds.length - 1)];
      return rowId === undefined ? state : { ...state, active: { rowId, column: active.column } };
    }
    case 'moveColumn': {
      if (state.editing) return state;
      const active = resolveActive(state, action.rowIds);
      if (!active) return state;
      const i = EDITABLE_COLUMNS.indexOf(active.column);
      const column = EDITABLE_COLUMNS[clamp(i + action.delta, 0, EDITABLE_COLUMNS.length - 1)];
      return column === undefined ? state : { ...state, active: { ...active, column } };
    }
    case 'startEdit': {
      const cell = action.cell ?? resolveActive(state, action.rowIds);
      if (!cell || !action.isEditable(cell.rowId, cell.column)) return state;
      return { active: cell, editing: cell };
    }
    case 'stopEdit':
      return state.editing ? { active: state.editing, editing: null } : state;
    case 'editNext': {
      if (!state.editing) return state;
      const next = nextEditableCell(state.editing, action.direction, action.rowIds, action.isEditable);
      return next ? { active: next, editing: next } : { active: state.editing, editing: null };
    }
  }
}

/** Une transaction de virement n'a pas de catégorie modifiable. */
export function isCellEditable(t: Transaction | undefined, column: EditableColumn): boolean {
  if (!t) return false;
  if (column === 'category') return t.type !== 'TRANSFER';
  return true;
}

/**
 * Valide la saisie d'une cellule et produit le patch correspondant.
 * Renvoie `ok(null)` si la valeur n'a pas changé.
 */
export function inlineValueToPatch(
  t: Transaction,
  column: EditableColumn,
  raw: string,
): Result<TransactionPatch | null, string> {
  switch (column) {
    case 'label': {
      const label = raw.trim();
      if (label === '') return err('Libellé requis.');
      if (label.length > 140) return err('140 caractères maximum.');
      return ok(label === t.label ? null : { label });
    }
    case 'date': {
      if (!isISODate(raw)) return err('Date invalide.');
      return ok(raw === t.date ? null : { date: raw });
    }
    case 'amount': {
      const r = parseAmountInput(raw);
      if (!r.ok) return err(r.error);
      return ok(r.value === t.amount ? null : { amount: r.value });
    }
    case 'category': {
      const categoryId = raw === '' ? null : raw;
      return ok(categoryId === t.categoryId ? null : { categoryId });
    }
    case 'account': {
      if (raw === '') return err('Compte requis.');
      if (t.type === 'TRANSFER' && raw === t.transferAccountId) {
        return err('Choisissez un compte différent du compte destinataire.');
      }
      return ok(raw === t.accountId ? null : { accountId: raw });
    }
  }
}
