import { describe, expect, it } from 'vitest';
import type { RecurringCandidate } from './ai/types';
import { formatMoney } from './money';
import {
  categorySpikeInsights,
  computeInsights,
  forgottenSubscriptionInsights,
  groupSpending,
  matchesExistingRule,
  rule503020Insights,
} from './insights';
import type { Category, CategoryGroup, RecurringRule } from './types';

const cat = (id: string, group: CategoryGroup, name = id): Category => ({
  id,
  name,
  kind: group === 'INCOME' ? 'INCOME' : 'EXPENSE',
  group,
  icon: 'Tag',
  color: '#000000',
  sortOrder: 0,
});

const categories = [
  cat('loyer', 'NEEDS', 'Loyer'),
  cat('resto', 'WANTS', 'Restaurants'),
  cat('epargne', 'SAVINGS', 'Épargne'),
  cat('salaire', 'INCOME', 'Salaire'),
];
const catMap = new Map(categories.map((c) => [c.id, c]));

describe('groupSpending', () => {
  it('répartit par groupe, le reste va dans « other »', () => {
    expect(
      groupSpending(
        [
          { categoryId: 'loyer', amount: 750, count: 1 },
          { categoryId: 'resto', amount: 200, count: 2 },
          { categoryId: 'epargne', amount: 100, count: 1 },
          { categoryId: null, amount: 30, count: 1 },
          { categoryId: 'salaire', amount: 5, count: 1 },
        ],
        catMap,
      ),
    ).toEqual({ needs: 750, wants: 200, savings: 100, other: 35 });
  });
});

describe('rule503020Insights', () => {
  it('signale besoins, envies et épargne hors limites', () => {
    const list = rule503020Insights(
      {
        month: '2026-10',
        income: 1_000_000,
        expense: 960_000,
        byCategory: [
          { categoryId: 'loyer', amount: 600_000, count: 1 },
          { categoryId: 'resto', amount: 360_000, count: 5 },
        ],
      },
      catMap,
    );
    expect(list.map((i) => i.key)).toEqual([
      'rule-50-30-20:needs:2026-10',
      'rule-50-30-20:wants:2026-10',
      'rule-50-30-20:savings:2026-10',
    ]);
    expect(list[0]?.title).toBe('Besoins : 60 % de vos revenus');
    expect(list[1]?.message).toContain(formatMoney(60_000, { decimals: 0 }));
    expect(list[2]).toMatchObject({ kind: 'SAVINGS_RATE', severity: 'WARNING' });
  });

  it('épargne négative : DANGER', () => {
    const [i] = rule503020Insights(
      {
        month: '2026-10',
        income: 1_000_000,
        expense: 1_200_000,
        byCategory: [{ categoryId: null, amount: 1_200_000, count: 1 }],
      },
      catMap,
    );
    expect(i).toMatchObject({ kind: 'SAVINGS_RATE', severity: 'DANGER' });
    expect(i?.message).toContain(formatMoney(200_000, { decimals: 0 }));
  });

  it('l’épargne inclut le groupe SAVINGS ; règle respectée → SUCCESS', () => {
    const list = rule503020Insights(
      {
        month: '2026-10',
        income: 1_000_000,
        expense: 900_000,
        byCategory: [
          { categoryId: 'loyer', amount: 450_000, count: 1 },
          { categoryId: 'resto', amount: 250_000, count: 4 },
          { categoryId: 'epargne', amount: 200_000, count: 1 },
        ],
      },
      catMap,
    );
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ severity: 'SUCCESS', key: 'rule-50-30-20:ok:2026-10' });
    expect(list[0]?.message).toContain('épargne 30 %');
  });

  it('aucun revenu : rien', () => {
    expect(rule503020Insights({ month: '2026-10', income: 0, expense: 5, byCategory: [] }, catMap)).toEqual(
      [],
    );
  });
});

describe('categorySpikeInsights', () => {
  it('+30 % et +30 DT par rapport à la moyenne des 3 mois précédents', () => {
    const sums = [
      { categoryId: 'resto', month: '2026-08', amount: 100_000 },
      { categoryId: 'resto', month: '2026-09', amount: 100_000 },
      { categoryId: 'resto', month: '2026-10', amount: 100_000 },
      { categoryId: 'resto', month: '2026-11', amount: 140_000 },
      { categoryId: 'loyer', month: '2026-09', amount: 30_000 },
      { categoryId: 'loyer', month: '2026-10', amount: 30_000 },
      { categoryId: 'loyer', month: '2026-11', amount: 45_000 },
      { categoryId: 'epargne', month: '2026-10', amount: 10_000 },
      { categoryId: 'epargne', month: '2026-11', amount: 900_000 },
      { categoryId: null, month: '2026-11', amount: 900_000 },
    ];
    const list = categorySpikeInsights('2026-11', sums, catMap);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      key: 'category-spike:resto:2026-11',
      kind: 'CATEGORY_SPIKE',
      categoryId: 'resto',
      title: 'Restaurants : +40 %',
      href: '/transactions?categoryId=resto&from=2026-11-01&to=2026-11-30',
    });
  });

  it('écart insuffisant ou pas d’historique : rien', () => {
    expect(
      categorySpikeInsights(
        '2026-11',
        [
          { categoryId: 'resto', month: '2026-10', amount: 60_000 },
          { categoryId: 'resto', month: '2026-11', amount: 45_000 },
          { categoryId: 'loyer', month: '2026-11', amount: 500_000 },
        ],
        catMap,
      ),
    ).toEqual([]);
  });

  it('trie par écart décroissant', () => {
    const sums = [
      { categoryId: 'resto', month: '2026-10', amount: 300_000 },
      { categoryId: 'resto', month: '2026-11', amount: 200_000 },
      { categoryId: 'loyer', month: '2026-10', amount: 3_000_000 },
      { categoryId: 'loyer', month: '2026-11', amount: 2_000_000 },
    ];
    expect(categorySpikeInsights('2026-11', sums, catMap).map((i) => i.categoryId)).toEqual([
      'loyer',
      'resto',
    ]);
  });
});

const candidate = (over: Partial<RecurringCandidate> = {}): RecurringCandidate => ({
  key: 'k',
  label: 'Netflix',
  merchantKey: 'netflix com',
  type: 'EXPENSE',
  amount: 33_000,
  frequency: 'MONTHLY',
  nextDate: '2026-11-12',
  categoryId: 'abo',
  accountId: 'card',
  occurrences: 4,
  confidence: 0.9,
  transactionIds: ['t1', 't2', 't3', 't4'],
  ...over,
});

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'r',
  accountId: 'a',
  categoryId: 'telecom',
  type: 'EXPENSE',
  amount: 49_000,
  label: 'Internet Ooredoo',
  frequency: 'MONTHLY',
  startDate: '2026-05-05',
  nextDate: '2026-11-05',
  endDate: null,
  active: true,
  autoCreate: true,
  ...over,
});

const txMap = new Map([
  ['t1', { date: '2026-07-12', recurringId: null }],
  ['t2', { date: '2026-08-12', recurringId: null }],
  ['t3', { date: '2026-09-12', recurringId: null }],
  ['t4', { date: '2026-10-12', recurringId: null }],
]);

describe('matchesExistingRule', () => {
  it('par libellé ou par catégorie + montant proche', () => {
    expect(matchesExistingRule(candidate({ merchantKey: 'ooredoo', label: 'OOREDOO' }), rule())).toBe(
      true,
    );
    expect(matchesExistingRule(candidate({ categoryId: 'telecom', amount: 48_000 }), rule())).toBe(true);
    expect(matchesExistingRule(candidate({ categoryId: 'telecom', amount: 30_000 }), rule())).toBe(
      false,
    );
    expect(matchesExistingRule(candidate(), rule())).toBe(false);
    expect(matchesExistingRule(candidate({ merchantKey: 'ooredoo' }), rule({ type: 'INCOME' }))).toBe(
      false,
    );
  });
});

describe('forgottenSubscriptionInsights', () => {
  it('signale un paiement récurrent non déclaré depuis ≥ 3 mois', () => {
    const list = forgottenSubscriptionInsights({
      today: '2026-11-04',
      candidates: [candidate(), candidate({ key: 'k2' })],
      rules: [rule()],
      transactions: txMap,
    });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      key: 'forgotten-subscription:netflix com',
      kind: 'FORGOTTEN_SUBSCRIPTION',
      categoryId: 'abo',
      href: '/recurrents',
    });
    expect(list[0]?.message).toContain('depuis 4 mois');
    expect(list[0]?.message).toContain('chaque mois');
  });

  it('ignore les revenus, les séries liées à une règle, trop récentes ou déjà suivies', () => {
    const base = { today: '2026-11-04', rules: [rule()], transactions: txMap };
    expect(forgottenSubscriptionInsights({ ...base, candidates: [candidate({ type: 'INCOME' })] })).toEqual(
      [],
    );
    expect(
      forgottenSubscriptionInsights({
        ...base,
        candidates: [candidate({ transactionIds: ['t3', 't4'] })],
      }),
    ).toEqual([]);
    expect(
      forgottenSubscriptionInsights({
        ...base,
        candidates: [candidate({ transactionIds: ['missing'] })],
      }),
    ).toEqual([]);
    expect(
      forgottenSubscriptionInsights({
        ...base,
        transactions: new Map([['t1', { date: '2026-01-01', recurringId: 'r' }]]),
        candidates: [candidate({ transactionIds: ['t1'] })],
      }),
    ).toEqual([]);
    expect(
      forgottenSubscriptionInsights({
        ...base,
        candidates: [candidate({ merchantKey: 'ooredoo', label: 'Ooredoo', categoryId: null })],
      }),
    ).toEqual([]);
  });
});

describe('computeInsights', () => {
  it('agrège, filtre les clés ignorées et trie par gravité', () => {
    const input = {
      today: '2026-11-04',
      categories,
      ruleMonth: {
        month: '2026-10',
        income: 1_000_000,
        expense: 1_100_000,
        byCategory: [{ categoryId: 'loyer', amount: 1_100_000, count: 1 }],
      },
      spikeMonth: '2026-11',
      categoryMonthly: [
        { categoryId: 'resto', month: '2026-10', amount: 100_000 },
        { categoryId: 'resto', month: '2026-11', amount: 200_000 },
      ],
      forgotten: { candidates: [candidate()], rules: [], transactions: txMap },
      dismissedKeys: ['rule-50-30-20:needs:2026-10'],
    };
    const list = computeInsights(input);
    expect(list.map((i) => [i.kind, i.severity])).toEqual([
      ['SAVINGS_RATE', 'DANGER'],
      ['CATEGORY_SPIKE', 'WARNING'],
      ['FORGOTTEN_SUBSCRIPTION', 'INFO'],
    ]);
    expect(computeInsights({ ...input, ruleMonth: null, forgotten: null })).toHaveLength(1);
  });
});
