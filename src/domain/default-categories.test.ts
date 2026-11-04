import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from './default-categories';

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe('DEFAULT_CATEGORIES', () => {
  it('contient exactement les catégories du contrat', () => {
    expect(DEFAULT_CATEGORIES.map((c) => [c.name, c.kind, c.group, c.icon])).toEqual([
      ['Courses', 'EXPENSE', 'NEEDS', 'ShoppingCart'],
      ['Restaurants', 'EXPENSE', 'WANTS', 'UtensilsCrossed'],
      ['Cafés', 'EXPENSE', 'WANTS', 'Coffee'],
      ['Transport', 'EXPENSE', 'NEEDS', 'Bus'],
      ['Carburant', 'EXPENSE', 'NEEDS', 'Fuel'],
      ['Loyer', 'EXPENSE', 'NEEDS', 'House'],
      ['Factures', 'EXPENSE', 'NEEDS', 'Zap'],
      ['Télécom', 'EXPENSE', 'NEEDS', 'Smartphone'],
      ['Santé', 'EXPENSE', 'NEEDS', 'HeartPulse'],
      ['Shopping', 'EXPENSE', 'WANTS', 'ShoppingBag'],
      ['Loisirs', 'EXPENSE', 'WANTS', 'Clapperboard'],
      ['Abonnements', 'EXPENSE', 'WANTS', 'Repeat'],
      ['Éducation', 'EXPENSE', 'NEEDS', 'GraduationCap'],
      ['Famille & cadeaux', 'EXPENSE', 'WANTS', 'Gift'],
      ['Épargne', 'EXPENSE', 'SAVINGS', 'PiggyBank'],
      ['Divers', 'EXPENSE', 'WANTS', 'Tag'],
      ['Salaire', 'INCOME', 'INCOME', 'Banknote'],
      ['Freelance', 'INCOME', 'INCOME', 'Briefcase'],
      ['Autres revenus', 'INCOME', 'INCOME', 'Coins'],
    ]);
    expect(DEFAULT_CATEGORIES.map((c) => c.sortOrder)).toEqual(DEFAULT_CATEGORIES.map((_, i) => i));
  });

  it('couleurs distinctes, valides et lisibles en clair comme en sombre', () => {
    const colors = DEFAULT_CATEGORIES.map((c) => c.color);
    expect(new Set(colors).size).toBe(colors.length);
    for (const color of colors) {
      expect(color).toMatch(/^#[0-9A-F]{6}$/i);
      expect(contrast(color, '#FFFFFF')).toBeGreaterThanOrEqual(3);
      expect(contrast(color, '#0F1216')).toBeGreaterThanOrEqual(3);
      expect(contrast(color, '#171B21')).toBeGreaterThanOrEqual(3);
    }
  });

  it('comptes par défaut : Espèces (CASH) et Banque (BANK)', () => {
    expect(DEFAULT_ACCOUNTS.map((a) => [a.name, a.type])).toEqual([
      ['Espèces', 'CASH'],
      ['Banque', 'BANK'],
    ]);
  });
});
