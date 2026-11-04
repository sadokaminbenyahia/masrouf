import { describe, expect, it } from 'vitest';
import type { Category } from '@/domain/types';
import { diffInput, normalizedNote, pickFrequent, toFieldErrors } from '../form-utils';

const cat = (id: string, sortOrder: number): Category => ({
  id,
  name: id,
  kind: 'EXPENSE',
  group: 'NEEDS',
  icon: 'Tag',
  color: '#1F5FAD',
  sortOrder,
});

describe('diffInput', () => {
  const initial = {
    type: 'EXPENSE' as const,
    amount: 3_500,
    date: '2026-11-04',
    label: 'Café',
    accountId: 'a1',
    categoryId: 'c1',
    transferAccountId: null,
    tags: ['x'],
    note: null,
  };

  it('ne garde que les champs modifiés', () => {
    expect(diffInput(initial, { ...initial, amount: 4_000, note: ' Avec Sami ' })).toEqual({
      amount: 4_000,
      note: 'Avec Sami',
    });
    expect(diffInput(initial, { ...initial, tags: ['x', 'y'], categoryId: null })).toEqual({
      tags: ['x', 'y'],
      categoryId: null,
    });
  });

  it('sans changement, renvoie un patch neutre (libellé)', () => {
    expect(diffInput(initial, { ...initial, note: '' })).toEqual({ label: 'Café' });
  });
});

describe('toFieldErrors / normalizedNote', () => {
  it('ramène les chemins au champ et garde le premier message', () => {
    expect(
      toFieldErrors({ 'tags.0': ['Tag invalide.'], label: ['Libellé requis.', 'autre'], x: ['?'] }),
    ).toEqual({ tags: 'Tag invalide.', label: 'Libellé requis.' });
  });

  it('normalise une note vide en null', () => {
    expect(normalizedNote('  ')).toBeNull();
    expect(normalizedNote(undefined)).toBeNull();
    expect(normalizedNote(' ok ')).toBe('ok');
  });
});

describe('pickFrequent', () => {
  it('classe par fréquence, puis par ordre d’affichage', () => {
    const cats = [cat('a', 0), cat('b', 1), cat('c', 2), cat('d', 3)];
    const counts = new Map([
      ['c', 5],
      ['d', 5],
      ['b', 1],
    ]);
    expect(pickFrequent(cats, counts, 3).map((c) => c.id)).toEqual(['c', 'd', 'b']);
    expect(pickFrequent(cats, new Map(), 2).map((c) => c.id)).toEqual(['a', 'b']);
  });
});
