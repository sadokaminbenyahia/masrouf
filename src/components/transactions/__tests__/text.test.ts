import { describe, expect, it } from 'vitest';
import { describeTransaction, pluralize } from '../text';

const normalize = (s: string) => s.replace(/[  ]/g, ' ');

describe('describeTransaction', () => {
  it('nomme le libellé et le montant', () => {
    expect(normalize(describeTransaction({ label: 'Café', amount: 3_500 }, 'ajouté', false))).toBe(
      'Café · 3,500 DT ajouté',
    );
  });

  it('masque le montant en mode discret', () => {
    const text = describeTransaction({ label: 'Loyer', amount: 750_000 }, 'supprimé', true);
    expect(text).not.toMatch(/750/);
    expect(normalize(text)).toBe('Loyer · ••• DT supprimé');
  });

  it('libellé vide : « Transaction »', () => {
    expect(describeTransaction({ label: '  ', amount: 1_000 }, 'modifié', true)).toMatch(
      /^Transaction · /,
    );
  });
});

describe('pluralize', () => {
  it('accorde au pluriel au-delà de 1', () => {
    expect(pluralize(1, 'compte', 'comptes')).toBe('1 compte');
    expect(pluralize(3, 'compte', 'comptes')).toBe('3 comptes');
  });
});
