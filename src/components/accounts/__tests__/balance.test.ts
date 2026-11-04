import { describe, expect, it } from 'vitest';
import { splitBalance, toSignedBalance, totalBalance } from '../balance';

describe('solde initial signé', () => {
  it('sépare montant et signe, et fait l’aller-retour', () => {
    expect(splitBalance(0)).toEqual({ amount: null, negative: false });
    expect(splitBalance(-250_000)).toEqual({ amount: 250_000, negative: true });
    expect(splitBalance(1_500)).toEqual({ amount: 1_500, negative: false });
    for (const m of [0, -250_000, 1_500]) {
      const s = splitBalance(m);
      expect(toSignedBalance(s.amount, s.negative)).toBe(m);
    }
    expect(toSignedBalance(null, true)).toBe(0);
  });

  it('additionne les comptes actifs uniquement', () => {
    expect(
      totalBalance([
        { balance: 1_000, archived: false },
        { balance: -300, archived: false },
        { balance: 99_999, archived: true },
      ]),
    ).toBe(700);
  });
});
