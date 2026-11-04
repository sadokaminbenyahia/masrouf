// Isolation des données : avec un client Prisma simulé qui journalise chaque requête, on
// vérifie que TOUTE requête émise par budgets.service et transactions.service est scopée sur
// l'utilisateur courant (where.userId, ou data.userId pour une création).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = 'user_alice';

interface PrismaCall {
  model: string;
  method: string;
  args: unknown;
}

const calls: PrismaCall[] = [];
type Handler = (model: string, method: string, args: unknown) => unknown;
const handlers = new Map<string, Handler>();

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const NOW = new Date('2026-11-04T10:00:00.000Z');
const ROWS: Record<string, Record<string, unknown>> = {
  transaction: {
    id: 'tx_1',
    userId: USER,
    accountId: 'acc_1',
    categoryId: 'cat_courses',
    type: 'EXPENSE',
    amount: 87_250,
    date: '2026-11-02',
    label: 'CARREFOUR',
    note: null,
    transferAccountId: null,
    recurringId: null,
    importHash: null,
    categorySource: 'AI',
    aiConfidence: 0.8,
    createdAt: NOW,
    updatedAt: NOW,
    tags: [{ name: 'maison' }],
  },
  category: {
    id: 'cat_courses',
    userId: USER,
    name: 'Courses',
    kind: 'EXPENSE',
    group: 'NEEDS',
    icon: 'Tag',
    color: '#000000',
    sortOrder: 0,
    createdAt: NOW,
  },
  budget: {
    id: 'bud_1',
    userId: USER,
    categoryId: 'cat_courses',
    amount: 400_000,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  recurringRule: {
    id: 'rec_1',
    userId: USER,
    accountId: 'acc_1',
    categoryId: null,
    type: 'EXPENSE',
    amount: 750_000,
    label: 'Loyer',
    frequency: 'MONTHLY',
    startDate: '2026-01-03',
    nextDate: '2026-12-03',
    endDate: null,
    active: true,
    autoCreate: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  account: {
    id: 'acc_1',
    userId: USER,
    name: 'BIAT',
    type: 'BANK',
    initialBalance: 0,
    color: '#000000',
    archived: false,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
};

/** Réponse par défaut, plausible, à une requête Prisma. */
function defaultResult(model: string, method: string, args: unknown): unknown {
  const row = ROWS[model] ?? { id: `${model}_1`, userId: USER };
  const data = isRecord(args) && isRecord(args.data) ? args.data : {};
  switch (method) {
    case 'findFirst':
    case 'findUnique':
      return row;
    case 'findMany': {
      // Les recherches par liste d'identifiants renvoient ces identifiants (comptes possédés…).
      const where = isRecord(args) && isRecord(args.where) ? args.where : {};
      const ids = isRecord(where.id) && Array.isArray(where.id.in) ? where.id.in : null;
      return ids ? ids.map((id) => ({ ...row, id })) : [row];
    }
    case 'count':
      return 1;
    case 'groupBy':
      return [];
    case 'aggregate':
      return { _max: { sortOrder: 0 }, _sum: { amount: 0 }, _count: { _all: 0 } };
    case 'create':
    case 'update':
    case 'upsert': {
      const { tags: _tags, ...fields } = data;
      return { ...row, ...fields, tags: [] };
    }
    case 'createMany':
    case 'updateMany':
    case 'deleteMany':
      return { count: 1 };
    default:
      return null;
  }
}

function modelProxy(model: string): Record<string, unknown> {
  return new Proxy<Record<string, unknown>>(
    {},
    {
      get(_target, method) {
        if (typeof method !== 'string' || method === 'then') return undefined;
        return async (args: unknown) => {
          calls.push({ model, method, args });
          const custom = handlers.get(`${model}.${method}`);
          return custom ? custom(model, method, args) : defaultResult(model, method, args);
        };
      },
    },
  );
}

const client: Record<string, unknown> = new Proxy<Record<string, unknown>>(
  {},
  {
    get(_target, prop) {
      if (typeof prop !== 'string' || prop === 'then') return undefined;
      if (prop === '$transaction') {
        return async (arg: unknown) => {
          if (typeof arg === 'function') return arg(client);
          if (Array.isArray(arg)) return Promise.all(arg);
          throw new Error('$transaction : argument inattendu');
        };
      }
      return modelProxy(prop);
    },
  },
);

vi.mock('@/server/db', () => ({ prisma: client }));
vi.mock('@/server/clock', () => ({ today: () => '2026-11-04', APP_TIMEZONE: 'Africa/Tunis' }));
const learnFromCorrection = vi.fn(async () => ({ ok: true as const, value: undefined }));
const learnFromCorrections = vi.fn(async () => ({ ok: true as const, value: undefined }));
const bulkRateLimited = vi.fn(
  (): { ok: false; error: { code: 'RATE_LIMITED'; message: string } } | null => null,
);
vi.mock('@/server/services/ai.service', () => ({
  AUTO_CATEGORIZE_THRESHOLD: 0.55,
  predictCategory: vi.fn(async () => ({
    ok: true as const,
    value: { categoryId: 'cat_courses', confidence: 0.9, source: 'MODEL', alternatives: [] },
  })),
  learnFromCorrection,
  learnFromCorrections,
  bulkRateLimited,
}));

const budgets = await import('@/server/services/budgets.service');
const accounts = await import('@/server/services/accounts.service');
const categories = await import('@/server/services/categories.service');
const goals = await import('@/server/services/goals.service');
const recurring = await import('@/server/services/recurring.service');
const { USER_LIMITS } = await import('@/domain/limits');
const transactions = await import('@/server/services/transactions.service');

/** `where` scopé : `userId` au premier niveau, ou dans un élément de `AND` (jamais dans un `OR`). */
function whereIsScoped(where: unknown, userId: string): boolean {
  if (!isRecord(where)) return false;
  if (where.userId === userId) return true;
  if (Array.isArray(where.AND)) return where.AND.some((w) => isRecord(w) && w.userId === userId);
  return false;
}

/** Relations imbriquées (tags) : chaque connectOrCreate est lui aussi scopé. */
function nestedTagsScoped(data: Record<string, unknown>, userId: string): boolean {
  const tags = data.tags;
  if (!isRecord(tags)) return true;
  const list = Array.isArray(tags.connectOrCreate) ? tags.connectOrCreate : [];
  return list.every(
    (c) =>
      isRecord(c) &&
      isRecord(c.where) &&
      isRecord(c.where.userId_name) &&
      c.where.userId_name.userId === userId &&
      isRecord(c.create) &&
      c.create.userId === userId,
  );
}

/** Aucune requête n'est autorisée sans userId (pas même un test d'existence d'identifiant). */
function unscopedCalls(userId: string): PrismaCall[] {
  return calls.filter((c) => {
    const args = isRecord(c.args) ? c.args : {};
    if (c.method === 'create') {
      return !(
        isRecord(args.data) &&
        args.data.userId === userId &&
        nestedTagsScoped(args.data, userId)
      );
    }
    if (c.method === 'createMany') {
      const data = Array.isArray(args.data) ? args.data : [];
      return !data.every((d) => isRecord(d) && d.userId === userId);
    }
    if (c.method === 'update' && isRecord(args.data) && !nestedTagsScoped(args.data, userId)) {
      return true;
    }
    return !whereIsScoped(args.where, userId);
  });
}

beforeEach(() => {
  calls.length = 0;
  handlers.clear();
  learnFromCorrection.mockClear();
  learnFromCorrections.mockClear();
});

function expectAllScoped(): void {
  expect(calls.length).toBeGreaterThan(0);
  const bad = unscopedCalls(USER);
  expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
}

describe('budgets.service : chaque requête Prisma filtre par userId', () => {
  it('listBudgetProgress', async () => {
    const r = await budgets.listBudgetProgress(USER, '2026-11');
    expect(r.ok).toBe(true);
    expectAllScoped();
    expect(calls.map((c) => `${c.model}.${c.method}`)).toEqual(
      expect.arrayContaining(['budget.findMany', 'category.findMany', 'transaction.groupBy']),
    );
  });

  it('upsertBudget : création (aucun budget existant)', async () => {
    handlers.set('budget.findFirst', () => null);
    const r = await budgets.upsertBudget(USER, { categoryId: 'cat_courses', amount: 300_000 });
    expect(r.ok).toBe(true);
    expectAllScoped();
    expect(calls.some((c) => c.model === 'budget' && c.method === 'create')).toBe(true);
  });

  it('upsertBudget : mise à jour d’un budget existant', async () => {
    const r = await budgets.upsertBudget(USER, { categoryId: 'cat_courses', amount: 300_000 });
    expect(r.ok).toBe(true);
    expectAllScoped();
    expect(calls.some((c) => c.model === 'budget' && c.method === 'update')).toBe(true);
  });

  it('upsertBudget : catégorie d’un autre utilisateur → NOT_FOUND, aucune écriture', async () => {
    handlers.set('category.findFirst', () => null);
    const r = await budgets.upsertBudget(USER, { categoryId: 'cat_bob', amount: 1000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND');
    expect(calls.some((c) => c.model === 'budget')).toBe(false);
    expectAllScoped();
  });

  it('deleteBudget et reorderBudgets', async () => {
    expect((await budgets.deleteBudget(USER, 'bud_1')).ok).toBe(true);
    expect((await budgets.reorderBudgets(USER, ['bud_1'])).ok).toBe(true);
    expectAllScoped();
    expect(calls.filter((c) => c.method === 'updateMany')).toHaveLength(1);
  });

  it('reorderBudgets avec un identifiant étranger → NOT_FOUND, aucune écriture', async () => {
    const r = await budgets.reorderBudgets(USER, ['bud_1', 'bud_bob']);
    expect(r.ok).toBe(false);
    expect(calls.some((c) => c.method === 'updateMany')).toBe(false);
  });
});

describe('transactions.service : chaque requête Prisma filtre par userId', () => {
  const query = {
    page: 2,
    pageSize: 25,
    search: 'carrefour',
    types: ['EXPENSE' as const],
    accountIds: ['acc_1'],
    categoryIds: ['cat_courses'],
    uncategorized: true,
    tag: 'maison',
    from: '2026-01-01',
    to: '2026-12-31',
    minAmount: 1000,
    maxAmount: 900_000,
    sort: { field: 'amount' as const, direction: 'asc' as const },
  };

  it('listTransactions (tous les filtres) et getTransaction', async () => {
    expect((await transactions.listTransactions(USER, query)).ok).toBe(true);
    expect((await transactions.getTransaction(USER, 'tx_1')).ok).toBe(true);
    expectAllScoped();
    // Le filtre par tag est lui aussi scopé (tags d'un autre utilisateur ignorés).
    const where = calls.find((c) => c.method === 'findMany')?.args;
    expect(JSON.stringify(where)).toContain(`"some":{"userId":"${USER}","name":"maison"}`);
  });

  it('createTransaction : catégorie prédite par l’IA, puis vérifiée chez l’utilisateur', async () => {
    const r = await transactions.createTransaction(USER, {
      accountId: 'acc_1',
      type: 'EXPENSE',
      amount: 3500,
      date: '2026-11-03',
      label: 'Café',
      tags: ['matin', 'travail'],
    });
    expect(r.ok).toBe(true);
    expectAllScoped();
    const create = calls.find((c) => c.method === 'create');
    expect(
      create &&
        isRecord(create.args) &&
        isRecord(create.args.data) &&
        create.args.data.categorySource,
    ).toBe('AI');
  });

  it('createTransaction : virement vers un compte étranger → NOT_FOUND, aucune écriture', async () => {
    handlers.set('account.findMany', () => [{ id: 'acc_1' }]);
    const r = await transactions.createTransaction(USER, {
      accountId: 'acc_1',
      type: 'TRANSFER',
      amount: 3500,
      date: '2026-11-03',
      label: 'Virement',
      tags: [],
      transferAccountId: 'acc_bob',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND');
    expect(calls.some((c) => c.method === 'create')).toBe(false);
    expectAllScoped();
  });

  it('updateTransaction : changement de catégorie → apprentissage + écriture scopée', async () => {
    handlers.set('category.findFirst', () => ({
      ...ROWS.category,
      id: 'cat_resto',
      name: 'Restaurants',
    }));
    const r = await transactions.updateTransaction(USER, 'tx_1', {
      categoryId: 'cat_resto',
      label: 'Resto',
      tags: ['sortie'],
    });
    expect(r.ok).toBe(true);
    expect(learnFromCorrection).toHaveBeenCalledTimes(1);
    expectAllScoped();
    const update = calls.find((c) => c.method === 'update');
    expect(isRecord(update?.args) && update.args.where).toEqual({ id: 'tx_1', userId: USER });
  });

  it('updateTransaction : transaction d’un autre utilisateur → NOT_FOUND, aucune écriture', async () => {
    handlers.set('transaction.findFirst', () => null);
    const r = await transactions.updateTransaction(USER, 'tx_bob', { label: 'piraté' });
    expect(r.ok).toBe(false);
    expect(calls.some((c) => c.method === 'update' || c.method === 'updateMany')).toBe(false);
    expectAllScoped();
  });

  it('delete, restore, duplicate', async () => {
    const del = await transactions.deleteTransaction(USER, 'tx_1');
    expect(del.ok).toBe(true);
    if (!del.ok) return;
    const restored = await transactions.restoreTransaction(USER, {
      ...del.value,
      recurringId: 'rec_1',
    });
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      // L'origine de la catégorie est restituée (ici « AI », confiance 0,8).
      expect(restored.value).toMatchObject({ categorySource: 'AI', aiConfidence: 0.8 });
    }
    expect((await transactions.duplicateTransaction(USER, 'tx_1')).ok).toBe(true);
    expectAllScoped();
    // Aucun test d'existence global de l'identifiant (il servirait d'oracle).
    expect(calls.some((c) => c.method === 'findUnique' && c.model === 'transaction')).toBe(false);
  });

  it('restoreTransaction : identifiant déjà pris (P2002) → CONFLICT générique', async () => {
    const { Prisma } = await import('@prisma/client');
    handlers.set('transaction.create', () => {
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
    });
    const r = await transactions.restoreTransaction(USER, {
      id: 'tx_bob',
      accountId: 'acc_1',
      type: 'EXPENSE',
      amount: 1000,
      date: '2026-11-01',
      label: 'x',
      tags: [],
    });
    expect(r).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: transactions.RESTORE_CONFLICT_MESSAGE },
    });
    expectAllScoped();
  });

  it('restoreTransaction : instantané sans origine → USER ; restoreTransactions atomique', async () => {
    const base = {
      accountId: 'acc_1',
      categoryId: 'cat_courses',
      type: 'EXPENSE' as const,
      amount: 1000,
      date: '2026-11-01',
      label: 'x',
      tags: [],
    };
    const one = await transactions.restoreTransaction(USER, { ...base, id: 'tx_7' });
    expect(one.ok && one.value.categorySource).toBe('USER');

    calls.length = 0;
    const many = await transactions.restoreTransactions(USER, [
      { ...base, id: 'tx_a', categorySource: 'IMPORT' },
      { ...base, id: 'tx_b' },
    ]);
    expect(many.ok && many.value.map((t) => t.categorySource)).toEqual(['IMPORT', 'USER']);
    // Vérifications mémoïsées : une seule lecture de compte et de catégorie pour le lot.
    expect(calls.filter((c) => c.model === 'category')).toHaveLength(1);
    expect(calls.filter((c) => c.method === 'create')).toHaveLength(2);
    expectAllScoped();

    // Un instantané invalide dans le lot : RIEN n'est recréé.
    calls.length = 0;
    handlers.set('recurringRule.findFirst', () => null);
    const bad = await transactions.restoreTransactions(USER, [
      { ...base, id: 'tx_c' },
      { ...base, id: 'tx_d', recurringId: 'rec_bob' },
    ]);
    expect(bad.ok).toBe(false);
    expect(calls.some((c) => c.method === 'create')).toBe(false);
  });

  it('restoreTransaction : récurrence étrangère → NOT_FOUND', async () => {
    handlers.set('recurringRule.findFirst', () => null);
    const r = await transactions.restoreTransaction(USER, {
      id: 'tx_9',
      accountId: 'acc_1',
      type: 'EXPENSE',
      amount: 1000,
      date: '2026-11-01',
      label: 'x',
      tags: [],
      recurringId: 'rec_bob',
    });
    expect(r.ok).toBe(false);
    expect(calls.some((c) => c.method === 'create')).toBe(false);
  });

  it('bulkDelete, bulkCategorize, getTransactionsInRange, exportTransactionsCsv', async () => {
    expect((await transactions.bulkDeleteTransactions(USER, ['tx_1', 'tx_2'])).ok).toBe(true);
    handlers.set('category.findFirst', () => ({ ...ROWS.category, id: 'cat_resto' }));
    expect((await transactions.bulkCategorize(USER, ['tx_1', 'tx_2'], 'cat_resto')).ok).toBe(true);
    // Apprentissage en lot : un seul appel pour toute la sélection.
    expect(learnFromCorrections).toHaveBeenCalledTimes(1);
    expect(learnFromCorrection).not.toHaveBeenCalled();
    expect((await transactions.bulkCategorize(USER, ['tx_1'], null)).ok).toBe(true);
    expect(
      (
        await transactions.getTransactionsInRange(
          USER,
          { from: '2026-01-01', to: '2026-12-31' },
          { types: ['EXPENSE'] },
        )
      ).ok,
    ).toBe(true);
    const csv = await transactions.exportTransactionsCsv(USER, { from: '2026-01-01' });
    expect(csv.ok).toBe(true);
    if (csv.ok) expect(csv.value).toContain('CARREFOUR');
    expectAllScoped();
  });

  it('bulkCategorize : limité en débit (opération de masse), sans aucune requête', async () => {
    bulkRateLimited.mockReturnValueOnce({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'Trop d’opérations groupées.' },
    });
    const r = await transactions.bulkCategorize(USER, ['tx_1'], 'cat_resto');
    expect(!r.ok && r.error.code).toBe('RATE_LIMITED');
    expect(bulkRateLimited).toHaveBeenCalledWith(USER);
    expect(calls).toEqual([]);
  });

  it('période inversée : refus sans aucune requête', async () => {
    const r = await transactions.getTransactionsInRange(USER, {
      from: '2026-12-31',
      to: '2026-01-01',
    });
    expect(r.ok).toBe(false);
    const e = await transactions.exportTransactionsCsv(USER, {
      from: '2026-12-31',
      to: '2026-01-01',
    });
    expect(e.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it('le détecteur signale bien une requête non scopée (contrôle du test lui-même)', () => {
    calls.push({
      model: 'transaction',
      method: 'findMany',
      args: { where: { OR: [{ userId: USER }, { id: 'x' }] } },
    });
    calls.push({ model: 'transaction', method: 'update', args: { where: { id: 'x' }, data: {} } });
    calls.push({ model: 'budget', method: 'create', args: { data: { amount: 1 } } });
    expect(unscopedCalls(USER)).toHaveLength(3);
  });
});

describe('plafonds par utilisateur (création refusée au-delà, message clair)', () => {
  const cases = [
    {
      model: 'account',
      max: USER_LIMITS.accounts,
      create: () =>
        accounts.createAccount(USER, {
          name: 'Compte',
          type: 'BANK',
          initialBalance: 0,
          color: '#000000',
        }),
    },
    {
      model: 'category',
      max: USER_LIMITS.categories,
      create: () =>
        categories.createCategory(USER, {
          name: 'Nouvelle',
          kind: 'EXPENSE',
          group: 'WANTS',
          icon: 'Tag',
          color: '#000000',
        }),
    },
    {
      model: 'goal',
      max: USER_LIMITS.goals,
      create: () =>
        goals.createGoal(USER, {
          name: 'Objectif',
          targetAmount: 100_000,
          savedAmount: 0,
          icon: 'PiggyBank',
          color: '#000000',
        }),
    },
    {
      model: 'recurringRule',
      max: USER_LIMITS.recurringRules,
      create: () =>
        recurring.createRecurring(USER, {
          accountId: 'acc_1',
          type: 'EXPENSE',
          amount: 1000,
          label: 'Salle',
          frequency: 'MONTHLY',
          startDate: '2026-11-01',
          autoCreate: true,
        }),
    },
  ] as const;

  it.each(cases)('$model : refus à $max, création en dessous', async ({ model, max, create }) => {
    handlers.set('category.findFirst', () => null);
    handlers.set(`${model}.count`, () => max);
    const r = await create();
    expect(!r.ok && r.error.code).toBe('CONFLICT');
    expect(!r.ok && r.error.message).toContain(`maximum de ${max}`);
    expect(calls.some((c) => c.method === 'create')).toBe(false);
    expectAllScoped();

    handlers.set(`${model}.count`, () => max - 1);
    expect((await create()).ok).toBe(true);
  });

  it('updateRecurring : prochaine échéance de plus de 366 jours dans le passé → VALIDATION', async () => {
    const r = await recurring.updateRecurring(USER, 'rec_1', { nextDate: '2025-11-02' });
    expect(!r.ok && r.error.code).toBe('VALIDATION');
    expect(!r.ok && r.error.fieldErrors?.nextDate).toBeDefined();
    expect(calls).toEqual([]);
    expect((await recurring.updateRecurring(USER, 'rec_1', { nextDate: '2025-11-03' })).ok).toBe(
      true,
    );
  });
});
