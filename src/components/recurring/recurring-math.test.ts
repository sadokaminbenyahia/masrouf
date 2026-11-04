import { describe, expect, it } from 'vitest';
import type { RecurringRule } from '@/domain/types';
import {
  FREQUENCY_OPTIONS,
  dueLabelFR,
  frequencyLabel,
  isRuleCurrent,
  monthlyEquivalent,
  monthlyTotals,
  occurrenceAt,
  relativeDueFR,
  sortRules,
  upcomingOccurrences,
} from './recurring-math';

const TODAY = '2026-03-10';

function rule(patch: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'r1',
    accountId: 'a1',
    categoryId: null,
    type: 'EXPENSE',
    amount: 100_000,
    label: 'Loyer',
    frequency: 'MONTHLY',
    startDate: '2026-01-03',
    nextDate: '2026-03-15',
    endDate: null,
    active: true,
    autoCreate: true,
    ...patch,
  };
}

describe('monthlyEquivalent', () => {
  it('convertit chaque fréquence en équivalent mensuel', () => {
    expect(monthlyEquivalent(12_000, 'WEEKLY')).toBe(52_000);
    expect(monthlyEquivalent(750_000, 'MONTHLY')).toBe(750_000);
    expect(monthlyEquivalent(90_000, 'QUARTERLY')).toBe(30_000);
    expect(monthlyEquivalent(120_000, 'YEARLY')).toBe(10_000);
  });

  it('arrondit au millime', () => {
    expect(monthlyEquivalent(1_000, 'WEEKLY')).toBe(4_333);
    expect(monthlyEquivalent(100, 'QUARTERLY')).toBe(33);
    expect(monthlyEquivalent(1_000, 'YEARLY')).toBe(83);
  });
});

describe('monthlyTotals', () => {
  it('additionne dépenses et revenus des règles actives et en cours', () => {
    const totals = monthlyTotals(
      [
        rule({ amount: 750_000 }),
        rule({ id: 'r2', amount: 12_000, frequency: 'WEEKLY' }),
        rule({ id: 'r3', type: 'INCOME', amount: 2_600_000, label: 'Salaire' }),
        rule({ id: 'r4', amount: 999_000, active: false }),
        rule({ id: 'r5', amount: 999_000, endDate: '2026-03-01' }),
        rule({ id: 'r6', amount: 60_000, frequency: 'QUARTERLY', endDate: TODAY }),
      ],
      TODAY,
    );
    expect(totals).toEqual({
      expense: 750_000 + 52_000 + 20_000,
      income: 2_600_000,
      net: 2_600_000 - 822_000,
      activeCount: 4,
    });
  });

  it('renvoie des zéros sans règle', () => {
    expect(monthlyTotals([], TODAY)).toEqual({ expense: 0, income: 0, net: 0, activeCount: 0 });
  });
});

describe('isRuleCurrent', () => {
  it('exclut les règles inactives ou terminées', () => {
    expect(isRuleCurrent(rule(), TODAY)).toBe(true);
    expect(isRuleCurrent(rule({ active: false }), TODAY)).toBe(false);
    expect(isRuleCurrent(rule({ endDate: '2026-03-09' }), TODAY)).toBe(false);
  });
});

describe('occurrenceAt', () => {
  it('calcule les échéances sans dérive de fin de mois', () => {
    expect(occurrenceAt('2026-01-31', 'MONTHLY', 1)).toBe('2026-02-28');
    expect(occurrenceAt('2026-01-31', 'MONTHLY', 2)).toBe('2026-03-31');
    expect(occurrenceAt('2026-01-05', 'WEEKLY', 2)).toBe('2026-01-19');
    expect(occurrenceAt('2026-01-15', 'QUARTERLY', 1)).toBe('2026-04-15');
    expect(occurrenceAt('2024-02-29', 'YEARLY', 1)).toBe('2025-02-28');
  });
});

describe('upcomingOccurrences', () => {
  it('liste les échéances des 30 prochains jours, triées', () => {
    const items = upcomingOccurrences(
      [
        rule({ id: 'a', label: 'Loyer', nextDate: '2026-03-15' }),
        rule({ id: 'b', label: 'Sport', frequency: 'WEEKLY', nextDate: '2026-03-12' }),
        rule({ id: 'c', label: 'Assurance', frequency: 'YEARLY', nextDate: '2026-06-01' }),
        rule({ id: 'd', label: 'Inactive', active: false, nextDate: '2026-03-11' }),
      ],
      TODAY,
    );
    expect(items.map((i) => [i.rule.id, i.date])).toEqual([
      ['b', '2026-03-12'],
      ['a', '2026-03-15'],
      ['b', '2026-03-19'],
      ['b', '2026-03-26'],
      ['b', '2026-04-02'],
      ['b', '2026-04-09'],
    ]);
    expect(items.every((i) => !i.overdue)).toBe(true);
  });

  it('marque une seule fois une échéance passée', () => {
    const items = upcomingOccurrences(
      [rule({ frequency: 'WEEKLY', nextDate: '2026-02-20', autoCreate: false })],
      TODAY,
      7,
    );
    expect(items.map((i) => [i.date, i.overdue])).toEqual([
      ['2026-02-20', true],
      ['2026-03-13', false],
    ]);
  });

  it('respecte la date de fin et trie par libellé à date égale', () => {
    const items = upcomingOccurrences(
      [
        rule({ id: 'z', label: 'Zumba', frequency: 'WEEKLY', nextDate: '2026-03-12', endDate: '2026-03-20' }),
        rule({ id: 'e', label: 'Électricité', nextDate: '2026-03-12' }),
      ],
      TODAY,
    );
    expect(items.map((i) => [i.rule.id, i.date])).toEqual([
      ['e', '2026-03-12'],
      ['z', '2026-03-12'],
      ['z', '2026-03-19'],
    ]);
  });
});

describe('libellés', () => {
  it('fréquences', () => {
    expect(frequencyLabel('MONTHLY')).toBe('Tous les mois');
    expect(frequencyLabel('WEEKLY', true)).toBe('toutes les semaines');
    expect(FREQUENCY_OPTIONS.map((o) => o.value)).toEqual(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']);
  });

  it('échéances relatives', () => {
    expect(relativeDueFR(TODAY, TODAY)).toBe('aujourd’hui');
    expect(relativeDueFR('2026-03-11', TODAY)).toBe('demain');
    expect(relativeDueFR('2026-03-09', TODAY)).toBe('hier');
    expect(relativeDueFR('2026-03-15', TODAY)).toBe('dans 5 jours');
    expect(relativeDueFR('2026-03-07', TODAY)).toBe('il y a 3 jours');
    expect(dueLabelFR('2026-03-15', TODAY)).toBe('dans 5 jours · 15 mars');
    expect(dueLabelFR('2026-04-01', TODAY)).toBe('dans 22 jours · 1er avril');
    expect(dueLabelFR('2027-01-02', TODAY)).toBe('dans 298 jours · 2 janvier 2027');
  });
});

describe('sortRules', () => {
  it('met les règles actives en premier, puis trie par échéance et libellé', () => {
    const sorted = sortRules([
      rule({ id: 'off', active: false, nextDate: '2026-03-01' }),
      rule({ id: 'b', label: 'B', nextDate: '2026-03-20' }),
      rule({ id: 'a2', label: 'A', nextDate: '2026-03-20' }),
      rule({ id: 'first', nextDate: '2026-03-11' }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['first', 'a2', 'b', 'off']);
  });
});
