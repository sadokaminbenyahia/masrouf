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
      return model === 'transaction' && method === 'findUnique' ? null : row;
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
vi.mock('@/server/services/ai.service', () => ({
  AUTO_CATEGORIZE_THRESHOLD: 0.55,
  predictCategory: vi.fn(async () => ({
    ok: true as const,
    value: { categoryId: 'cat_courses', confidence: 0.9, source: 'MODEL', alternatives: [] },
  })),
  learnFromCorrection,
}));

const budgets = await import('@/server/services/budgets.service');
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

/** Requêtes autorisées sans userId : vérification d'unicité de clé primaire (restauration). */
function isAllowedGlobal(c: PrismaCall): boolean {
  if (c.model !== 'transaction' || c.method !== 'findUnique' || !isRecord(c.args)) return false;
  const select = c.args.select;
  return isRecord(select) && Object.keys(select).join(',') === 'id';
}

function unscopedCalls(userId: string): PrismaCall[] {
  return calls.filter((c) => {
    if (isAllowedGlobal(c)) return false;
    const args = isRecord(c.args) ? c.args : {};
    if (c.method === 'create') {
      return !(isRecord(args.data) && args.data.userId === userId && nestedTagsScoped(args.data, userId));
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
    expect(create && isRecord(create.args) && isRecord(create.args.data) && create.args.data.categorySource).toBe('AI');
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
    handlers.set('category.findFirst', () => ({ ...ROWS.category, id: 'cat_resto', name: 'Restaurants' }));
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
    const restored = await transactions.restoreTransaction(USER, { ...del.value, recurringId: 'rec_1' });
    expect(restored.ok).toBe(true);
    expect((await transactions.duplicateTransaction(USER, 'tx_1')).ok).toBe(true);
    expectAllScoped();
    // La seule requête non scopée est la vérification d'unicité de la clé primaire.
    expect(calls.filter(isAllowedGlobal)).toHaveLength(1);
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
    expect((await transactions.bulkCategorize(USER, ['tx_1'], 'cat_resto')).ok).toBe(true);
    expect((await transactions.bulkCategorize(USER, ['tx_1'], null)).ok).toBe(true);
    expect(
      (await transactions.getTransactionsInRange(USER, { from: '2026-01-01', to: '2026-12-31' }, { types: ['EXPENSE'] })).ok,
    ).toBe(true);
    const csv = await transactions.exportTransactionsCsv(USER, { from: '2026-01-01' });
    expect(csv.ok).toBe(true);
    if (csv.ok) expect(csv.value).toContain('CARREFOUR');
    expectAllScoped();
  });

  it('période inversée : refus sans aucune requête', async () => {
    const r = await transactions.getTransactionsInRange(USER, { from: '2026-12-31', to: '2026-01-01' });
    expect(r.ok).toBe(false);
    const e = await transactions.exportTransactionsCsv(USER, { from: '2026-12-31', to: '2026-01-01' });
    expect(e.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it('le détecteur signale bien une requête non scopée (contrôle du test lui-même)', () => {
    calls.push({ model: 'transaction', method: 'findMany', args: { where: { OR: [{ userId: USER }, { id: 'x' }] } } });
    calls.push({ model: 'transaction', method: 'update', args: { where: { id: 'x' }, data: {} } });
    calls.push({ model: 'budget', method: 'create', args: { data: { amount: 1 } } });
    expect(unscopedCalls(USER)).toHaveLength(3);
  });
});
