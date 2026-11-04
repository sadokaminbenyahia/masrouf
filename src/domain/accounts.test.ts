import { describe, expect, it } from 'vitest';
import {
  EMPTY_FLOWS,
  computeBalance,
  flowsByAccount,
  sortAccounts,
  totalBalance,
  withBalances,
} from './accounts';
import type { Account } from './types';

const account = (id: string, over: Partial<Account> = {}): Account => ({
  id,
  name: id,
  type: 'BANK',
  initialBalance: 0,
  color: '#1F5FAD',
  archived: false,
  sortOrder: 0,
  ...over,
});

describe('computeBalance', () => {
  it('initial + revenus − dépenses − virements sortants + entrants', () => {
    expect(
      computeBalance(1000, {
        income: 500,
        expense: 200,
        transferOut: 100,
        transferIn: 50,
        count: 4,
      }),
    ).toBe(1250);
    expect(computeBalance(-300, EMPTY_FLOWS)).toBe(-300);
  });
});

describe('flowsByAccount', () => {
  it('regroupe les sommes par compte et compte les virements entrants', () => {
    const flows = flowsByAccount(
      [
        { accountId: 'bank', type: 'INCOME', amount: 2_600_000, count: 1 },
        { accountId: 'bank', type: 'EXPENSE', amount: 750_000, count: 1 },
        { accountId: 'bank', type: 'TRANSFER', amount: 200_000, count: 2 },
      ],
      [{ transferAccountId: 'cash', amount: 200_000, count: 2 }],
    );
    expect(flows.get('bank')).toEqual({
      income: 2_600_000,
      expense: 750_000,
      transferOut: 200_000,
      transferIn: 0,
      count: 4,
    });
    expect(flows.get('cash')).toEqual({ ...EMPTY_FLOWS, transferIn: 200_000, count: 2 });
  });
});

describe('withBalances', () => {
  it('un virement BIAT → Espèces ne change pas le total', () => {
    const accounts = [
      account('cash', { name: 'Espèces', sortOrder: 1, initialBalance: 50_000 }),
      account('bank', { name: 'BIAT', sortOrder: 0, initialBalance: 1_000_000 }),
      account('idle', { name: 'Vide', sortOrder: 2 }),
    ];
    const result = withBalances(
      accounts,
      [
        { accountId: 'bank', type: 'TRANSFER', amount: 100_000, count: 1 },
        { accountId: 'cash', type: 'EXPENSE', amount: 3_500, count: 1 },
      ],
      [{ transferAccountId: 'cash', amount: 100_000, count: 1 }],
    );
    expect(result.map((a) => a.id)).toEqual(['bank', 'cash', 'idle']);
    expect(result.map((a) => a.balance)).toEqual([900_000, 146_500, 0]);
    expect(result.map((a) => a.transactionCount)).toEqual([1, 2, 0]);
    expect(totalBalance(result)).toBe(1_046_500);
  });
});

describe('sortAccounts / totalBalance', () => {
  it('trie par sortOrder puis par nom', () => {
    const sorted = sortAccounts([
      account('b', { name: 'Banque', sortOrder: 1 }),
      account('a', { name: 'Argent', sortOrder: 1 }),
      account('c', { name: 'Carte', sortOrder: 0 }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(['c', 'a', 'b']);
  });

  it('exclut les comptes archivés par défaut', () => {
    const list = [
      { ...account('a'), balance: 100, transactionCount: 0 },
      { ...account('b', { archived: true }), balance: 50, transactionCount: 0 },
    ];
    expect(totalBalance(list)).toBe(100);
    expect(totalBalance(list, { includeArchived: true })).toBe(150);
  });
});
