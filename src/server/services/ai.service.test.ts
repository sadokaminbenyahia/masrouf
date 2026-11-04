import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category } from '@/domain/types';

const store = new Map<string, { version: number; data: string; updatedAt: Date }>();
const saveAiModel = vi.fn(async (userId: string, _kind: string, version: number, data: string) => {
  store.set(userId, { version, data, updatedAt: new Date(0) });
});

vi.mock('@/server/repositories/ai-model.repo', () => ({
  loadAiModel: vi.fn(async (userId: string) => store.get(userId) ?? null),
  saveAiModel,
}));
vi.mock('@/server/repositories/ai-data.repo', () => ({
  listTrainingSamples: vi.fn(async () => [
    { label: 'Carrefour Lac', amount: 50_000, type: 'EXPENSE', categoryId: 'c_courses' },
    { label: 'Carrefour Marsa', amount: 70_000, type: 'EXPENSE', categoryId: 'c_courses' },
  ]),
  listAiTransactions: vi.fn(async () => []),
}));
vi.mock('@/server/repositories/dismissed.repo', () => ({
  listDismissedKeys: vi.fn(async () => []),
  addDismissedKey: vi.fn(async () => undefined),
}));
vi.mock('@/server/clock', () => ({ today: () => '2026-11-04' }));

const categories: Category[] = [
  {
    id: 'c_courses',
    name: 'Courses',
    kind: 'EXPENSE',
    group: 'NEEDS',
    icon: 'ShoppingCart',
    color: '#000000',
    sortOrder: 0,
  },
  {
    id: 'c_resto',
    name: 'Restaurants',
    kind: 'EXPENSE',
    group: 'WANTS',
    icon: 'UtensilsCrossed',
    color: '#000000',
    sortOrder: 1,
  },
  {
    id: 'c_sal',
    name: 'Salaire',
    kind: 'INCOME',
    group: 'INCOME',
    icon: 'Banknote',
    color: '#000000',
    sortOrder: 2,
  },
];
vi.mock('./categories.service', () => ({
  listCategories: vi.fn(async () => ({ ok: true, value: categories })),
}));
vi.mock('./accounts.service', () => ({
  listAccounts: vi.fn(async () => ({
    ok: true,
    value: [
      {
        id: 'a1',
        name: 'Espèces',
        type: 'CASH',
        initialBalance: 0,
        color: '#000000',
        archived: false,
        sortOrder: 0,
        balance: 100_000,
        transactionCount: 0,
      },
    ],
  })),
}));
vi.mock('./recurring.service', () => ({
  listRecurring: vi.fn(async () => ({ ok: true, value: [] })),
}));
vi.mock('./goals.service', () => ({ listGoals: vi.fn(async () => ({ ok: true, value: [] })) }));
vi.mock('./budgets.service', () => ({
  listBudgetProgress: vi.fn(async () => ({ ok: true, value: [] })),
}));
vi.mock('./finance-tools', () => ({ createFinanceTools: vi.fn(() => ({})) }));

const ai = await import('./ai.service');
const { aiLimiter } = await import('@/server/security/rate-limit');

describe('ai.service', () => {
  beforeEach(() => {
    store.clear();
    saveAiModel.mockClear();
  });

  it('entraîne paresseusement, sauvegarde, puis sert depuis le cache', async () => {
    const r = await ai.predictCategory('u1', {
      label: 'CARREFOUR ENNASR',
      amount: 60_000,
      type: 'EXPENSE',
    });
    expect(r.ok && r.value?.categoryId).toBe('c_courses');
    expect(saveAiModel).toHaveBeenCalledTimes(1);
    await ai.predictCategories('u1', [{ label: 'Pizza', amount: 20_000, type: 'EXPENSE' }]);
    expect(saveAiModel).toHaveBeenCalledTimes(1);
  });

  it('une correction est apprise et persistée', async () => {
    const sample = {
      label: 'Carrefour Lac',
      amount: 50_000,
      type: 'EXPENSE' as const,
      categoryId: 'c_resto',
    };
    expect((await ai.learnFromCorrection('u2', sample, 'c_courses')).ok).toBe(true);
    const r = await ai.predictCategory('u2', {
      label: 'Carrefour Lac',
      amount: 50_000,
      type: 'EXPENSE',
    });
    expect(r.ok && r.value).toMatchObject({ categoryId: 'c_resto', source: 'MERCHANT' });
    // Un réentraînement conserve la table marchand issue des corrections.
    expect((await ai.retrainCategorizer('u2')).ok).toBe(true);
    const again = await ai.predictCategory('u2', {
      label: 'Carrefour Lac',
      amount: 50_000,
      type: 'EXPENSE',
    });
    expect(again.ok && again.value?.source).toBe('MERCHANT');
  });

  it('réentraîne un modèle persisté invalide', async () => {
    store.set('u3', { version: 1, data: '{"version":1}', updatedAt: new Date(0) });
    const r = await ai.predictCategory('u3', { label: 'Carrefour', amount: 1000, type: 'EXPENSE' });
    expect(r.ok).toBe(true);
    expect(saveAiModel).toHaveBeenCalledTimes(1);
  });

  it('virement : aucune prédiction', async () => {
    const r = await ai.predictCategory('u1', { label: 'Retrait', amount: 1000, type: 'TRANSFER' });
    expect(r).toEqual({ ok: true, value: null });
  });

  it('saisie naturelle validée, puis limitée en débit', async () => {
    const r = await ai.parseNaturalEntry('u4', 'café 3,500 hier en espèces');
    expect(r.ok && r.value).toMatchObject({
      ok: true,
      entry: { amount: 3500, accountId: 'a1', date: '2026-11-03' },
    });
    for (let i = 0; i < 100; i++) aiLimiter.check('ai:u5');
    const limited = await ai.parseNaturalEntry('u5', 'café 3');
    expect(!limited.ok && limited.error.code).toBe('RATE_LIMITED');
  });

  it('prévision, anomalies et suggestions sur un historique vide', async () => {
    const f = await ai.getForecast('u6');
    expect(f.ok && f.value.endOfMonth.expected).toBe(100_000);
    expect(await ai.getAnomalies('u6')).toEqual({ ok: true, value: [] });
    expect(await ai.getRecurringSuggestions('u6')).toEqual({ ok: true, value: [] });
    expect(await ai.getBudgetSuggestions('u6')).toEqual({ ok: true, value: [] });
    expect(await ai.dismissInsight('u6', 'anomaly:x')).toEqual({ ok: true, value: undefined });
  });

  it('simulateur : objectif introuvable → NOT_FOUND', async () => {
    const r = await ai.simulateWhatIf('u7', {
      goalId: 'g1',
      adjustments: [],
      extraMonthlySaving: 0,
    });
    expect(!r.ok && r.error.code).toBe('NOT_FOUND');
  });
});
