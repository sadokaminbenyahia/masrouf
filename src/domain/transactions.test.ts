import { describe, expect, it } from 'vitest';
import {
  amountBounds,
  categoryMismatchMessage,
  decideCategoryChange,
  expectedCategoryKind,
  isCategoryCompatible,
  normalizeTags,
  pageCount,
  pageWindow,
  toAiTransaction,
  totalsFromTypeSums,
  totalsOf,
} from './transactions';
import type { Transaction } from './types';

describe('compatibilité type ↔ catégorie', () => {
  it('EXPENSE ↔ EXPENSE, INCOME ↔ INCOME, TRANSFER sans catégorie', () => {
    expect(expectedCategoryKind('EXPENSE')).toBe('EXPENSE');
    expect(expectedCategoryKind('TRANSFER')).toBeNull();
    expect(isCategoryCompatible('INCOME', 'INCOME')).toBe(true);
    expect(isCategoryCompatible('INCOME', 'EXPENSE')).toBe(false);
    expect(isCategoryCompatible('TRANSFER', 'EXPENSE')).toBe(false);
  });

  it('messages explicites', () => {
    expect(categoryMismatchMessage('EXPENSE', 'EXPENSE')).toBeNull();
    expect(categoryMismatchMessage('EXPENSE', 'INCOME')).toMatch(/dépense/);
    expect(categoryMismatchMessage('INCOME', 'EXPENSE')).toMatch(/revenu/);
    expect(categoryMismatchMessage('TRANSFER', 'EXPENSE')).toMatch(/virement/);
  });
});

describe('normalizeTags', () => {
  it('nettoie, déduplique sans tenir compte de la casse et limite à 10', () => {
    expect(
      normalizeTags(['  Travail ', 'travail', 'famille  proche', '', 'Famille proche']),
    ).toEqual(['Travail', 'famille proche']);
    expect(normalizeTags(Array.from({ length: 15 }, (_, i) => `t${i}`))).toHaveLength(10);
  });
});

describe('decideCategoryChange', () => {
  it('catégorie inchangée (undefined) : rien', () => {
    expect(decideCategoryChange({ categoryId: 'a', categorySource: 'AI' }, undefined)).toEqual({
      markAsUser: false,
      learn: false,
    });
  });
  it('changement : USER + apprentissage', () => {
    expect(decideCategoryChange({ categoryId: 'a', categorySource: 'AI' }, 'b')).toEqual({
      markAsUser: true,
      learn: true,
    });
  });
  it('passage à « sans catégorie » : USER sans apprentissage', () => {
    expect(decideCategoryChange({ categoryId: 'a', categorySource: 'USER' }, null)).toEqual({
      markAsUser: true,
      learn: false,
    });
  });
  it('confirmation d’une suggestion IA : USER + apprentissage', () => {
    expect(decideCategoryChange({ categoryId: 'a', categorySource: 'AI' }, 'a')).toEqual({
      markAsUser: true,
      learn: true,
    });
  });
  it('même catégorie déjà confirmée : rien', () => {
    expect(decideCategoryChange({ categoryId: 'a', categorySource: 'USER' }, 'a')).toEqual({
      markAsUser: false,
      learn: false,
    });
    expect(decideCategoryChange({ categoryId: null, categorySource: 'AI' }, null)).toEqual({
      markAsUser: false,
      learn: false,
    });
  });
});

describe('pagination', () => {
  it('calcule skip/take et le nombre de pages', () => {
    expect(pageWindow(3, 25)).toEqual({ page: 3, pageSize: 25, skip: 50, take: 25 });
    expect(pageWindow(0, 0)).toEqual({ page: 1, pageSize: 1, skip: 0, take: 1 });
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(51, 25)).toBe(3);
  });
});

describe('totaux', () => {
  it('exclut les virements des revenus/dépenses mais les compte', () => {
    expect(
      totalsFromTypeSums([
        { type: 'INCOME', amount: 1000, count: 1 },
        { type: 'EXPENSE', amount: 300, count: 2 },
        { type: 'TRANSFER', amount: 5000, count: 1 },
      ]),
    ).toEqual({ income: 1000, expense: 300, net: 700, count: 4 });
    expect(
      totalsOf([
        { type: 'EXPENSE', amount: 10 },
        { type: 'EXPENSE', amount: 5 },
      ]),
    ).toEqual({ income: 0, expense: 15, net: -15, count: 2 });
  });
});

describe('amountBounds', () => {
  it('compare au montant positif, quel que soit le signe saisi', () => {
    expect(amountBounds(undefined, undefined)).toEqual({});
    expect(amountBounds(-5000, undefined)).toEqual({ gte: 5000 });
    expect(amountBounds(undefined, 9000)).toEqual({ lte: 9000 });
    expect(amountBounds(-100, -10)).toEqual({ gte: 10, lte: 100 });
  });
});

describe('toAiTransaction', () => {
  it('ne garde que les champs utiles', () => {
    const t: Transaction = {
      id: 't1',
      accountId: 'a',
      categoryId: null,
      type: 'EXPENSE',
      amount: 3500,
      date: '2026-03-12',
      label: 'Café',
      note: 'n',
      tags: ['x'],
      transferAccountId: null,
      recurringId: null,
      categorySource: null,
      aiConfidence: null,
      createdAt: '2026-03-12T10:00:00.000Z',
    };
    expect(toAiTransaction(t)).toEqual({
      id: 't1',
      date: '2026-03-12',
      amount: 3500,
      type: 'EXPENSE',
      label: 'Café',
      categoryId: null,
      accountId: 'a',
      recurringId: null,
    });
  });
});
