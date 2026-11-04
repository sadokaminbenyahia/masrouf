import { describe, expect, it } from 'vitest';
import { headerCheckState, selectedIds, toggleAll, toggleSelection } from '../selection';

const ROWS = ['a', 'b', 'c', 'd', 'e'];

describe('toggleSelection', () => {
  it('bascule une ligne et la prend comme ancre', () => {
    const r1 = toggleSelection({}, ROWS, 'b', null, false);
    expect(r1).toEqual({ selection: { b: true }, anchorId: 'b' });
    const r2 = toggleSelection(r1.selection, ROWS, 'b', 'b', false);
    expect(r2.selection).toEqual({});
  });

  it('Maj+clic sélectionne la plage depuis l’ancre (dans les deux sens)', () => {
    expect(toggleSelection({ b: true }, ROWS, 'd', 'b', true).selection).toEqual({
      b: true,
      c: true,
      d: true,
    });
    expect(toggleSelection({ d: true }, ROWS, 'a', 'd', true).selection).toEqual({
      a: true,
      b: true,
      c: true,
      d: true,
    });
  });

  it('Maj+clic sur une ligne cochée décoche la plage', () => {
    const sel = { a: true, b: true, c: true, d: true };
    expect(toggleSelection(sel, ROWS, 'c', 'a', true).selection).toEqual({ d: true });
  });

  it('sans ancre visible, Maj+clic se comporte comme un clic', () => {
    expect(toggleSelection({}, ROWS, 'c', 'zz', true).selection).toEqual({ c: true });
  });
});

describe('case d’en-tête', () => {
  it('calcule l’état et bascule tout', () => {
    expect(headerCheckState({}, ROWS)).toBe(false);
    expect(headerCheckState({ a: true }, ROWS)).toBe('indeterminate');
    const all = toggleAll({ a: true }, ROWS);
    expect(headerCheckState(all, ROWS)).toBe(true);
    expect(toggleAll(all, ROWS)).toEqual({});
    expect(selectedIds({ e: true, a: true, z: true }, ROWS)).toEqual(['a', 'e']);
  });
});
