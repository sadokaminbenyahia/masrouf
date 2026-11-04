import { describe, expect, it } from 'vitest';
import {
  cleanLabel,
  charTrigrams,
  foldText,
  jaccard,
  merchantKey,
  nameKey,
  normalizeLabel,
  stem,
  tokenize,
} from './text';

describe('normalizeLabel', () => {
  it.each([
    ['PAIEMENT CB CARREFOUR LA MARSA 12/03', 'carrefour la marsa'],
    ['ACHAT TPE MONOPRIX LAC 2 14:32', 'monoprix lac 2'],
    ['PRLV STEG REF 00123456', 'steg ref'],
    ['VIR RECU SALAIRE', 'salaire'],
    ['Carte XXXX1234 Zara', 'carte zara'],
    ['CB **5678 SHELL', 'shell'],
    ['Pâtisserie Masmoudi SARL', 'patisserie masmoudi'],
    ['STE GEANT ETS', 'geant'],
    ['Café 12h30', 'cafe'],
    ['RETRAIT DAB 0045', 'retrait dab'],
    ['Œuf', 'oeuf'],
    ['', ''],
  ])('« %s » → « %s »', (raw, expected) => {
    expect(normalizeLabel(raw)).toBe(expected);
  });

  it('normalise l’arabe (tashkeel, alif, ta marbuta)', () => {
    expect(normalizeLabel('قَهْوَة')).toBe('قهوه');
    expect(normalizeLabel('أكل')).toBe('اكل');
  });
});

describe('tokenize', () => {
  it('retire les mots vides et les tokens d’un caractère', () => {
    expect(tokenize('Courses de la semaine à Carrefour')).toEqual([
      'courses',
      'semaine',
      'carrefour',
    ]);
    expect(tokenize('Plan B')).toEqual(['plan']);
    expect(tokenize('')).toEqual([]);
  });
});

describe('merchantKey', () => {
  it.each([
    ['PAIEMENT CB CARREFOUR LA MARSA 12/03', 'carrefour'],
    ['MONOPRIX LAC 2', 'monoprix'],
    ['Carrefour Market Ennasr', 'carrefour market'],
    ['OOREDOO INTERNET 03/2026', 'ooredoo internet'],
    ['Baguette & Baguette', 'baguette baguette'],
    ['Tunis', 'tunis'],
    ['Taxi 12', 'taxi'],
    ['', ''],
  ])('« %s » → « %s »', (raw, expected) => {
    expect(merchantKey(raw)).toBe(expected);
  });
});

describe('utilitaires', () => {
  it('foldText, nameKey, stem', () => {
    expect(foldText('Éducation’s')).toBe("education's");
    expect(nameKey('Famille & cadeaux')).toBe('famille cadeaux');
    expect(stem('cafes')).toBe('cafe');
    expect(stem('bus')).toBe('bus');
  });

  it('charTrigrams et jaccard', () => {
    expect(charTrigrams('mg')).toEqual(['#mg', 'mg#']);
    expect(charTrigrams('')).toEqual([]);
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
    expect(jaccard([], [])).toBe(0);
  });
});

describe('cleanLabel (libellé lisible à l’import)', () => {
  it.each([
    ['PAIEMENT CB MONOPRIX MENZAH 02/11', 'Monoprix Menzah'],
    ['ACHAT CB CARREFOUR LA MARSA 12/03/2026 CARTE XXXX1234', 'Carrefour La Marsa'],
    ['PRLV SEPA OOREDOO TUNISIE REF:123456', 'Ooredoo Tunisie'],
    ['VIR RECU SALAIRE OCTOBRE 2026', 'Salaire Octobre 2026'],
    ["PAIEMENT TPE STE AZIZA SARL L'AOUINA", "Aziza l'Aouina"],
    ['CB*NETFLIX.COM 1234567', 'Netflix.com'],
    ['AGIL STATION 14:32 N° 778899', 'Agil Station'],
    ['STEG FACT 2026-10', 'Steg Fact'],
    ['Café des Délices', 'Café des Délices'],
    // Tout serait retiré : on garde les mots d'origine.
    ['RETRAIT DAB 12/03', 'Retrait Dab'],
    ['12/03', '12/03'],
  ])('« %s » → « %s »', (raw, expected) => {
    expect(cleanLabel(raw)).toBe(expected);
  });
});
