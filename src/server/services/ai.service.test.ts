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
const dismissedKeys: string[] = [];
const addDismissedKey = vi.fn(async (_userId: string, key: string) => {
  dismissedKeys.push(key);
});
vi.mock('@/server/repositories/dismissed.repo', () => ({
  listDismissedKeys: vi.fn(async () => [...dismissedKeys]),
  addDismissedKey,
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
const failing = async (): Promise<never> => {
  throw new Error('base indisponible');
};
vi.mock('./finance-tools', () => ({
  createFinanceTools: vi.fn(() => ({
    sumTransactions: failing,
    breakdownByCategory: failing,
    monthlyTotals: failing,
    listTransactions: failing,
    topMerchants: failing,
    budgetStatus: failing,
    goals: failing,
    balances: failing,
    forecast: failing,
    recurring: failing,
  })),
}));

const ai = await import('./ai.service');
const { aiLimiter } = await import('@/server/security/rate-limit');

describe('ai.service', () => {
  beforeEach(() => {
    store.clear();
    saveAiModel.mockClear();
    addDismissedKey.mockClear();
    dismissedKeys.length = 0;
    vi.restoreAllMocks();
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

  it('corrections en lot : modèle chargé une fois, persisté UNE fois', async () => {
    await ai.predictCategory('u10', { label: 'Carrefour', amount: 1000, type: 'EXPENSE' });
    saveAiModel.mockClear();
    const transfer = {
      sample: {
        label: 'Retrait DAB',
        amount: 20_000,
        type: 'TRANSFER' as const,
        categoryId: 'c_resto',
      },
      previousCategoryId: null,
    };
    const items = ['Pizzeria Roma', 'Chez Slah', 'Retrait DAB'].map((label, i) => ({
      sample: {
        label,
        amount: 20_000,
        type: i === 2 ? ('TRANSFER' as const) : ('EXPENSE' as const),
        categoryId: 'c_resto',
      },
      previousCategoryId: 'c_courses',
    }));
    expect(await ai.learnFromCorrections('u10', items)).toEqual({ ok: true, value: undefined });
    expect(saveAiModel).toHaveBeenCalledTimes(1);
    for (const label of ['Pizzeria Roma', 'Chez Slah']) {
      const r = await ai.predictCategory('u10', { label, amount: 20_000, type: 'EXPENSE' });
      expect(r.ok && r.value).toMatchObject({ categoryId: 'c_resto', source: 'MERCHANT' });
    }
    // Lot vide ou uniquement des virements : aucune écriture.
    expect((await ai.learnFromCorrections('u10', [])).ok).toBe(true);
    expect((await ai.learnFromCorrections('u10', [transfer])).ok).toBe(true);
    expect(saveAiModel).toHaveBeenCalledTimes(1);
  });

  it('modèle stocké illisible (JSON) : journalisé puis réentraîné', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    store.set('u11', { version: 1, data: '{pas du json', updatedAt: new Date(0) });
    const r = await ai.predictCategory('u11', {
      label: 'Carrefour',
      amount: 1000,
      type: 'EXPENSE',
    });
    expect(r.ok).toBe(true);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('illisible'))).toBe(true);
    expect(saveAiModel).toHaveBeenCalledTimes(1);
  });

  it('aperçu d’import (prédictions en lot) : limité en débit (clé ai:bulk)', async () => {
    for (let i = 0; i < 100; i++) aiLimiter.check('ai:bulk:u12');
    const r = await ai.predictCategories('u12', [{ label: 'x', amount: 1, type: 'EXPENSE' }]);
    expect(!r.ok && r.error.code).toBe('RATE_LIMITED');
    expect(ai.bulkRateLimited('u12')?.ok).toBe(false);
    // L'assistant a sa propre clé : il n'est pas bloqué par les opérations de masse.
    expect(aiLimiter.check('ai:u12').allowed).toBe(true);
    expect(await ai.predictCategories('u12', [])).toEqual({ ok: true, value: [] });
  });

  it('dismissInsight : clé déjà masquée idempotente, plafond de 1 000 clés', async () => {
    expect((await ai.dismissInsight('u13', 'anomaly:a')).ok).toBe(true);
    expect((await ai.dismissInsight('u13', 'anomaly:a')).ok).toBe(true);
    expect(addDismissedKey).toHaveBeenCalledTimes(1);
    for (let i = dismissedKeys.length; i < ai.MAX_DISMISSED_KEYS; i++) dismissedKeys.push(`k${i}`);
    const r = await ai.dismissInsight('u13', 'anomaly:b');
    expect(!r.ok && r.error.code).toBe('VALIDATION');
    expect(!r.ok && r.error.message).toMatch(/1000|1 000/);
    expect(addDismissedKey).toHaveBeenCalledTimes(1);
    // Une clé déjà présente reste acceptée au plafond.
    expect((await ai.dismissInsight('u13', 'anomaly:a')).ok).toBe(true);
  });

  it('assistant : l’échec d’un outil est journalisé, la réponse reste une excuse sans chiffre', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await ai.askAssistant('u14', 'quel est mon solde ?');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.understood).toBe(true);
      expect(r.value.text).not.toMatch(/\d/);
    }
    expect(
      error.mock.calls.some((c) =>
        String(c[0]).includes('outil de l’assistant en échec (balances)'),
      ),
    ).toBe(true);
  });
});
