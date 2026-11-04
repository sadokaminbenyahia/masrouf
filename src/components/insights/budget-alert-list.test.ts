import { describe, expect, it } from 'vitest';
import { budgetValueText } from './budget-alert-list';

const exceeded = {
  spent: 112_000,
  ratio: 1.12,
  level: 'EXCEEDED' as const,
  projectedOverrun: false,
  budget: { amount: 100_000 },
};

describe('budgetValueText (aria-valuetext des barres de budget)', () => {
  it('donne les montants réels et le niveau, au-delà de 100 %', () => {
    const text = budgetValueText(exceeded, false);
    expect(text.replace(/[  ]/g, ' ')).toBe('112 DT sur 100 DT, dépassé');
  });

  it('masque les montants en mode discret', () => {
    const text = budgetValueText(exceeded, true);
    expect(text).not.toMatch(/DT/);
    expect(text.replace(/[\u00a0\u202f]/g, ' ')).toBe('112 % du budget utilisé, dépassé');
  });

  it('signale un dépassement prévu', () => {
    const text = budgetValueText(
      { ...exceeded, spent: 20_000, ratio: 0.2, level: 'OK', projectedOverrun: true },
      false,
    );
    expect(text).toContain('dépassement prévu');
  });
});
