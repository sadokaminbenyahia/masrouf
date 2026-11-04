import { describe, expect, it } from 'vitest';
import {
  MAX_OCCURRENCES_PER_RUN,
  dueOccurrences,
  firstOccurrenceOnOrAfter,
  monthlyEquivalent,
  monthlyFixedCharges,
  nextOccurrence,
  sortRules,
  upcomingRules,
} from './recurring';
import type { RecurringRule } from './types';

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'r',
  accountId: 'a',
  categoryId: null,
  type: 'EXPENSE',
  amount: 45_000,
  label: 'Internet',
  frequency: 'MONTHLY',
  startDate: '2026-01-31',
  nextDate: '2026-01-31',
  endDate: null,
  active: true,
  autoCreate: true,
  ...over,
});

describe('nextOccurrence', () => {
  it('WEEKLY : +7 jours', () => {
    expect(nextOccurrence({ frequency: 'WEEKLY', startDate: '2026-03-02' }, '2026-03-30')).toBe(
      '2026-04-06',
    );
  });

  it('MONTHLY ancré sur le jour de début (31 → fin de mois, sans dérive)', () => {
    const r = { frequency: 'MONTHLY' as const, startDate: '2026-01-31' };
    expect(nextOccurrence(r, '2026-01-31')).toBe('2026-02-28');
    expect(nextOccurrence(r, '2026-02-28')).toBe('2026-03-31');
    expect(nextOccurrence(r, '2026-03-31')).toBe('2026-04-30');
    expect(nextOccurrence({ frequency: 'MONTHLY', startDate: '2027-01-31' }, '2027-12-31')).toBe(
      '2028-01-31',
    );
    expect(nextOccurrence({ frequency: 'MONTHLY', startDate: '2028-01-30' }, '2028-01-30')).toBe(
      '2028-02-29',
    );
  });

  it('QUARTERLY et YEARLY', () => {
    expect(nextOccurrence({ frequency: 'QUARTERLY', startDate: '2026-01-15' }, '2026-01-15')).toBe(
      '2026-04-15',
    );
    expect(nextOccurrence({ frequency: 'QUARTERLY', startDate: '2026-01-15' }, '2026-04-15')).toBe(
      '2026-07-15',
    );
    expect(nextOccurrence({ frequency: 'YEARLY', startDate: '2024-02-29' }, '2024-02-29')).toBe(
      '2025-02-28',
    );
    expect(nextOccurrence({ frequency: 'YEARLY', startDate: '2024-02-29' }, '2027-02-28')).toBe(
      '2028-02-29',
    );
  });

  it('réaligne une échéance déplacée sur le jour de début', () => {
    expect(nextOccurrence({ frequency: 'MONTHLY', startDate: '2026-01-15' }, '2026-03-20')).toBe(
      '2026-04-15',
    );
    expect(nextOccurrence({ frequency: 'MONTHLY', startDate: '2026-01-15' }, '2026-03-10')).toBe(
      '2026-04-15',
    );
  });

  it('avant la date de début : renvoie la date de début', () => {
    expect(nextOccurrence({ frequency: 'MONTHLY', startDate: '2026-05-10' }, '2026-03-01')).toBe(
      '2026-05-10',
    );
  });
});

describe('firstOccurrenceOnOrAfter', () => {
  it('saute les échéances passées', () => {
    const r = { frequency: 'MONTHLY' as const, startDate: '2026-01-03' };
    expect(firstOccurrenceOnOrAfter(r, '2026-11-04')).toBe('2026-12-03');
    expect(firstOccurrenceOnOrAfter(r, '2026-11-03')).toBe('2026-11-03');
    expect(firstOccurrenceOnOrAfter(r, '2025-12-01')).toBe('2026-01-03');
  });
});

describe('dueOccurrences', () => {
  it('produit chaque échéance ≤ today et avance nextDate', () => {
    const r = rule({ startDate: '2026-08-31', nextDate: '2026-08-31' });
    expect(dueOccurrences(r, '2026-11-04')).toEqual({
      dates: ['2026-08-31', '2026-09-30', '2026-10-31'],
      nextDate: '2026-11-30',
    });
  });

  it('est idempotent : une seconde passe ne produit rien', () => {
    const r = rule({ startDate: '2026-08-31', nextDate: '2026-11-30' });
    expect(dueOccurrences(r, '2026-11-04').dates).toEqual([]);
  });

  it('respecte endDate et active', () => {
    const r = rule({ startDate: '2026-08-31', nextDate: '2026-08-31', endDate: '2026-09-30' });
    expect(dueOccurrences(r, '2026-11-04').dates).toEqual(['2026-08-31', '2026-09-30']);
    expect(dueOccurrences({ ...r, active: false }, '2026-11-04')).toEqual({
      dates: [],
      nextDate: '2026-08-31',
    });
  });

  it('plafonne le nombre d’occurrences', () => {
    const r = rule({ frequency: 'WEEKLY', startDate: '2020-01-01', nextDate: '2020-01-01' });
    const due = dueOccurrences(r, '2026-11-04');
    expect(due.dates).toHaveLength(MAX_OCCURRENCES_PER_RUN);
    expect(due.nextDate).toBe('2021-02-24');
    expect(dueOccurrences(r, '2026-11-04', 2).dates).toEqual(['2020-01-01', '2020-01-08']);
  });
});

describe('équivalents mensuels', () => {
  it('convertit chaque fréquence', () => {
    expect(monthlyEquivalent({ frequency: 'WEEKLY', amount: 12_000 })).toBe(52_000);
    expect(monthlyEquivalent({ frequency: 'MONTHLY', amount: 45_000 })).toBe(45_000);
    expect(monthlyEquivalent({ frequency: 'QUARTERLY', amount: 90_000 })).toBe(30_000);
    expect(monthlyEquivalent({ frequency: 'YEARLY', amount: 120_000 })).toBe(10_000);
  });

  it('charges fixes : règles de dépense actives seulement', () => {
    expect(
      monthlyFixedCharges([
        rule({ amount: 750_000 }),
        rule({ amount: 45_000, active: false }),
        rule({ amount: 2_600_000, type: 'INCOME' }),
      ]),
    ).toBe(750_000);
  });
});

describe('upcomingRules / sortRules', () => {
  const rules = [
    rule({ id: 'far', nextDate: '2026-12-20' }),
    rule({ id: 'soon', nextDate: '2026-11-10', label: 'B' }),
    rule({ id: 'soon2', nextDate: '2026-11-10', label: 'A' }),
    rule({ id: 'today', nextDate: '2026-11-04' }),
    rule({ id: 'off', nextDate: '2026-11-05', active: false }),
    rule({ id: 'ended', nextDate: '2026-11-06', endDate: '2026-11-01' }),
    rule({ id: 'past', nextDate: '2026-11-01' }),
  ];
  it('ne garde que les 30 prochains jours, triés et limités', () => {
    expect(upcomingRules(rules, '2026-11-04', 30, 5).map((r) => r.id)).toEqual([
      'today',
      'soon2',
      'soon',
    ]);
    expect(upcomingRules(rules, '2026-11-04', 30, 1).map((r) => r.id)).toEqual(['today']);
  });
  it('trie : actives d’abord, puis par échéance', () => {
    expect(sortRules(rules).map((r) => r.id)).toEqual([
      'past',
      'today',
      'ended',
      'soon2',
      'soon',
      'far',
      'off',
    ]);
  });
});
