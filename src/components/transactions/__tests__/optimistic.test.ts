import { describe, expect, it } from 'vitest';
import { applyPatch, buildUndoPatch, diffPatch, patchPage, removeFromPage } from '../optimistic';
import { pageOf, tx } from './fixtures';

describe('applyPatch', () => {
  it('une catégorie choisie devient USER et perd la confiance IA', () => {
    const t = tx({ id: '1', categoryId: 'c1', categorySource: 'AI', aiConfidence: 0.8 });
    expect(applyPatch(t, { categoryId: 'c2' })).toMatchObject({
      categoryId: 'c2',
      categorySource: 'USER',
      aiConfidence: null,
    });
    expect(applyPatch(t, { categoryId: null }).categorySource).toBeNull();
  });

  it('un virement n’a pas de catégorie ; une dépense n’a pas de compte destinataire', () => {
    const t = tx({ id: '1', categoryId: 'c1' });
    expect(applyPatch(t, { type: 'TRANSFER', transferAccountId: 'acc2' })).toMatchObject({
      categoryId: null,
      transferAccountId: 'acc2',
    });
    const transfer = tx({ id: '2', type: 'TRANSFER', categoryId: null, transferAccountId: 'acc2' });
    expect(applyPatch(transfer, { type: 'EXPENSE' }).transferAccountId).toBeNull();
  });

  it('nettoie libellé, note et tags', () => {
    const t = tx({ id: '1' });
    expect(applyPatch(t, { label: ' Thé ', note: '  ', tags: [' a '] })).toMatchObject({
      label: 'Thé',
      note: null,
      tags: ['a'],
    });
  });
});

describe('patchPage / removeFromPage', () => {
  const page = pageOf([
    tx({ id: '1', type: 'EXPENSE', amount: 2_000 }),
    tx({ id: '2', type: 'INCOME', amount: 10_000 }),
    tx({ id: '3', type: 'TRANSFER', amount: 5_000, categoryId: null, transferAccountId: 'x' }),
  ]);

  it('ajuste les totaux quand le montant ou le type change', () => {
    const next = patchPage(
      page,
      new Map([
        ['1', { amount: 3_000 }],
        ['2', { type: 'EXPENSE' as const }],
      ]),
    );
    expect(next.items[0]?.amount).toBe(3_000);
    expect(next.totals).toEqual({ income: 0, expense: 13_000, net: -13_000, count: 3 });
  });

  it('renvoie la même page si rien ne correspond', () => {
    expect(patchPage(page, new Map([['zz', { amount: 1 }]]))).toBe(page);
    expect(removeFromPage(page, ['zz'])).toBe(page);
  });

  it('retire des lignes et met à jour total, pages et totaux', () => {
    const next = removeFromPage({ ...page, total: 26, pageCount: 2 }, ['1', '3']);
    expect(next.items.map((t) => t.id)).toEqual(['2']);
    expect(next.total).toBe(24);
    expect(next.pageCount).toBe(1);
    expect(next.totals).toEqual({ income: 10_000, expense: 0, net: 10_000, count: 1 });
  });
});

describe('buildUndoPatch / diffPatch', () => {
  const before = tx({ id: '1', label: 'Café', amount: 3_500, categoryId: 'c1', tags: ['a'] });

  it('rejoue les valeurs d’avant pour les seuls champs modifiés', () => {
    expect(buildUndoPatch(before, { label: 'Thé', amount: 4_000 })).toEqual({
      label: 'Café',
      amount: 3_500,
    });
    expect(buildUndoPatch(before, { categoryId: null })).toEqual({ categoryId: 'c1' });
  });

  it('un changement de type restaure aussi la catégorie et le compte destinataire', () => {
    expect(buildUndoPatch(before, { type: 'TRANSFER', transferAccountId: 'x' })).toEqual({
      type: 'EXPENSE',
      transferAccountId: null,
      categoryId: 'c1',
    });
  });

  it('calcule la différence entre deux versions', () => {
    const after = { ...before, label: 'Thé', tags: ['a', 'b'] };
    expect(diffPatch(after, before)).toEqual({ label: 'Café', tags: ['a'] });
    expect(diffPatch(before, before)).toEqual({});
  });
});
