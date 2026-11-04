import { describe, expect, it } from 'vitest';
import { monthEnd } from '../dates';
import { completeHistoryMonths, forecastBalance, recurringBetween } from './forecast';
import {
  LINEAR_TODAY,
  RENT_RULE,
  SALARY_RULE,
  SERIES_TODAY,
  cleanHistory,
  linearSeries,
  rule,
  tx,
} from './__fixtures__/series';
import type { AiTransaction, BalanceForecast } from './types';

const signed = (t: AiTransaction) => (t.type === 'INCOME' ? t.amount : -t.amount);
const total = (txs: AiTransaction[]) => txs.reduce((s, t) => s + signed(t), 0);

function expectWellFormed(f: BalanceForecast) {
  for (const p of [f.endOfMonth, ...f.months]) {
    expect(p.low).toBeLessThanOrEqual(p.expected);
    expect(p.expected).toBeLessThanOrEqual(p.high);
    for (const v of [p.low, p.expected, p.high]) expect(Number.isSafeInteger(v)).toBe(true);
  }
  expect(f.months).toHaveLength(3);
  expect(f.chart).toHaveLength(10);
  for (const c of f.chart) {
    for (const v of [c.actual, c.expected, c.low, c.high]) {
      if (v !== null) expect(Number.isSafeInteger(v)).toBe(true);
    }
    if (c.low !== null && c.expected !== null && c.high !== null) {
      expect(c.low).toBeLessThanOrEqual(c.expected);
      expect(c.expected).toBeLessThanOrEqual(c.high);
    }
  }
  expect(Number.isSafeInteger(f.monthlyNetEstimate)).toBe(true);
  expect(f.explanation.length).toBeGreaterThan(10);
}

describe('forecastBalance', () => {
  it('série linéaire bruitée : l’intervalle contient la valeur réelle', () => {
    const { history, future, months, initialBalance } = linearSeries();
    const currentBalance = initialBalance + total(history);
    const f = forecastBalance({ today: LINEAR_TODAY, currentBalance, history, recurring: [] });
    expectWellFormed(f);
    expect(f.reliability).toBe('HIGH');
    expect(f.endOfMonth).toMatchObject({ date: '2026-10-31', expected: currentBalance });

    let balance = currentBalance;
    months.slice(12).forEach((ym, h) => {
      balance += total(future.filter((t) => t.date.startsWith(ym)));
      const p = f.months[h];
      expect(p?.date).toBe(monthEnd(ym));
      expect(p?.low).toBeLessThanOrEqual(balance);
      expect(p?.high).toBeGreaterThanOrEqual(balance);
    });
    // Tendance : ≈ 200 + 15 × 12 = 380 DT le mois suivant
    expect(f.monthlyNetEstimate).toBeGreaterThan(340_000);
    expect(f.monthlyNetEstimate).toBeLessThan(420_000);
  });

  it('graphique : soldes réels reconstitués à rebours', () => {
    const { history, months, initialBalance } = linearSeries();
    const currentBalance = initialBalance + total(history);
    const f = forecastBalance({ today: LINEAR_TODAY, currentBalance, history, recurring: [] });
    const past = f.chart.slice(0, 6);
    expect(past.map((c) => c.month)).toEqual(months.slice(5, 11));
    for (const c of past) {
      const upTo = history.filter((t) => t.date <= monthEnd(c.month));
      expect(c.actual).toBe(initialBalance + total(upTo));
    }
    expect(past[5]).toMatchObject({ expected: past[5]?.actual, low: past[5]?.actual });
    expect(f.chart[6]).toMatchObject({ month: '2026-10', actual: null, expected: f.endOfMonth.expected });
  });

  it('ajoute les récurrences restantes du mois et des mois suivants', () => {
    const history = cleanHistory();
    const variable = forecastBalance({ today: SERIES_TODAY, currentBalance: 5_000_000, history, recurring: [] });
    const withRules = forecastBalance({
      today: SERIES_TODAY,
      currentBalance: 5_000_000,
      history,
      recurring: [SALARY_RULE, RENT_RULE, rule({ id: 'x', label: 'Gym', amount: 60_000, nextDate: '2026-11-20' })],
    });
    expectWellFormed(withRules);
    expect(variable.reliability).not.toBe('LOW');
    // Les transactions salaire/loyer passent du flux variable aux récurrences.
    expect(withRules.endOfMonth.expected).toBeLessThan(variable.endOfMonth.expected);
    expect(withRules.explanation).toContain('3 opérations récurrentes');
  });

  it('historique court : fiabilité LOW, récurrences seules', () => {
    const history = [tx('2026-10-28', 20, 'Taxi', 'Transport'), tx('2026-11-02', 50, 'Courses', 'Courses')];
    const f = forecastBalance({ today: SERIES_TODAY, currentBalance: 1_000_000, history, recurring: [RENT_RULE] });
    expectWellFormed(f);
    expect(f.reliability).toBe('LOW');
    expect(f.monthlyNetEstimate).toBe(0);
    expect(f.endOfMonth.expected).toBe(1_000_000);
    expect(f.months[0]?.expected).toBe(1_000_000 - 750_000);
    expect(f.explanation).toMatch(/trop court/);
  });

  it('aucun historique', () => {
    const f = forecastBalance({ today: SERIES_TODAY, currentBalance: 0, history: [], recurring: [] });
    expectWellFormed(f);
    expect(f.reliability).toBe('LOW');
    expect(f.endOfMonth).toEqual({ date: '2026-11-30', expected: 0, low: 0, high: 0 });
  });

  it('3 à 5 mois : moyenne et fiabilité MEDIUM ; < 3 mois : rythme journalier', () => {
    const { history } = linearSeries();
    const recent = history.filter((t) => t.date >= '2026-06-01');
    const f = forecastBalance({ today: LINEAR_TODAY, currentBalance: 0, history: recent, recurring: [] });
    expectWellFormed(f);
    expect(f.reliability).toBe('MEDIUM');
    const short = history.filter((t) => t.date >= '2026-09-01');
    const g = forecastBalance({ today: '2026-10-20', currentBalance: 0, history: short, recurring: [] });
    expectWellFormed(g);
    expect(g.reliability).toBe('LOW');
    expect(g.explanation).toMatch(/rythme/);
  });

  it('saisonnalité à partir de 13 mois', () => {
    const { history, future } = linearSeries();
    const all = [...history, ...future];
    const f = forecastBalance({ today: '2027-01-31', currentBalance: 0, history: all, recurring: [] });
    expectWellFormed(f);
    expect(f.reliability).toBe('HIGH');
  });
});

describe('utilitaires', () => {
  it('completeHistoryMonths', () => {
    expect(completeHistoryMonths('2026-11-04', '2026-08-03', 6)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(completeHistoryMonths('2026-11-04', '2026-08-20', 6)).toEqual(['2026-09', '2026-10']);
    expect(completeHistoryMonths('2026-11-04', '2020-01-01', 2)).toEqual(['2026-09', '2026-10']);
    expect(completeHistoryMonths('2026-11-04', '2026-11-01', 6)).toEqual([]);
    expect(completeHistoryMonths('2026-11-04', null, 6)).toEqual([]);
  });

  it('recurringBetween respecte la fin et l’état des règles', () => {
    const r = rule({ id: 'a', label: 'Club', amount: 10_000, nextDate: '2026-11-01', frequency: 'WEEKLY', endDate: '2026-11-20' });
    expect(recurringBetween([r], '2026-11-01', '2026-11-30')).toEqual({ total: -30_000, count: 3 });
    expect(recurringBetween([{ ...r, active: false }], '2026-11-01', '2026-11-30').count).toBe(0);
    expect(recurringBetween([SALARY_RULE], '2026-12-01', '2026-12-31')).toEqual({ total: 2_600_000, count: 1 });
  });
});
