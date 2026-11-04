import { describe, expect, it } from 'vitest';
import type { AccountWithBalance } from '@/domain/types';
import { daysLeftInMonth, describeExpenseChange, isDashboardEmpty } from './metrics';

describe('describeExpenseChange', () => {
  it('hausse : défavorable, avec signe et mois précédent', () => {
    const d = describeExpenseChange(0.12, '2026-11');
    expect(d).toMatchObject({
      trend: 'up',
      tone: 'bad',
      percent: '+12 %',
      text: '+12 % vs octobre',
    });
    expect(d?.srText).toBe('Dépenses en hausse de 12 % par rapport à octobre.');
  });

  it('baisse : favorable', () => {
    const d = describeExpenseChange(-0.25, '2026-01');
    expect(d).toMatchObject({ trend: 'down', tone: 'good', text: '−25 % vs décembre' });
    expect(d?.srText).toContain('baisse de 25 %');
  });

  it('stable et sans référence', () => {
    expect(describeExpenseChange(0.001, '2026-11')).toMatchObject({
      trend: 'flat',
      tone: 'neutral',
      percent: '0 %',
    });
    expect(describeExpenseChange(null, '2026-11')).toBeNull();
    expect(describeExpenseChange(Number.POSITIVE_INFINITY, '2026-11')).toBeNull();
  });
});

describe('daysLeftInMonth', () => {
  it('compte le jour courant', () => {
    expect(daysLeftInMonth('2026-11-04')).toBe(27);
    expect(daysLeftInMonth('2026-02-28')).toBe(1);
  });
});

describe('isDashboardEmpty', () => {
  const account = (transactionCount: number): AccountWithBalance => ({
    id: 'a',
    name: 'Espèces',
    type: 'CASH',
    initialBalance: 0,
    color: '#000000',
    archived: false,
    sortOrder: 0,
    balance: 0,
    transactionCount,
  });
  const zero = { month: '2026-11', income: 0, expense: 0, net: 0 };

  it('vide sans transaction ni flux', () => {
    expect(isDashboardEmpty({ accounts: [account(0)], monthly: [zero] })).toBe(true);
    expect(isDashboardEmpty({ accounts: [account(2)], monthly: [zero] })).toBe(false);
    expect(isDashboardEmpty({ accounts: [account(0)], monthly: [{ ...zero, expense: 5 }] })).toBe(
      false,
    );
  });
});
