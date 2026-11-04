// Tests de propriétés déterministes sur les montants (millimes entiers) : aller-retour
// formatMoney ↔ parseMoneyTerm, et intégrité des sorties monétaires de tout le domaine
// (jamais de flottant, de NaN ni d'Infinity), sur des entrées pseudo-aléatoires à graine fixe.
import { describe, expect, it } from 'vitest';
import {
  dinarsToMillimes,
  formatMoney,
  millimesToInputString,
  parseAmountInput,
  parseMoneyTerm,
  sumMillimes,
} from '@/domain/money';
import { addDays, lastMonths, listMonths, monthOf } from '@/domain/dates';
import {
  averageMillimes,
  buildCategorySlices,
  buildMonthlySeries,
  categoryMonthSums,
  dailyAllowance,
  type CategorySum,
  type DailyTypeSum,
} from '@/domain/aggregations';
import {
  computeAllBudgetProgress,
  computeBudgetProgress,
  projectSpending,
  summarizeBudgets,
} from '@/domain/budgets';
import { applyContribution, computeGoalProgress } from '@/domain/goals';
import { totalBalance, withBalances, type AccountTypeSum } from '@/domain/accounts';
import { monthlyEquivalent, monthlyFixedCharges } from '@/domain/recurring';
import { groupSpending } from '@/domain/insights';
import { totalsOf } from '@/domain/transactions';
import { forecastBalance } from '@/domain/ai/forecast';
import { simulateWhatIf } from '@/domain/ai/simulator';
import { computeHealthScore } from '@/domain/ai/health';
import { generateMonthlySummary } from '@/domain/ai/summary';
import { suggestBudgets } from '@/domain/ai/budget-suggest';
import { detectAnomalies } from '@/domain/ai/anomalies';
import { detectRecurring } from '@/domain/ai/recurring-detect';
import type { AiTransaction } from '@/domain/ai/types';
import type { Account, Budget, Category, Frequency, GoalProgress } from '@/domain/types';
import {
  CATEGORIES,
  RULES,
  TODAY,
  budgetProgress,
  category,
  goalProgress,
  monthlyTotals,
  mulberry32,
  numericLeaves,
  pick,
  randInt,
  syntheticHistory,
} from './helpers/finance-fixtures';

const MAX = Number.MAX_SAFE_INTEGER;
const NBSP_RE = /[\u00A0\u202F]/g;

/** Montant aléatoire « log-uniforme » : autant de petits que de très grands montants. */
function randomMillimes(rand: () => number, maxDigits = 15): number {
  const digits = randInt(rand, 1, maxDigits);
  return Math.min(MAX, Math.floor(rand() * 10 ** digits));
}

function expectMoney(value: number, label: string): void {
  expect(Number.isSafeInteger(value), `${label} = ${value} n'est pas un entier sûr`).toBe(true);
}

/** Aucune valeur numérique non finie dans la structure. */
function expectAllFinite(value: unknown, label: string): void {
  for (const leaf of numericLeaves(value)) {
    expect(Number.isFinite(leaf.value), `${label} ${leaf.path} = ${leaf.value}`).toBe(true);
  }
}

/** Les champs monétaires désignés (par nom de clé) sont des entiers sûrs. */
function expectMoneyKeys(value: unknown, keys: readonly string[], label: string): number {
  let checked = 0;
  for (const leaf of numericLeaves(value)) {
    const key = /\.([A-Za-z]+)$/.exec(leaf.path)?.[1] ?? '';
    if (keys.includes(key)) {
      expectMoney(leaf.value, `${label} ${leaf.path}`);
      checked++;
    }
  }
  return checked;
}

const EDGE_AMOUNTS = [
  0,
  1,
  9,
  10,
  99,
  100,
  999,
  1000,
  1001,
  3500,
  999_999,
  1_000_000,
  1_234_567,
  1_000_000_000_000,
  MAX - 1,
  MAX,
];

describe('formatMoney ↔ parseMoneyTerm : aller-retour', () => {
  const rand = mulberry32(0xc0ffee);
  const amounts = [...EDGE_AMOUNTS];
  while (amounts.length < 1000) amounts.push(randomMillimes(rand));

  it('1000 montants (dont 0, 1 millime et MAX_SAFE_INTEGER) reviennent à l’identique', () => {
    for (const m of amounts) {
      const text = formatMoney(m);
      const back = parseMoneyTerm(text);
      expect(back, `« ${text} »`).toEqual({ ok: true, value: m });
      const bare = parseMoneyTerm(formatMoney(m, { hideCurrency: true }));
      expect(bare).toEqual({ ok: true, value: m });
    }
  });

  it('les montants négatifs : signe « − » typographique puis valeur absolue identique', () => {
    for (const m of amounts.slice(0, 300)) {
      if (m === 0) continue;
      const text = formatMoney(-m);
      expect(text.startsWith('−')).toBe(true);
      expect(parseMoneyTerm(text.slice(1))).toEqual({ ok: true, value: m });
      expect(formatMoney(-m, { sign: 'never' })).toBe(formatMoney(m));
      expect(formatMoney(m, { sign: 'always' }).startsWith('+')).toBe(true);
    }
  });

  it('format stable : 3 décimales, milliers séparés par une espace insécable', () => {
    for (const m of amounts) {
      const text = formatMoney(m, { hideCurrency: true });
      expect(text).toMatch(/^\d{1,3}(?:\u00A0\d{3})*,\d{3}$/);
      expect(text.replace(NBSP_RE, '').replace(',', '')).toBe(String(m).padStart(4, '0'));
    }
  });

  it('millimesToInputString ↔ parseAmountInput pour tout montant > 0', () => {
    for (const m of amounts) {
      if (m === 0) continue;
      expect(parseAmountInput(millimesToInputString(m))).toEqual({ ok: true, value: m });
    }
  });

  it('decimals: 0 arrondit au dinar le plus proche (demi vers le haut)', () => {
    for (const m of amounts.slice(0, 400)) {
      const text = formatMoney(m, { decimals: 0, hideCurrency: true }).replace(NBSP_RE, '');
      expect(Number(text)).toBe(Math.round(m / 1000));
    }
  });

  it('compact ne produit jamais NaN/Infinity', () => {
    for (const m of amounts) {
      expect(formatMoney(m, { compact: true })).not.toMatch(/NaN|Infinity/);
    }
  });

  it('au-delà de MAX_SAFE_INTEGER, parseMoneyTerm refuse au lieu d’arrondir', () => {
    expect(parseMoneyTerm('9007199254740,992').ok).toBe(false);
    expect(parseMoneyTerm('9007199254741').ok).toBe(false);
    expect(parseMoneyTerm('9007199254740992 millimes').ok).toBe(false);
  });

  it('parseAmountInput : expressions additives toujours entières', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const a = randInt(r, 1, 10_000_000);
      const b = randInt(r, 0, a - 1);
      const res = parseAmountInput(`${millimesToInputString(a)} - ${millimesToInputString(b)}`);
      expect(res).toEqual({ ok: true, value: a - b });
      const sum = parseAmountInput(`${millimesToInputString(a)}+${millimesToInputString(b + 1)}`);
      expect(sum).toEqual({ ok: true, value: a + b + 1 });
    }
  });

  it('dinarsToMillimes : entier même pour des décimales flottantes piégeuses', () => {
    for (const d of [0.1, 0.2, 0.3, 1.005, 2.675, 1234.5675, 87.25, 0.001, 1e9]) {
      expectMoney(dinarsToMillimes(d), `dinarsToMillimes(${d})`);
    }
    expect(dinarsToMillimes(0.1 + 0.2)).toBe(300);
    expect(sumMillimes([])).toBe(0);
  });
});

// ───────────────────────── Domaine : agrégats ─────────────────────────

const ALL_CATS: Category[] = CATEGORIES.map((c) =>
  category(c.id, c.name, c.kind === 'INCOME' ? 'INCOME' : 'NEEDS'),
);
const CAT_MAP = new Map(ALL_CATS.map((c) => [c.id, c]));

function randomTransactions(seed: number, count: number): AiTransaction[] {
  const rand = mulberry32(seed);
  const out: AiTransaction[] = [];
  for (let i = 0; i < count; i++) {
    const type = pick(rand, ['EXPENSE', 'EXPENSE', 'EXPENSE', 'INCOME', 'TRANSFER'] as const);
    const cat = type === 'TRANSFER' ? null : rand() < 0.1 ? null : pick(rand, CATEGORIES);
    out.push({
      id: `r${seed}_${i}`,
      date: addDays('2026-01-01', randInt(rand, 0, 307)),
      amount: rand() < 0.02 ? 1 : randomMillimes(rand, 10) + 1,
      type,
      label: pick(rand, ['CARREFOUR', 'Café', 'TAXI', 'SALAIRE', 'STEG', 'NETFLIX', 'Divers']),
      categoryId: cat?.id ?? null,
      accountId: pick(rand, ['acc_bank', 'acc_cash']),
      recurringId: null,
    });
  }
  return out;
}

describe('agrégats, budgets, objectifs, comptes : sorties entières', () => {
  const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34];

  it('buildMonthlySeries conserve les sommes et reste entier', () => {
    for (const seed of SEEDS) {
      const txs = randomTransactions(seed, 300);
      const sums: DailyTypeSum[] = txs.map((t) => ({
        date: t.date,
        type: t.type,
        amount: t.amount,
      }));
      const months = listMonths('2026-01', '2026-11');
      const series = buildMonthlySeries(months, sums);
      for (const m of series) {
        expectMoney(m.income, 'income');
        expectMoney(m.expense, 'expense');
        expect(m.net).toBe(m.income - m.expense);
      }
      const totals = totalsOf(txs);
      expect(series.reduce((s, m) => s + m.income, 0)).toBe(totals.income);
      expect(series.reduce((s, m) => s + m.expense, 0)).toBe(totals.expense);
    }
  });

  it('buildCategorySlices : montants entiers, parts ∈ [0, 1] de somme 1', () => {
    for (const seed of SEEDS) {
      const txs = randomTransactions(seed, 200).filter((t) => t.type === 'EXPENSE');
      const byCat = new Map<string | null, CategorySum>();
      for (const t of txs) {
        const cur = byCat.get(t.categoryId) ?? { categoryId: t.categoryId, amount: 0, count: 0 };
        byCat.set(t.categoryId, { ...cur, amount: cur.amount + t.amount, count: cur.count + 1 });
      }
      // Une catégorie inconnue et un montant nul : regroupés / ignorés.
      const sums = [
        ...byCat.values(),
        { categoryId: 'cat_inconnue', amount: 5, count: 1 },
        { categoryId: 'cat_e0', amount: 0, count: 0 },
      ];
      const slices = buildCategorySlices(sums, CAT_MAP);
      let share = 0;
      for (const s of slices) {
        expectMoney(s.amount, 'slice.amount');
        expect(s.share).toBeGreaterThanOrEqual(0);
        expect(s.share).toBeLessThanOrEqual(1);
        share += s.share;
      }
      expect(share).toBeCloseTo(1, 9);
      expect(slices.reduce((s, x) => s + x.amount, 0)).toBe(
        sums.reduce((s, x) => s + Math.max(0, x.amount), 0),
      );
    }
    expect(buildCategorySlices([], CAT_MAP)).toEqual([]);
  });

  it('dailyAllowance, averageMillimes, categoryMonthSums : entiers, jamais NaN', () => {
    const rand = mulberry32(99);
    for (let i = 0; i < 300; i++) {
      const remaining = randomMillimes(rand, 12) - 1_000_000;
      const month = pick(rand, ['2026-10', '2026-11', '2026-12', '2024-02', '2028-02']);
      const today = pick(rand, ['2026-11-04', '2026-11-30', '2024-02-29', '2028-02-01']);
      const v = dailyAllowance(remaining, month, today);
      expectMoney(v, 'dailyAllowance');
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(averageMillimes([])).toBe(0);
    expect(averageMillimes([1, 2])).toBe(2);
    expect(averageMillimes([MAX, MAX - 2])).toBe(MAX - 1);
    const txs = randomTransactions(4, 500).filter((t) => t.type === 'EXPENSE');
    const rows = categoryMonthSums(txs);
    for (const r of rows) expectMoney(r.amount, 'categoryMonthSums');
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(txs.reduce((s, t) => s + t.amount, 0));
  });

  it('budgets : remaining/projected entiers pour tout jour du mois (bissextile compris)', () => {
    const rand = mulberry32(12);
    const cat = category('cat_e0', 'Courses');
    for (let i = 0; i < 500; i++) {
      const amount = randInt(rand, 1, 5_000_000);
      const spent = rand() < 0.1 ? 0 : randomMillimes(rand, 10);
      const month = pick(rand, ['2024-02', '2026-02', '2026-11', '2026-12']);
      const today = `${month}-${String(randInt(rand, 1, month.endsWith('-02') ? 28 : 30)).padStart(2, '0')}`;
      const budget: Budget = { id: 'b', categoryId: cat.id, amount, sortOrder: 0 };
      const p = computeBudgetProgress({ budget, category: cat, month, spent, today });
      expectMoney(p.remaining, 'remaining');
      expect(p.remaining).toBe(amount - spent);
      // Projection à partir du 7e jour ET d'un quart du mois écoulé.
      const day = Number(today.slice(8));
      const dim = month.endsWith('-02') ? (month === '2024-02' ? 29 : 28) : month.endsWith('-11') ? 30 : 31;
      if (day < 7 || day / dim < 0.25) {
        expect(p.projected).toBeNull();
      } else {
        expect(p.projected).not.toBeNull();
        expectMoney(p.projected ?? NaN, 'projected');
        expect(p.projected ?? -1).toBeGreaterThanOrEqual(spent);
      }
      expect(Number.isFinite(p.ratio)).toBe(true);
    }
    expect(projectSpending(1, '2024-02', '2024-02-29')).toBe(1);
    expect(projectSpending(100, '2026-11', '2026-10-31')).toBeNull();
    // Plafond nul (garde-fou) : ratio fini.
    const zero = computeBudgetProgress({
      budget: { id: 'b', categoryId: cat.id, amount: 0, sortOrder: 0 },
      category: cat,
      month: '2026-11',
      spent: 10,
      today: TODAY,
    });
    expect(zero.ratio).toBe(1);
    const all = computeAllBudgetProgress({
      budgets: [
        { id: 'b1', categoryId: 'cat_e0', amount: 300_000, sortOrder: 1 },
        { id: 'b2', categoryId: 'absente', amount: 100_000, sortOrder: 0 },
      ],
      categories: CAT_MAP,
      spentByCategory: new Map([['cat_e0', 123_457]]),
      month: '2026-11',
      today: TODAY,
    });
    expect(all).toHaveLength(1);
    expect(summarizeBudgets(all)).toEqual({
      budgeted: 300_000,
      spent: 123_457,
      remaining: 176_543,
    });
    expect(summarizeBudgets([])).toBeNull();
  });

  it('objectifs : remaining/monthlyNeeded entiers, épargne jamais négative', () => {
    const rand = mulberry32(31);
    for (let i = 0; i < 500; i++) {
      const targetAmount = randInt(rand, 1, 100_000_000);
      const savedAmount = randInt(rand, 0, targetAmount * 2);
      const targetDate = rand() < 0.2 ? null : addDays('2024-01-01', randInt(rand, 0, 2500));
      const p = computeGoalProgress(
        {
          id: 'g',
          name: 'Objectif',
          targetAmount,
          savedAmount,
          targetDate,
          icon: 'Plane',
          color: '#000000',
          sortOrder: 0,
          completedAt: null,
        },
        pick(rand, [TODAY, '2024-02-29', '2025-12-31']),
        { monthlyCapacity: rand() < 0.5 ? null : randInt(rand, -100_000, 2_000_000) },
      );
      expectMoney(p.remaining, 'remaining');
      expect(p.remaining).toBeGreaterThanOrEqual(0);
      if (p.monthlyNeeded !== null) {
        expectMoney(p.monthlyNeeded, 'monthlyNeeded');
        expect(p.monthlyNeeded).toBeGreaterThan(0);
      }
      if (p.monthsLeft !== null) expect(Number.isInteger(p.monthsLeft)).toBe(true);
      const c = applyContribution(p, randInt(rand, -targetAmount * 3, targetAmount), 'now');
      expectMoney(c.savedAmount, 'savedAmount');
      expect(c.savedAmount).toBeGreaterThanOrEqual(0);
    }
  });

  it('comptes : soldes entiers ; les virements internes ne changent pas le total', () => {
    for (const seed of [3, 4, 5, 6]) {
      const rand = mulberry32(seed);
      const accounts: Account[] = ['a', 'b', 'c'].map((id, i) => ({
        id,
        name: `Compte ${id}`,
        type: 'BANK',
        initialBalance: randInt(rand, -1_000_000, 10_000_000),
        color: '#000000',
        archived: i === 2,
        sortOrder: i,
      }));
      const sums: AccountTypeSum[] = [];
      const incoming: { transferAccountId: string; amount: number; count: number }[] = [];
      let income = 0;
      let expense = 0;
      for (let i = 0; i < 60; i++) {
        const from = pick(rand, accounts);
        const amount = randomMillimes(rand, 9) + 1;
        const type = pick(rand, ['INCOME', 'EXPENSE', 'TRANSFER'] as const);
        sums.push({ accountId: from.id, type, amount, count: 1 });
        if (type === 'TRANSFER') {
          const to = pick(
            rand,
            accounts.filter((a) => a.id !== from.id),
          );
          incoming.push({ transferAccountId: to.id, amount, count: 1 });
        } else if (type === 'INCOME') income += amount;
        else expense += amount;
      }
      const list = withBalances(accounts, sums, incoming);
      for (const a of list) expectMoney(a.balance, 'balance');
      const initial = accounts.reduce((s, a) => s + a.initialBalance, 0);
      expect(totalBalance(list, { includeArchived: true })).toBe(initial + income - expense);
      expectMoney(totalBalance(list), 'totalBalance');
    }
  });

  it('récurrences et 50/30/20 : équivalents mensuels entiers', () => {
    const rand = mulberry32(77);
    const freqs: Frequency[] = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];
    for (let i = 0; i < 400; i++) {
      const amount = randomMillimes(rand, 10) + 1;
      expectMoney(monthlyEquivalent({ frequency: pick(rand, freqs), amount }), 'monthlyEquivalent');
    }
    expectMoney(monthlyFixedCharges(RULES), 'monthlyFixedCharges');
    const spending = groupSpending(
      [
        { categoryId: 'cat_e0', amount: 333_333, count: 3 },
        { categoryId: 'cat_e1', amount: 1, count: 1 },
        { categoryId: null, amount: 7, count: 1 },
      ],
      CAT_MAP,
    );
    expectAllFinite(spending, 'groupSpending');
    expect(spending.needs + spending.wants + spending.savings + spending.other).toBe(333_341);
  });
});

// ───────────────────────── Domaine : moteur IA ─────────────────────────

describe('moteur IA : sorties monétaires entières, jamais NaN/Infinity', () => {
  const history = syntheticHistory();
  const months = listMonths('2026-05', '2026-11');
  const monthly = monthlyTotals(history, months);

  const randomHistories = [11, 22, 33, 44, 55].map((seed) => randomTransactions(seed, 400));
  const histories: AiTransaction[][] = [history, ...randomHistories, [], history.slice(0, 3)];

  it('forecastBalance : expected/low/high/chart/monthlyNetEstimate entiers, low ≤ expected ≤ high', () => {
    for (const [i, h] of histories.entries()) {
      for (const currentBalance of [0, -250_000, 3_371_250, 1_000_000_000_000]) {
        const f = forecastBalance({ today: TODAY, currentBalance, history: h, recurring: RULES });
        expectAllFinite(f, `forecast#${i}`);
        const n = expectMoneyKeys(
          f,
          ['expected', 'low', 'high', 'actual', 'monthlyNetEstimate'],
          `forecast#${i}`,
        );
        expect(n).toBeGreaterThan(4);
        for (const p of [f.endOfMonth, ...f.months]) {
          expect(p.low).toBeLessThanOrEqual(p.expected);
          expect(p.expected).toBeLessThanOrEqual(p.high);
        }
      }
    }
  });

  it('simulateWhatIf : épargnes et timeline entières, monthsSaved entier ou null', () => {
    const rand = mulberry32(5150);
    for (let i = 0; i < 120; i++) {
      const h = pick(rand, histories);
      const mt = monthlyTotals(h, lastMonths(TODAY, 6));
      const res = simulateWhatIf({
        today: TODAY,
        goal: {
          id: 'g',
          name: 'Voyage',
          targetAmount: randInt(rand, 1, 50_000_000),
          savedAmount: randInt(rand, 0, 5_000_000),
          targetDate: rand() < 0.5 ? null : '2027-06-30',
        },
        monthly: mt,
        categorySpending: [
          { categoryId: 'cat_e1', name: 'Restaurants', monthlyAverage: randInt(rand, 0, 900_000) },
          { categoryId: 'cat_e2', name: 'Cafés', monthlyAverage: randInt(rand, 0, 99_999) },
        ],
        adjustments: [
          { categoryId: 'cat_e1', percent: randInt(rand, 0, 100) },
          { categoryId: 'cat_e2', percent: rand() * 100 },
          { categoryId: 'absente', percent: 50 },
        ],
        extraMonthlySaving: rand() < 0.5 ? 0 : randInt(rand, 0, 500_000),
      });
      expectAllFinite(res, 'whatIf');
      expectMoney(res.baselineMonthlySaving, 'baselineMonthlySaving');
      expectMoney(res.scenarioMonthlySaving, 'scenarioMonthlySaving');
      for (const p of res.timeline) {
        expectMoney(p.baseline, 'timeline.baseline');
        expectMoney(p.scenario, 'timeline.scenario');
      }
      if (res.monthsSaved !== null) expect(Number.isInteger(res.monthsSaved)).toBe(true);
    }
  });

  it('computeHealthScore : score entier 0..100, poids de somme 1, aucun NaN', () => {
    const rand = mulberry32(4242);
    const cases = [
      { monthly: [], totalBalance: 0, fixed: 0 },
      { monthly, totalBalance: 3_000_000, fixed: 795_000 },
      {
        monthly: monthly.map((m) => ({ ...m, income: 0, net: -m.expense })),
        totalBalance: -5,
        fixed: 0,
      },
      {
        monthly: monthly.map((m) => ({ ...m, expense: 0, net: m.income })),
        totalBalance: 1,
        fixed: 10,
      },
    ];
    for (let i = 0; i < 60; i++) {
      const h = pick(rand, histories);
      cases.push({
        monthly: monthlyTotals(h, lastMonths(TODAY, randInt(rand, 1, 7))),
        totalBalance: randInt(rand, -2_000_000, 50_000_000),
        fixed: randInt(rand, 0, 3_000_000),
      });
    }
    for (const c of cases) {
      const goals: GoalProgress[] = [
        goalProgress({ id: 'g1', name: 'Voyage', ratio: rand() }),
        goalProgress({ id: 'g2', name: 'Fini', status: 'COMPLETED', ratio: 1 }),
      ];
      const score = computeHealthScore({
        today: TODAY,
        monthly: c.monthly,
        totalBalance: c.totalBalance,
        fixedMonthlyCharges: c.fixed,
        groupSpending: { needs: 1_000_000, wants: 400_000, savings: 0 },
        budgets: [budgetProgress('Courses', 400_000, randInt(rand, 0, 900_000), '2026-11')],
        goals,
      });
      expectAllFinite(score, 'health');
      expect(Number.isInteger(score.score)).toBe(true);
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
      for (const comp of score.components) {
        expect(comp.score).toBeGreaterThanOrEqual(0);
        expect(comp.score).toBeLessThanOrEqual(100);
      }
      if (score.components.length > 0) {
        expect(score.components.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 9);
      }
    }
  });

  it('generateMonthlySummary : highlights « money » et impacts entiers', () => {
    for (const [i, h] of histories.entries()) {
      for (const month of ['2026-08', '2026-10', '2026-11', '2025-01']) {
        const s = generateMonthlySummary({
          month,
          today: TODAY,
          transactions: h,
          categories: CATEGORIES,
          budgets: [
            budgetProgress('Restaurants', 150_000, 333_333, month),
            budgetProgress('Courses', 500_000, 1, month),
          ],
          goals: [
            goalProgress({
              id: 'g',
              name: 'Voyage',
              status: 'AT_RISK',
              monthlyNeeded: 333_334,
              targetDate: '2027-03-31',
            }),
          ],
          seed: `user-${i}`,
        });
        expectAllFinite(s, `summary#${i}/${month}`);
        for (const hl of s.highlights) {
          if (hl.format === 'money') expectMoney(hl.value, `summary ${hl.label}`);
        }
        for (const r of s.recommendations) {
          if (r.impact !== null) expectMoney(r.impact, `reco ${r.title}`);
        }
        expect(s.recommendations.length).toBeLessThanOrEqual(3);
        expect(s.paragraphs.join(' ')).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
  });

  it('suggestBudgets : montants entiers > 0', () => {
    for (const h of histories) {
      for (const monthlyIncome of [null, 0, 2_600_000, 1]) {
        const list = suggestBudgets({
          today: TODAY,
          transactions: h,
          categories: CATEGORIES,
          monthlyIncome,
        });
        for (const s of list) {
          expectMoney(s.amount, `suggest ${s.categoryId}`);
          expect(s.amount).toBeGreaterThan(0);
        }
      }
    }
  });

  it('anomalies et récurrences détectées : montants entiers', () => {
    for (const h of histories) {
      const anomalies = detectAnomalies({
        today: TODAY,
        transactions: h,
        categories: CATEGORIES,
        recurring: RULES,
        dismissedKeys: [],
      });
      expectAllFinite(anomalies, 'anomalies');
      for (const a of anomalies) {
        expectMoney(a.actualAmount, 'actualAmount');
        if (a.expectedAmount !== null) expectMoney(a.expectedAmount, 'expectedAmount');
      }
      const recurring = detectRecurring({ today: TODAY, transactions: h, existing: [] });
      expectAllFinite(recurring, 'recurring');
      for (const r of recurring) expectMoney(r.amount, 'recurring.amount');
    }
  });

  it('mois courant de l’historique synthétique : agrégat cohérent', () => {
    const current = monthly.find((m) => m.month === monthOf(TODAY));
    expect(current).toBeDefined();
    expectMoney(current?.expense ?? NaN, 'expense');
  });
});
