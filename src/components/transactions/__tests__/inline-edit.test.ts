import { describe, expect, it } from 'vitest';
import {
  initialTableEditState,
  inlineValueToPatch,
  isCellEditable,
  nextEditableCell,
  resolveActive,
  resolveEditing,
  tableEditReducer,
  type IsEditable,
  type TableEditState,
} from '../inline-edit';
import { tx } from './fixtures';

const ROWS = ['r1', 'r2', 'r3'];
const all: IsEditable = () => true;
// r2 est un virement : sa catégorie n'est pas modifiable.
const noTransferCategory: IsEditable = (rowId, column) =>
  !(rowId === 'r2' && column === 'category');

describe('resolveActive / resolveEditing', () => {
  it('se replie sur la première cellule et ignore les lignes disparues', () => {
    expect(resolveActive(initialTableEditState, ROWS)).toEqual({ rowId: 'r1', column: 'date' });
    expect(resolveActive(initialTableEditState, [])).toBeNull();
    const state: TableEditState = {
      active: { rowId: 'gone', column: 'label' },
      editing: { rowId: 'gone', column: 'label' },
    };
    expect(resolveActive(state, ROWS)).toEqual({ rowId: 'r1', column: 'date' });
    expect(resolveEditing(state, ROWS)).toBeNull();
  });
});

describe('tableEditReducer — navigation', () => {
  it('change de ligne (bornée) en gardant la colonne', () => {
    let s = tableEditReducer(initialTableEditState, {
      type: 'focus',
      cell: { rowId: 'r1', column: 'amount' },
    });
    s = tableEditReducer(s, { type: 'moveRow', delta: 1, rowIds: ROWS });
    expect(s.active).toEqual({ rowId: 'r2', column: 'amount' });
    s = tableEditReducer(s, { type: 'moveRow', delta: 10, rowIds: ROWS });
    expect(s.active?.rowId).toBe('r3');
    s = tableEditReducer(s, { type: 'moveRow', delta: -10, rowIds: ROWS });
    expect(s.active?.rowId).toBe('r1');
  });

  it('change de colonne (bornée)', () => {
    let s = tableEditReducer(initialTableEditState, { type: 'moveColumn', delta: 1, rowIds: ROWS });
    expect(s.active).toEqual({ rowId: 'r1', column: 'label' });
    s = tableEditReducer(s, { type: 'moveColumn', delta: -5, rowIds: ROWS });
    expect(s.active?.column).toBe('date');
  });

  it('ne bouge pas pendant une édition', () => {
    const s: TableEditState = {
      active: { rowId: 'r1', column: 'label' },
      editing: { rowId: 'r1', column: 'label' },
    };
    expect(tableEditReducer(s, { type: 'moveRow', delta: 1, rowIds: ROWS })).toBe(s);
  });
});

describe('tableEditReducer — édition', () => {
  it('démarre et arrête une édition', () => {
    const cell = { rowId: 'r2', column: 'label' } as const;
    const s = tableEditReducer(initialTableEditState, {
      type: 'startEdit',
      cell,
      rowIds: ROWS,
      isEditable: all,
    });
    expect(s).toEqual({ active: cell, editing: cell });
    expect(tableEditReducer(s, { type: 'stopEdit' })).toEqual({ active: cell, editing: null });
  });

  it('refuse une cellule non modifiable', () => {
    const s = tableEditReducer(initialTableEditState, {
      type: 'startEdit',
      cell: { rowId: 'r2', column: 'category' },
      rowIds: ROWS,
      isEditable: noTransferCategory,
    });
    expect(s).toBe(initialTableEditState);
  });

  it('Tab passe à la cellule suivante, en sautant les cellules non modifiables', () => {
    let s: TableEditState = {
      active: { rowId: 'r2', column: 'label' },
      editing: { rowId: 'r2', column: 'label' },
    };
    s = tableEditReducer(s, {
      type: 'editNext',
      direction: 1,
      rowIds: ROWS,
      isEditable: noTransferCategory,
    });
    expect(s.editing).toEqual({ rowId: 'r2', column: 'account' });
  });

  it('Tab en fin de ligne passe à la ligne suivante ; en fin de tableau, arrête l’édition', () => {
    expect(nextEditableCell({ rowId: 'r1', column: 'amount' }, 1, ROWS, all)).toEqual({
      rowId: 'r2',
      column: 'date',
    });
    expect(nextEditableCell({ rowId: 'r2', column: 'date' }, -1, ROWS, all)).toEqual({
      rowId: 'r1',
      column: 'amount',
    });
    const last: TableEditState = {
      active: { rowId: 'r3', column: 'amount' },
      editing: { rowId: 'r3', column: 'amount' },
    };
    expect(
      tableEditReducer(last, { type: 'editNext', direction: 1, rowIds: ROWS, isEditable: all }),
    ).toEqual({ active: { rowId: 'r3', column: 'amount' }, editing: null });
  });
});

describe('isCellEditable', () => {
  it('interdit la catégorie d’un virement', () => {
    expect(isCellEditable(tx({ id: '1', type: 'TRANSFER' }), 'category')).toBe(false);
    expect(isCellEditable(tx({ id: '1', type: 'TRANSFER' }), 'amount')).toBe(true);
    expect(isCellEditable(undefined, 'label')).toBe(false);
  });
});

describe('inlineValueToPatch', () => {
  const t = tx({ id: '1', label: 'Café', amount: 3_500, date: '2026-11-04', categoryId: 'c1' });

  it('valide le libellé', () => {
    expect(inlineValueToPatch(t, 'label', '  Thé ')).toEqual({ ok: true, value: { label: 'Thé' } });
    expect(inlineValueToPatch(t, 'label', 'Café')).toEqual({ ok: true, value: null });
    expect(inlineValueToPatch(t, 'label', '   ').ok).toBe(false);
    expect(inlineValueToPatch(t, 'label', 'x'.repeat(141)).ok).toBe(false);
  });

  it('valide le montant (saisie intelligente)', () => {
    expect(inlineValueToPatch(t, 'amount', '3,5')).toEqual({ ok: true, value: null });
    expect(inlineValueToPatch(t, 'amount', '12,5+3')).toEqual({
      ok: true,
      value: { amount: 15_500 },
    });
    expect(inlineValueToPatch(t, 'amount', 'abc').ok).toBe(false);
  });

  it('valide la date, la catégorie et le compte', () => {
    expect(inlineValueToPatch(t, 'date', '2026-11-03')).toEqual({
      ok: true,
      value: { date: '2026-11-03' },
    });
    expect(inlineValueToPatch(t, 'date', '2026-13-01').ok).toBe(false);
    expect(inlineValueToPatch(t, 'category', '')).toEqual({
      ok: true,
      value: { categoryId: null },
    });
    expect(inlineValueToPatch(t, 'category', 'c1')).toEqual({ ok: true, value: null });
    expect(inlineValueToPatch(t, 'account', 'acc2')).toEqual({
      ok: true,
      value: { accountId: 'acc2' },
    });
    expect(inlineValueToPatch(t, 'account', '').ok).toBe(false);
    const transfer = tx({ id: '2', type: 'TRANSFER', accountId: 'a', transferAccountId: 'b' });
    expect(inlineValueToPatch(transfer, 'account', 'b').ok).toBe(false);
  });
});
