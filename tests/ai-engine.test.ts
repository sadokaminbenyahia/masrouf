// Moteur IA de bout en bout, via l'interface unique AIEngine (createLocalAIEngine), sur un
// historique synthétique déterministe de 6 mois. Les sorties sont aussi validées par les
// schémas Zod de sortie utilisés par ai.service (src/server/ai/output-schemas.ts).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLocalAIEngine } from '@/domain/ai/local-engine';
import type { AIEngine } from '@/domain/ai/engine';
import type {
  AiTransaction,
  AnomalyInput,
  AssistantContext,
  ForecastInput,
  HealthInput,
  MonthlySummaryInput,
  ParseEntryContext,
  TrainingSample,
  WhatIfInput,
} from '@/domain/ai/types';
import { categoryId } from '@/domain/ai/__fixtures__/categories';
import { addDays, lastMonths, listMonths, monthEnd } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import { merchantKey } from '@/domain/ai/text';
import {
  anomaliesSchema,
  assistantAnswerSchema,
  balanceForecastSchema,
  budgetSuggestionsSchema,
  categorizerModelSchema,
  healthScoreSchema,
  monthlySummarySchema,
  nullablePredictionSchema,
  parseEntryResultSchema,
  recurringCandidatesSchema,
  whatIfResultSchema,
} from '@/server/ai/output-schemas';
import {
  CATEGORIES,
  RULES,
  TODAY,
  budgetProgress,
  fakeTools,
  goalProgress,
  monthlyTotals,
  numericLeaves,
  sumWhere,
  syntheticHistory,
} from './helpers/finance-fixtures';

const engine: AIEngine = createLocalAIEngine();
const history = syntheticHistory();
const SPLIT = '2026-09-15';

const toSample = (t: AiTransaction): TrainingSample | null =>
  t.type === 'TRANSFER' || t.categoryId === null
    ? null
    : { label: t.label, amount: t.amount, type: t.type, categoryId: t.categoryId };
const trainSet = history
  .filter((t) => t.date < SPLIT)
  .flatMap((t) => toSample(t) ?? []);
const testSet = history
  .filter((t) => t.date >= SPLIT)
  .flatMap((t) => toSample(t) ?? []);
const model = engine.trainCategorizer(trainSet);

const ACCOUNTS = [
  { id: 'acc_cash', name: 'Portefeuille', type: 'CASH' },
  { id: 'acc_bank', name: 'BIAT', type: 'BANK' },
  { id: 'acc_card', name: 'Visa BIAT', type: 'CARD' },
];
const parseCtx: ParseEntryContext = { today: TODAY, categories: CATEGORIES, accounts: ACCOUNTS, model };

describe('catégorisation (trainCategorizer → categorize → learnCorrection)', () => {
  it('le jeu synthétique est réaliste et séparé en apprentissage / test', () => {
    expect(history.length).toBeGreaterThan(300);
    expect(trainSet.length).toBeGreaterThan(200);
    expect(testSet.length).toBeGreaterThan(80);
    expect(categorizerModelSchema.safeParse(model).success).toBe(true);
    expect(model.sampleCount).toBe(trainSet.length);
  });

  it('exactitude ≥ 0,85 sur le jeu de test séparé (libellés bruités jamais vus)', () => {
    let correct = 0;
    for (const s of testSet) {
      const p = engine.categorize(model, s, CATEGORIES);
      expect(nullablePredictionSchema.safeParse(p).success).toBe(true);
      if (p?.categoryId === s.categoryId) correct++;
    }
    const accuracy = correct / testSet.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.85);
  });

  it('les prédictions respectent le sens (dépense → catégorie de dépense)', () => {
    const kinds = new Map(CATEGORIES.map((c) => [c.id, c.kind]));
    for (const s of testSet.slice(0, 80)) {
      const p = engine.categorize(model, s, CATEGORIES);
      if (p) expect(kinds.get(p.categoryId)).toBe(s.type);
    }
  });

  it('learnCorrection change la prédiction suivante, sans muter le modèle d’origine', () => {
    const input = { label: 'PAIEMENT CB CARREFOUR LA MARSA', amount: 89_000, type: 'EXPENSE' as const };
    const before = engine.categorize(model, input, CATEGORIES);
    expect(before?.categoryId).toBe(categoryId('Courses'));
    const frozen = JSON.stringify(model);
    const corrected = engine.learnCorrection(
      model,
      { ...input, categoryId: categoryId('Famille & cadeaux') },
      before?.categoryId ?? null,
    );
    expect(JSON.stringify(model)).toBe(frozen);
    const after = engine.categorize(corrected, input, CATEGORIES);
    expect(after?.categoryId).toBe(categoryId('Famille & cadeaux'));
    expect(after?.source).toBe('MERCHANT');
    // Même marchand, autre ville / référence : la correction s'applique aussi.
    const again = engine.categorize(
      corrected,
      { label: 'CARREFOUR 123456', amount: 40_000, type: 'EXPENSE' },
      CATEGORIES,
    );
    expect(again?.categoryId).toBe(categoryId('Famille & cadeaux'));
  });

  it('démarrage à froid (modèle null) : règles par mots-clés', () => {
    const p = engine.categorize(null, { label: 'Pharmacie Ennasr', amount: 12_000, type: 'EXPENSE' }, CATEGORIES);
    expect(p?.categoryId).toBe(categoryId('Santé'));
    expect(p?.source).toBe('RULE');
    expect(engine.categorize(null, { label: 'zzqx', amount: 1, type: 'EXPENSE' }, CATEGORIES)).toBeNull();
    expect(engine.categorize(model, { label: 'CARREFOUR', amount: 1, type: 'EXPENSE' }, [])).toBeNull();
  });
});

describe('parseEntry : saisie en langage naturel', () => {
  const cases: [string, Partial<{ amount: number; date: string; type: string; category: string; accountId: string }>][] = [
    ['café 3,500 hier', { amount: 3500, date: '2026-11-03', type: 'EXPENSE', category: 'Cafés' }],
    ['salaire 2400 le 1er', { amount: 2_400_000, date: '2026-11-01', type: 'INCOME', category: 'Salaire' }],
    ['taxi 7 dt en espèces', { amount: 7000, date: TODAY, type: 'EXPENSE', category: 'Transport', accountId: 'acc_cash' }],
    ['courses carrefour 87,250 avant-hier', { amount: 87_250, date: '2026-11-02', category: 'Courses' }],
    ['pizza hut 32.5 par carte', { amount: 32_500, category: 'Restaurants', accountId: 'acc_card' }],
    ['500 millimes pain', { amount: 500 }],
    ['+150 remboursement ami il y a 3 jours', { amount: 150_000, type: 'INCOME', date: '2026-11-01' }],
    ['loyer 750 le 3', { amount: 750_000, date: '2026-11-03', category: 'Loyer' }],
    ['essence agil 60 dt lundi', { amount: 60_000, date: '2026-11-02', category: 'Carburant' }],
    ['pharmacie 1 234,5 le 12/10', { amount: 1_234_500, date: '2026-10-12', category: 'Santé' }],
  ];

  it.each(cases)('« %s »', (text, expected) => {
    const r = engine.parseEntry(text, parseCtx);
    expect(parseEntryResultSchema.safeParse(r).success).toBe(true);
    if (!r.ok) throw new Error(r.message);
    const e = r.entry;
    expect(Number.isSafeInteger(e.amount)).toBe(true);
    if (expected.amount !== undefined) expect(e.amount).toBe(expected.amount);
    if (expected.date !== undefined) expect(e.date).toBe(expected.date);
    if (expected.type !== undefined) expect(e.type).toBe(expected.type);
    if (expected.category !== undefined) expect(e.categoryId).toBe(categoryId(expected.category));
    if (expected.accountId !== undefined) expect(e.accountId).toBe(expected.accountId);
    expect(e.label.length).toBeGreaterThan(0);
  });

  it('sans montant : refus explicite avec exemples', () => {
    const r = engine.parseEntry('café hier', parseCtx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.examples.length).toBeGreaterThan(0);
    expect(engine.parseEntry('', parseCtx).ok).toBe(false);
  });

  it('montant énorme et date ancienne : avertissements', () => {
    const r = engine.parseEntry('voiture 45000 le 12/01', parseCtx);
    if (!r.ok) throw new Error(r.message);
    expect(r.entry.warnings).toHaveLength(2);
  });
});

/** Historique + anomalies injectées : restaurant 480 DT, courses en double, Netflix en hausse. */
function dirty(): { txs: AiTransaction[]; unusualId: string; dupIds: string[]; netflixKey: string } {
  const base = history.map((t) =>
    t.label === 'NETFLIX.COM' && t.date === '2026-10-15' ? { ...t, amount: 42_000 } : t,
  );
  const unusual: AiTransaction = {
    id: 'inj_unusual',
    date: '2026-10-28',
    amount: 480_000,
    type: 'EXPENSE',
    label: 'RESTAURANT DAR EL JELD',
    categoryId: categoryId('Restaurants'),
    accountId: 'acc_bank',
    recurringId: null,
  };
  const source = base.find(
    (t) => t.categoryId === categoryId('Courses') && t.date >= '2026-10-20' && t.amount >= 10_000,
  );
  if (!source) throw new Error('aucune course à dupliquer');
  const dup: AiTransaction = { ...source, id: 'inj_dup', date: addDays(source.date, 1) };
  return {
    txs: [...base, unusual, dup],
    unusualId: unusual.id,
    dupIds: [source.id, dup.id].sort(),
    netflixKey: `anomaly:price:${merchantKey('NETFLIX.COM')}:2026-10`,
  };
}

describe('detectAnomalies et detectRecurring', () => {
  const d = dirty();
  const input: AnomalyInput = {
    today: TODAY,
    transactions: d.txs,
    categories: CATEGORIES,
    recurring: RULES,
    dismissedKeys: [],
  };

  it('retrouve les trois anomalies injectées', () => {
    const anomalies = engine.detectAnomalies(input);
    expect(anomaliesSchema.safeParse(anomalies).success).toBe(true);
    const keys = anomalies.map((a) => a.key);
    expect(keys).toContain(`anomaly:unusual:${d.unusualId}`);
    expect(keys).toContain(`anomaly:duplicate:${d.dupIds.join(':')}`);
    expect(keys).toContain(d.netflixKey);
    const price = anomalies.find((a) => a.key === d.netflixKey);
    expect(price?.expectedAmount).toBe(39_000);
    expect(price?.actualAmount).toBe(42_000);
    expect(price?.severity).toBe('INFO');
    // Tri : date décroissante.
    const dates = anomalies.map((a) => a.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('l’historique propre ne contient aucune de ces anomalies, et « ignorer » les masque', () => {
    const clean = engine.detectAnomalies({ ...input, transactions: history });
    expect(clean.map((a) => a.key)).not.toContain(d.netflixKey);
    expect(clean.some((a) => a.key.includes('inj_'))).toBe(false);
    const all = engine.detectAnomalies(input);
    const dismissed = engine.detectAnomalies({ ...input, dismissedKeys: all.map((a) => a.key) });
    expect(dismissed).toEqual([]);
  });

  it('detectRecurring suggère Ooredoo et Netflix, jamais le salaire ni le loyer déclarés', () => {
    const candidates = engine.detectRecurring({ today: TODAY, transactions: history, existing: RULES });
    expect(recurringCandidatesSchema.safeParse(candidates).success).toBe(true);
    const keys = candidates.map((c) => c.merchantKey);
    expect(keys).toContain(merchantKey('OOREDOO INTERNET FIBRE'));
    expect(keys).toContain(merchantKey('NETFLIX.COM'));
    expect(candidates.some((c) => /salaire|loyer/i.test(c.label))).toBe(false);
    for (const c of candidates) {
      expect(c.nextDate >= TODAY).toBe(true);
      expect(c.confidence).toBeGreaterThan(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe('forecastBalance, suggestBudgets', () => {
  const input: ForecastInput = { today: TODAY, currentBalance: 3_371_250, history, recurring: RULES };

  it('low ≤ expected ≤ high, entiers, 6 mois + courant + 3 prévus', () => {
    const f = engine.forecastBalance(input);
    expect(balanceForecastSchema.safeParse(f).success).toBe(true);
    for (const p of [f.endOfMonth, ...f.months]) {
      expect(p.low).toBeLessThanOrEqual(p.expected);
      expect(p.expected).toBeLessThanOrEqual(p.high);
      for (const v of [p.low, p.expected, p.high]) expect(Number.isSafeInteger(v)).toBe(true);
    }
    expect(f.endOfMonth.date).toBe(monthEnd('2026-11'));
    expect(f.months).toHaveLength(3);
    expect(f.chart.length).toBe(10);
    expect(['MEDIUM', 'HIGH']).toContain(f.reliability);
    // Le salaire de décembre (récurrence) relève la prévision du mois suivant.
    expect(f.months[0]?.expected ?? 0).toBeGreaterThan(f.endOfMonth.expected);
  });

  it('historique vide : fiabilité LOW, aucune exception', () => {
    const f = engine.forecastBalance({ ...input, history: [] });
    expect(f.reliability).toBe('LOW');
    expect(balanceForecastSchema.safeParse(f).success).toBe(true);
  });

  it('suggestBudgets : catégories de dépense uniquement, montants arrondis', () => {
    const list = engine.suggestBudgets({ today: TODAY, transactions: history, categories: CATEGORIES, monthlyIncome: 2_600_000 });
    expect(budgetSuggestionsSchema.safeParse(list).success).toBe(true);
    expect(list.length).toBeGreaterThan(3);
    const kinds = new Map(CATEGORIES.map((c) => [c.id, c.kind]));
    for (const s of list) expect(kinds.get(s.categoryId)).toBe('EXPENSE');
  });
});

describe('ask() avec un FinanceTools factice', () => {
  const ctx: AssistantContext = {
    today: TODAY,
    categories: CATEGORIES,
    accounts: [
      { id: 'acc_bank', name: 'BIAT' },
      { id: 'acc_cash', name: 'Espèces' },
    ],
    goals: [{ id: 'g1', name: 'Voyage à Djerba' }],
  };
  const restoId = categoryId('Restaurants');
  const restoOctober = sumWhere(
    history,
    (t) => t.categoryId === restoId && t.date >= '2026-10-01' && t.date <= '2026-10-31',
  );

  it('question comprise : les chiffres viennent des outils', async () => {
    const tools = fakeTools({ txs: history });
    const a = await engine.ask('Combien j’ai dépensé en restaurants le mois dernier ?', ctx, tools);
    expect(assistantAnswerSchema.safeParse(a).success).toBe(true);
    expect(a.understood).toBe(true);
    expect(a.intent).toBe('SPENDING_TOTAL');
    expect(a.period).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
    expect(restoOctober).toBeGreaterThan(0);
    expect(a.text).toContain(formatMoney(restoOctober));
    expect(a.highlights.some((h) => h.value === restoOctober)).toBe(true);
    const sum = tools.calls.find((c) => c.name === 'sumTransactions');
    expect(sum?.arg).toMatchObject({ categoryIds: [restoId], type: 'EXPENSE' });
  });

  it('solde : total des comptes fourni par balances()', async () => {
    const tools = fakeTools({ txs: history });
    const a = await engine.ask('quel est mon solde ?', ctx, tools);
    expect(a.intent).toBe('BALANCE');
    expect(a.text).toContain(formatMoney(3_371_250));
    expect(tools.calls.map((c) => c.name)).toContain('balances');
  });

  it('les chiffres SUIVENT les outils (pas de valeur codée en dur)', async () => {
    const tools = fakeTools({
      txs: history,
      balances: [{ id: 'acc_bank', name: 'BIAT', balance: 123_456 }],
    });
    const a = await engine.ask('quel est mon solde ?', ctx, tools);
    expect(a.text).toContain(formatMoney(123_456));
    expect(a.text).not.toContain(formatMoney(3_371_250));
  });

  it('plus grosse dépense, top catégories, capacité d’achat', async () => {
    const tools = fakeTools({ txs: history });
    const biggest = await engine.ask('ma plus grosse dépense le mois dernier', ctx, tools);
    expect(biggest.intent).toBe('BIGGEST_EXPENSE');
    const octMax = Math.max(
      ...history.filter((t) => t.type === 'EXPENSE' && t.date.startsWith('2026-10')).map((t) => t.amount),
    );
    expect(biggest.text).toContain(formatMoney(octMax));
    const top = await engine.ask('où part mon argent ce trimestre ?', ctx, tools);
    expect(top.intent).toBe('TOP_CATEGORIES');
    expect(top.chart?.data.length ?? 0).toBeGreaterThan(0);
    for (const p of top.chart?.data ?? []) expect(Number.isSafeInteger(p.value)).toBe(true);
    const afford = await engine.ask('je peux acheter un téléphone à 900 dinars ?', ctx, tools);
    expect(afford.intent).toBe('CAN_AFFORD');
    expect(tools.calls.map((c) => c.name)).toContain('forecast');
  });

  it('question incomprise : suggestions, aucun appel d’outil', async () => {
    const tools = fakeTools({ txs: history });
    const a = await engine.ask('quelle est la couleur du ciel sur Mars', ctx, tools);
    expect(a.understood).toBe(false);
    expect(a.intent).toBe('UNKNOWN');
    expect(a.suggestions.length).toBeGreaterThanOrEqual(3);
    expect(a.suggestions.length).toBeLessThanOrEqual(4);
    expect(tools.calls).toEqual([]);
    expect(assistantAnswerSchema.safeParse(a).success).toBe(true);
  });

  it('outil en panne : réponse d’excuse sans chiffre, jamais d’exception', async () => {
    const tools = fakeTools({ txs: history });
    const broken = {
      ...tools,
      sumTransactions: async () => {
        throw new Error('base indisponible');
      },
    };
    const a = await engine.ask('combien j’ai dépensé ce mois ?', ctx, broken);
    expect(a.understood).toBe(true);
    expect(a.highlights).toEqual([]);
    expect(a.text).not.toMatch(/\d/);
  });

  it('exampleQuestions : copie défensive, toutes comprises', async () => {
    const q = engine.exampleQuestions();
    q.push('modifié');
    expect(engine.exampleQuestions()).not.toContain('modifié');
    for (const question of engine.exampleQuestions()) {
      const a = await engine.ask(question, ctx, fakeTools({ txs: history }));
      expect(a.understood, question).toBe(true);
    }
  });
});

const goals = [
  goalProgress({
    id: 'g1',
    name: 'Voyage à Djerba',
    targetAmount: 3_000_000,
    savedAmount: 900_000,
    targetDate: '2027-03-31',
    monthlyNeeded: 420_000,
    status: 'AT_RISK',
  }),
];
const summaryInput: MonthlySummaryInput = {
  month: '2026-10',
  today: TODAY,
  transactions: history.filter((t) => t.date >= '2026-07-01' && t.date <= '2026-10-31'),
  categories: CATEGORIES,
  budgets: [budgetProgress('Restaurants', 100_000, 260_000, '2026-10')],
  goals,
  seed: 'user_1',
};
const months = listMonths('2026-05', '2026-11');
const restoMonthly = Math.round(
  sumWhere(history, (t) => t.categoryId === categoryId('Restaurants') && t.date < '2026-11-01') / 6,
);
const whatIf: WhatIfInput = {
  today: TODAY,
  goal: { id: 'g1', name: 'Voyage à Djerba', targetAmount: 30_000_000, savedAmount: 900_000, targetDate: null },
  monthly: monthlyTotals(history, months),
  categorySpending: [{ categoryId: categoryId('Restaurants'), name: 'Restaurants', monthlyAverage: restoMonthly }],
  adjustments: [{ categoryId: categoryId('Restaurants'), percent: 50 }],
  extraMonthlySaving: 0,
};
const healthInput: HealthInput = {
  today: TODAY,
  monthly: monthlyTotals(history, lastMonths(TODAY, 7)),
  totalBalance: 3_371_250,
  fixedMonthlyCharges: 834_000,
  groupSpending: { needs: 1_500_000, wants: 400_000, savings: 0 },
  budgets: summaryInput.budgets,
  goals,
};

describe('monthlySummary, simulateWhatIf, healthScore', () => {
  it('monthlySummary : 3 recommandations distinctes, chiffrées en entiers', () => {
    const s = engine.monthlySummary(summaryInput);
    expect(monthlySummarySchema.safeParse(s).success).toBe(true);
    expect(s.month).toBe('2026-10');
    expect(s.recommendations).toHaveLength(3);
    expect(new Set(s.recommendations.map((r) => r.title)).size).toBe(3);
    for (const r of s.recommendations) {
      if (r.impact !== null) expect(Number.isSafeInteger(r.impact)).toBe(true);
    }
    expect(s.paragraphs.length).toBeGreaterThan(1);
    const expense = sumWhere(summaryInput.transactions, (t) => t.type === 'EXPENSE' && t.date.startsWith('2026-10'));
    expect(s.highlights.find((h) => h.label === 'Dépenses')?.value).toBe(expense);
  });

  it('simulateWhatIf : réduire les restaurants fait gagner des mois', () => {
    const r = engine.simulateWhatIf(whatIf);
    expect(whatIfResultSchema.safeParse(r).success).toBe(true);
    expect(r.scenarioMonthlySaving - r.baselineMonthlySaving).toBe(Math.round(restoMonthly / 2));
    expect(r.baselineDate).not.toBeNull();
    expect(r.scenarioDate).not.toBeNull();
    expect((r.scenarioDate ?? '') <= (r.baselineDate ?? '')).toBe(true);
    expect(r.monthsSaved ?? -1).toBeGreaterThanOrEqual(0);
    expect(r.message).toContain('Voyage à Djerba');
    // La timeline est cumulative et croissante quand l'épargne est positive.
    for (let i = 1; i < r.timeline.length; i++) {
      expect(r.timeline[i]?.scenario ?? 0).toBeGreaterThanOrEqual(r.timeline[i - 1]?.scenario ?? 0);
    }
  });

  it('healthScore : entier dans 0..100, note cohérente', () => {
    const h = engine.healthScore(healthInput);
    expect(healthScoreSchema.safeParse(h).success).toBe(true);
    expect(Number.isInteger(h.score)).toBe(true);
    expect(h.score).toBeGreaterThanOrEqual(0);
    expect(h.score).toBeLessThanOrEqual(100);
    const grade = h.score >= 80 ? 'EXCELLENT' : h.score >= 60 ? 'BON' : h.score >= 40 ? 'MOYEN' : 'FRAGILE';
    expect(h.grade).toBe(grade);
    expect(h.topAdvice.length).toBeGreaterThan(0);
  });
});

describe('déterminisme', () => {
  const runAll = async (e: AIEngine) => {
    const m = e.trainCategorizer(trainSet);
    const ctx: AssistantContext = { today: TODAY, categories: CATEGORIES, accounts: [], goals: [] };
    return {
      model: m,
      corrected: e.learnCorrection(m, { label: 'KFC', amount: 20_000, type: 'EXPENSE', categoryId: categoryId('Cafés') }, null),
      predictions: testSet.slice(0, 50).map((s) => e.categorize(m, s, CATEGORIES)),
      entries: ['café 3,500 hier', 'salaire 2400 le 1er', 'taxi 7 dt en espèces'].map((t) =>
        e.parseEntry(t, { ...parseCtx, model: m }),
      ),
      anomalies: e.detectAnomalies({ today: TODAY, transactions: dirty().txs, categories: CATEGORIES, recurring: RULES, dismissedKeys: [] }),
      recurring: e.detectRecurring({ today: TODAY, transactions: history, existing: [] }),
      forecast: e.forecastBalance({ today: TODAY, currentBalance: 1_000_000, history, recurring: RULES }),
      budgets: e.suggestBudgets({ today: TODAY, transactions: history, categories: CATEGORIES, monthlyIncome: null }),
      answers: await Promise.all(
        ['combien j’ai dépensé ce mois ?', 'mes abonnements', 'n’importe quoi'].map((q) =>
          e.ask(q, ctx, fakeTools({ txs: history })),
        ),
      ),
      summary: e.monthlySummary(summaryInput),
      whatIf: e.simulateWhatIf(whatIf),
      health: e.healthScore(healthInput),
    };
  };

  it('deux appels identiques (et deux instances) donnent des sorties identiques', async () => {
    const a = await runAll(engine);
    const b = await runAll(engine);
    const c = await runAll(createLocalAIEngine());
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
    for (const leaf of numericLeaves(a)) expect(Number.isFinite(leaf.value), leaf.path).toBe(true);
    // Un historique synthétique régénéré avec la même graine est identique.
    expect(syntheticHistory()).toEqual(history);
  });

  it('le résumé varie avec la graine mais pas d’un appel à l’autre', () => {
    const titles = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((seed) => engine.monthlySummary({ ...summaryInput, seed }).paragraphs.join('|')),
    );
    expect(titles.size).toBeGreaterThan(1);
  });
});

// ───────────────────────── Pureté du domaine ─────────────────────────

const DOMAIN_DIR = join(process.cwd(), 'src', 'domain');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });
}

/** Retire les commentaires (bloc et ligne) pour ne pas signaler une mention en prose. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('pureté de src/domain : pas d’horloge ni d’aléa implicites', () => {
  const files = sourceFiles(DOMAIN_DIR);

  it('trouve les sources du domaine', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('aucun Date.now( ni Math.random( dans src/domain', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'));
      if (/\bDate\.now\s*\(/.test(code)) offenders.push(`${relative(DOMAIN_DIR, f)} : Date.now(`);
      if (/\bMath\.random\s*\(/.test(code)) offenders.push(`${relative(DOMAIN_DIR, f)} : Math.random(`);
    }
    expect(offenders).toEqual([]);
  });

  it('new Date( uniquement dans dates.ts ; new Date() sans argument seulement comme défaut de todayInTimeZone', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(DOMAIN_DIR, f);
      const code = stripComments(readFileSync(f, 'utf8'));
      const all = code.match(/\bnew\s+Date\s*\(/g) ?? [];
      if (rel !== 'dates.ts') {
        if (all.length > 0) offenders.push(`${rel} : ${all.length} × new Date(`);
        continue;
      }
      // dates.ts : `new Date(` avec arguments toléré ; `new Date()` seulement en valeur par
      // défaut du paramètre `now` de todayInTimeZone (l'horloge réelle, appelée par
      // src/server/clock.ts). Toute autre occurrence sans argument est signalée.
      const bare = code.match(/\bnew\s+Date\s*\(\s*\)/g) ?? [];
      const allowed = code.match(/now:\s*Date\s*=\s*new\s+Date\s*\(\s*\)/g) ?? [];
      if (bare.length !== allowed.length) offenders.push(`dates.ts : ${bare.length - allowed.length} × new Date()`);
      expect(allowed.length).toBeLessThanOrEqual(1);
    }
    expect(offenders).toEqual([]);
  });
});
