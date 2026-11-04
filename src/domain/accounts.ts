/**
 * Comptes : calcul des soldes à partir d'agrégats (pur).
 *
 * Solde = initial + Σrevenus − Σdépenses − Σvirements sortants + Σvirements entrants.
 * Les agrégats viennent de requêtes `groupBy` (on ne charge jamais toutes les transactions).
 */
import type { Millimes } from './money';
import type { Account, AccountWithBalance, TransactionType } from './types';

/** Somme des montants par (compte, type), telle que renvoyée par un `groupBy`. */
export interface AccountTypeSum {
  accountId: string;
  type: TransactionType;
  amount: Millimes;
  count: number;
}

/** Somme des virements ENTRANTS par compte destinataire. */
export interface IncomingTransferSum {
  transferAccountId: string;
  amount: Millimes;
  count: number;
}

export interface AccountFlows {
  income: Millimes;
  expense: Millimes;
  transferOut: Millimes;
  transferIn: Millimes;
  /** Transactions touchant le compte (source ou destination d'un virement) */
  count: number;
}

export const EMPTY_FLOWS: AccountFlows = {
  income: 0,
  expense: 0,
  transferOut: 0,
  transferIn: 0,
  count: 0,
};

export function computeBalance(initialBalance: Millimes, flows: AccountFlows): Millimes {
  return initialBalance + flows.income - flows.expense - flows.transferOut + flows.transferIn;
}

/** Regroupe les agrégats SQL en flux par compte. */
export function flowsByAccount(
  sums: readonly AccountTypeSum[],
  incoming: readonly IncomingTransferSum[],
): Map<string, AccountFlows> {
  const out = new Map<string, AccountFlows>();
  const get = (id: string): AccountFlows => {
    let f = out.get(id);
    if (!f) {
      f = { ...EMPTY_FLOWS };
      out.set(id, f);
    }
    return f;
  };
  for (const s of sums) {
    const f = get(s.accountId);
    if (s.type === 'INCOME') f.income += s.amount;
    else if (s.type === 'EXPENSE') f.expense += s.amount;
    else f.transferOut += s.amount;
    f.count += s.count;
  }
  for (const s of incoming) {
    const f = get(s.transferAccountId);
    f.transferIn += s.amount;
    f.count += s.count;
  }
  return out;
}

/** Combine les comptes et les agrégats → comptes avec solde, triés par `sortOrder` puis nom. */
export function withBalances(
  accounts: readonly Account[],
  sums: readonly AccountTypeSum[],
  incoming: readonly IncomingTransferSum[],
): AccountWithBalance[] {
  const flows = flowsByAccount(sums, incoming);
  return sortAccounts(
    accounts.map((a) => {
      const f = flows.get(a.id) ?? EMPTY_FLOWS;
      return { ...a, balance: computeBalance(a.initialBalance, f), transactionCount: f.count };
    }),
  );
}

export function sortAccounts<T extends Pick<Account, 'sortOrder' | 'name'>>(accounts: T[]): T[] {
  return [...accounts].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fr'),
  );
}

/** Solde total des comptes (par défaut : non archivés uniquement). */
export function totalBalance(
  accounts: readonly AccountWithBalance[],
  opts: { includeArchived?: boolean } = {},
): Millimes {
  let total = 0;
  for (const a of accounts) if (opts.includeArchived === true || !a.archived) total += a.balance;
  return total;
}
