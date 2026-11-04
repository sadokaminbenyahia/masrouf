/**
 * Solde initial signé ↔ (montant positif + interrupteur « solde négatif »). Fonctions pures.
 */
import type { Millimes } from '@/domain/money';

export function splitBalance(m: Millimes): { amount: Millimes | null; negative: boolean } {
  if (m === 0) return { amount: null, negative: false };
  return { amount: Math.abs(m), negative: m < 0 };
}

export function toSignedBalance(amount: Millimes | null, negative: boolean): Millimes {
  if (amount === null || amount === 0) return 0;
  return negative ? -Math.abs(amount) : Math.abs(amount);
}

/** Somme des soldes des comptes actifs. */
export function totalBalance(
  accounts: readonly { balance: Millimes; archived: boolean }[],
): Millimes {
  let total = 0;
  for (const a of accounts) if (!a.archived) total += a.balance;
  return total;
}
