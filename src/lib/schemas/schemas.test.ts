import { describe, expect, it } from 'vitest';
import {
  transactionInputSchema,
  transactionPatchSchema,
  transactionQuerySchema,
  transactionSnapshotSchema,
} from '@/lib/schemas/transactions';
import { accountInputSchema, accountPatchSchema } from '@/lib/schemas/accounts';
import {
  budgetUpsertSchema,
  goalContributionSchema,
  goalInputSchema,
  goalPatchSchema,
} from '@/lib/schemas/budgets';
import { categoryInputSchema, categoryPatchSchema } from '@/lib/schemas/categories';
import {
  importCommitInputSchema,
  importPreviewInputSchema,
  importRowSchema,
  MAX_IMPORT_ROWS,
} from '@/lib/schemas/import';
import { recurringInputSchema, recurringPatchSchema } from '@/lib/schemas/recurring';
import { askInputSchema, parseEntryInputSchema, whatIfInputSchema } from '@/lib/schemas/ai';
import { loginSchema, registerSchema } from '@/lib/schemas/auth';
import {
  idSchema,
  isoDateSchema,
  MAX_MILLIMES,
  positiveMillimesSchema,
  signedMillimesSchema,
  yearMonthSchema,
  zodFieldErrors,
} from '@/lib/schemas/common';

const TX = {
  accountId: 'acc_1',
  type: 'EXPENSE' as const,
  amount: 3500,
  date: '2026-01-01',
  label: 'Café',
};

it('patches sans défauts', () => {
  expect(transactionPatchSchema.parse({ label: 'x' })).toEqual({ label: 'x' });
  expect(accountPatchSchema.parse({ archived: true })).toEqual({ archived: true });
  expect(goalPatchSchema.parse({ name: 'x' })).toEqual({ name: 'x' });
  expect(
    transactionInputSchema.parse({
      accountId: 'a',
      type: 'EXPENSE',
      amount: 1,
      date: '2026-01-01',
      label: 'x',
    }).tags,
  ).toEqual([]);
});

describe('montants : entiers de millimes uniquement', () => {
  it.each([0.5, 3500.1, 1e-3, Number.NaN, Number.POSITIVE_INFINITY, -1, 0, MAX_MILLIMES + 1])(
    'positiveMillimesSchema refuse %s',
    (v) => {
      expect(positiveMillimesSchema.safeParse(v).success).toBe(false);
    },
  );

  it.each([1, 3500, MAX_MILLIMES])('positiveMillimesSchema accepte %s', (v) => {
    expect(positiveMillimesSchema.parse(v)).toBe(v);
  });

  it('les chaînes ne sont pas converties (« 3500 » refusé)', () => {
    expect(positiveMillimesSchema.safeParse('3500').success).toBe(false);
  });

  it('signedMillimesSchema : bornes ± MAX_MILLIMES, négatifs et zéro acceptés', () => {
    expect(signedMillimesSchema.parse(-MAX_MILLIMES)).toBe(-MAX_MILLIMES);
    expect(signedMillimesSchema.parse(0)).toBe(0);
    expect(signedMillimesSchema.safeParse(-MAX_MILLIMES - 1).success).toBe(false);
    expect(signedMillimesSchema.safeParse(-0.5).success).toBe(false);
  });

  it('transaction, budget, objectif, récurrence, import : montant non entier refusé', () => {
    expect(transactionInputSchema.safeParse({ ...TX, amount: 3.5 }).success).toBe(false);
    expect(budgetUpsertSchema.safeParse({ categoryId: 'c', amount: 100.5 }).success).toBe(false);
    expect(goalInputSchema.safeParse({ name: 'x', targetAmount: 1.5 }).success).toBe(false);
    expect(
      goalInputSchema.safeParse({ name: 'x', targetAmount: 10, savedAmount: -1 }).success,
    ).toBe(false);
    expect(
      recurringInputSchema.safeParse({
        accountId: 'a',
        type: 'EXPENSE',
        amount: 0.1,
        label: 'Loyer',
        frequency: 'MONTHLY',
        startDate: '2026-01-01',
      }).success,
    ).toBe(false);
    expect(
      importRowSchema.safeParse({
        index: 0,
        date: '2026-01-01',
        label: 'x',
        amount: 1.5,
        type: 'EXPENSE',
      }).success,
    ).toBe(false);
    expect(
      accountInputSchema.safeParse({ name: 'x', type: 'BANK', initialBalance: 0.5 }).success,
    ).toBe(false);
  });

  it('versement d’objectif : nul refusé, retrait négatif accepté', () => {
    expect(goalContributionSchema.safeParse({ amount: 0 }).success).toBe(false);
    expect(goalContributionSchema.parse({ amount: -5000 })).toEqual({ amount: -5000 });
  });
});

describe('dates et identifiants', () => {
  it.each([
    '2026-02-29',
    '2026-13-01',
    '2026-1-01',
    '26-01-01',
    '2026-01-32',
    '',
    '2026-01-01T00:00',
  ])('isoDateSchema refuse « %s »', (v) => {
    expect(isoDateSchema.safeParse(v).success).toBe(false);
  });

  it('isoDateSchema accepte le 29 février d’une année bissextile', () => {
    expect(isoDateSchema.parse('2024-02-29')).toBe('2024-02-29');
    expect(isoDateSchema.parse('2000-02-29')).toBe('2000-02-29');
    expect(isoDateSchema.safeParse('1900-02-29').success).toBe(false);
  });

  it('yearMonthSchema', () => {
    expect(yearMonthSchema.parse('2026-12')).toBe('2026-12');
    expect(yearMonthSchema.safeParse('2026-00').success).toBe(false);
    expect(yearMonthSchema.safeParse('2026-1').success).toBe(false);
  });

  it('idSchema refuse les caractères d’injection et les identifiants trop longs', () => {
    for (const v of ['', 'a b', "a';--", 'a/b', '../x', 'x'.repeat(65)]) {
      expect(idSchema.safeParse(v).success, v).toBe(false);
    }
    expect(idSchema.parse('cm1abc_DEF-2')).toBe('cm1abc_DEF-2');
  });
});

describe('transactions', () => {
  it('TRANSFER sans compte destinataire refusé (champ transferAccountId)', () => {
    const r = transactionInputSchema.safeParse({ ...TX, type: 'TRANSFER' });
    expect(r.success).toBe(false);
    if (!r.success) expect(zodFieldErrors(r.error)).toHaveProperty('transferAccountId');
    expect(
      transactionInputSchema.safeParse({ ...TX, type: 'TRANSFER', transferAccountId: null })
        .success,
    ).toBe(false);
  });

  it('TRANSFER vers le même compte refusé, vers un autre accepté', () => {
    expect(
      transactionInputSchema.safeParse({ ...TX, type: 'TRANSFER', transferAccountId: 'acc_1' })
        .success,
    ).toBe(false);
    expect(
      transactionInputSchema.safeParse({ ...TX, type: 'TRANSFER', transferAccountId: 'acc_2' })
        .success,
    ).toBe(true);
  });

  it('patch TRANSFER : la règle du destinataire s’applique aussi', () => {
    expect(transactionPatchSchema.safeParse({ type: 'TRANSFER' }).success).toBe(false);
    expect(
      transactionPatchSchema.safeParse({ type: 'TRANSFER', transferAccountId: 'acc_2' }).success,
    ).toBe(true);
    expect(
      transactionPatchSchema.safeParse({
        type: 'TRANSFER',
        accountId: 'acc_2',
        transferAccountId: 'acc_2',
      }).success,
    ).toBe(false);
  });

  it('patch : aucun défaut injecté (tags absents restent absents)', () => {
    expect(transactionPatchSchema.parse({})).toEqual({});
    expect(transactionPatchSchema.parse({ amount: 1000 })).toEqual({ amount: 1000 });
    expect('tags' in transactionPatchSchema.parse({ note: null })).toBe(false);
    expect(goalPatchSchema.parse({})).toEqual({});
    expect(accountPatchSchema.parse({})).toEqual({});
    expect(recurringPatchSchema.parse({})).toEqual({});
    expect(categoryPatchSchema.parse({})).toEqual({});
  });

  it('libellé : rogné, requis, ≤ 140 caractères', () => {
    expect(transactionInputSchema.parse({ ...TX, label: '  Café  ' }).label).toBe('Café');
    expect(transactionInputSchema.safeParse({ ...TX, label: '   ' }).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...TX, label: 'x'.repeat(141) }).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...TX, label: 'x'.repeat(140) }).success).toBe(true);
  });

  it('tags : 10 maximum, sans « , » ni « ; », ≤ 30 caractères', () => {
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
    expect(transactionInputSchema.safeParse({ ...TX, tags: tags(10) }).success).toBe(true);
    expect(transactionInputSchema.safeParse({ ...TX, tags: tags(11) }).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...TX, tags: ['a,b'] }).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...TX, tags: ['a;b'] }).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...TX, tags: ['x'.repeat(31)] }).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...TX, tags: ['  '] }).success).toBe(false);
  });

  it('categoryId omis ≠ null (omis = l’IA propose ; null = sans catégorie)', () => {
    expect('categoryId' in transactionInputSchema.parse(TX)).toBe(false);
    expect(transactionInputSchema.parse({ ...TX, categoryId: null }).categoryId).toBeNull();
  });

  it('instantané (« Annuler ») : id requis, défauts de tags', () => {
    expect(transactionSnapshotSchema.safeParse(TX).success).toBe(false);
    expect(transactionSnapshotSchema.parse({ ...TX, id: 't1' }).tags).toEqual([]);
  });

  it('transactionQuerySchema : valeurs par défaut', () => {
    expect(transactionQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 25,
      sort: { field: 'date', direction: 'desc' },
    });
  });

  it('transactionQuerySchema : bornes de pagination et filtres', () => {
    expect(transactionQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(transactionQuerySchema.safeParse({ page: 1.5 }).success).toBe(false);
    expect(transactionQuerySchema.parse({ page: 10_000 }).page).toBe(10_000);
    expect(transactionQuerySchema.safeParse({ page: 10_001 }).success).toBe(false);
    expect(transactionQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(transactionQuerySchema.parse({ pageSize: 100 }).pageSize).toBe(100);
    expect(transactionQuerySchema.safeParse({ search: 'x'.repeat(101) }).success).toBe(false);
    expect(transactionQuerySchema.safeParse({ types: ['EXPENSE', 'X'] }).success).toBe(false);
    expect(transactionQuerySchema.safeParse({ from: '2026-02-30' }).success).toBe(false);
    expect(transactionQuerySchema.safeParse({ minAmount: 1.5 }).success).toBe(false);
    expect(transactionQuerySchema.parse({ minAmount: -5000 }).minAmount).toBe(-5000);
    expect(
      transactionQuerySchema.safeParse({ sort: { field: 'createdAt', direction: 'asc' } }).success,
    ).toBe(false);
    expect(transactionQuerySchema.parse({ search: '  carrefour ' }).search).toBe('carrefour');
  });
});

describe('import CSV', () => {
  const row = (index: number) => ({
    index,
    date: '2026-03-12',
    label: `Ligne ${index}`,
    amount: 1000 + index,
    type: 'EXPENSE' as const,
  });
  const rows = (n: number) => Array.from({ length: n }, (_, i) => row(i));

  it(`≤ ${MAX_IMPORT_ROWS} lignes : 5000 acceptées, 5001 refusées, 0 refusée`, () => {
    expect(MAX_IMPORT_ROWS).toBe(5000);
    expect(importPreviewInputSchema.safeParse({ accountId: 'a', rows: rows(5000) }).success).toBe(
      true,
    );
    expect(importPreviewInputSchema.safeParse({ accountId: 'a', rows: rows(5001) }).success).toBe(
      false,
    );
    expect(importPreviewInputSchema.safeParse({ accountId: 'a', rows: [] }).success).toBe(false);
  });

  it('commit : même plafond, catégorie explicite (null autorisé), categoryFromAI par défaut', () => {
    const commit = (n: number) =>
      rows(n).map((r) => ({ ...r, importHash: `h${r.index}`, categoryId: null }));
    expect(importCommitInputSchema.safeParse({ accountId: 'a', rows: commit(5001) }).success).toBe(
      false,
    );
    const ok = importCommitInputSchema.parse({ accountId: 'a', rows: commit(1) });
    expect(ok.rows[0]?.categoryFromAI).toBe(false);
    // categoryId est explicite (null pour « sans catégorie ») ; importHash est indicatif.
    expect(
      importCommitInputSchema.safeParse({
        accountId: 'a',
        rows: [{ ...row(0), importHash: 'h' }],
      }).success,
    ).toBe(false);
    expect(
      importCommitInputSchema.safeParse({ accountId: 'a', rows: [{ ...row(0), categoryId: null }] })
        .success,
    ).toBe(true);
  });

  it('ligne : TRANSFER interdit, index entier ≥ 0, libellé ≤ 140', () => {
    expect(importRowSchema.safeParse({ ...row(0), type: 'TRANSFER' }).success).toBe(false);
    expect(importRowSchema.safeParse({ ...row(0), index: -1 }).success).toBe(false);
    expect(importRowSchema.safeParse({ ...row(0), label: 'x'.repeat(141) }).success).toBe(false);
    expect(importRowSchema.safeParse({ ...row(0), note: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('catégories : revenu ↔ groupe INCOME', () => {
  it.each([
    ['INCOME', 'INCOME', true],
    ['EXPENSE', 'NEEDS', true],
    ['EXPENSE', 'WANTS', true],
    ['EXPENSE', 'SAVINGS', true],
    ['INCOME', 'NEEDS', false],
    ['EXPENSE', 'INCOME', false],
  ] as const)('kind %s + group %s → %s', (kind, group, valid) => {
    const r = categoryInputSchema.safeParse({ name: 'Cat', kind, group });
    expect(r.success).toBe(valid);
    if (!r.success) expect(zodFieldErrors(r.error)).toHaveProperty('group');
  });

  it('défauts icône/couleur appliqués à la création seulement', () => {
    expect(
      categoryInputSchema.parse({ name: 'Cat', kind: 'EXPENSE', group: 'NEEDS' }),
    ).toMatchObject({ icon: 'Tag', color: '#64748B' });
    expect(categoryPatchSchema.parse({ name: 'X' })).toEqual({ name: 'X' });
    expect(categoryPatchSchema.safeParse({ color: 'red' }).success).toBe(false);
  });
});

describe('autres schémas', () => {
  it('récurrence : fin avant début refusée, égalité acceptée', () => {
    const base = {
      accountId: 'a',
      type: 'EXPENSE' as const,
      amount: 750_000,
      label: 'Loyer',
      frequency: 'MONTHLY' as const,
      startDate: '2026-01-03',
    };
    expect(recurringInputSchema.safeParse({ ...base, endDate: '2026-01-02' }).success).toBe(false);
    expect(recurringInputSchema.safeParse({ ...base, endDate: '2026-01-03' }).success).toBe(true);
    expect(recurringInputSchema.parse(base).autoCreate).toBe(true);
    expect(recurringInputSchema.safeParse({ ...base, type: 'TRANSFER' }).success).toBe(false);
  });

  it('IA : longueurs maximales, pourcentages 0..100, épargne supplémentaire entière', () => {
    expect(parseEntryInputSchema.safeParse({ text: 'x'.repeat(201) }).success).toBe(false);
    expect(askInputSchema.safeParse({ question: '   ' }).success).toBe(false);
    expect(askInputSchema.safeParse({ question: 'x'.repeat(301) }).success).toBe(false);
    const w = { goalId: 'g', adjustments: [{ categoryId: 'c', percent: 101 }] };
    expect(whatIfInputSchema.safeParse(w).success).toBe(false);
    expect(whatIfInputSchema.parse({ ...w, adjustments: [] }).extraMonthlySaving).toBe(0);
    expect(
      whatIfInputSchema.safeParse({ ...w, adjustments: [], extraMonthlySaving: 1.5 }).success,
    ).toBe(false);
  });

  it('auth : e-mail normalisé, mot de passe avec lettre et chiffre', () => {
    expect(loginSchema.parse({ email: '  Ali@Example.TN ', password: 'x' }).email).toBe(
      'ali@example.tn',
    );
    expect(
      registerSchema.safeParse({ name: 'Ali', email: 'a@b.tn', password: 'abcdefgh' }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ name: 'Ali', email: 'a@b.tn', password: '12345678' }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ name: 'Ali', email: 'a@b.tn', password: 'abcd1234' }).success,
    ).toBe(true);
  });

  it('zodFieldErrors : erreur sans chemin → _form', () => {
    const r = transactionInputSchema.safeParse(null);
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(zodFieldErrors(r.error))).toContain('_form');
  });
});
