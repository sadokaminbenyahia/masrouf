import { describe, expect, it } from 'vitest';
import { computeImportHash, fnv1a64, normalizeForHash } from './hash';

describe('normalizeForHash', () => {
  it('minuscules, sans accents, sans références de 4 chiffres ou plus', () => {
    expect(normalizeForHash('PAIEMENT CB Café  Mrabet 004512')).toBe('paiement cb cafe mrabet');
    expect(normalizeForHash('Prélèvement SONEDE réf. 12345678')).toBe('prelevement sonede ref');
    expect(normalizeForHash('Louage 123')).toBe('louage 123');
    expect(normalizeForHash('  ---  ')).toBe('');
  });
});

describe('fnv1a64', () => {
  it('vecteurs de référence FNV-1a 64 bits', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });
});

describe('computeImportHash', () => {
  const base = { date: '2026-03-12', amount: 45_000, type: 'EXPENSE' as const, label: 'OOREDOO' };

  it('est stable malgré la casse, les accents et les références', () => {
    const h = computeImportHash(base);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(computeImportHash({ ...base, label: 'ooredoo 99887766' })).toBe(h);
    expect(computeImportHash({ ...base, label: '  Ooredoo ' })).toBe(h);
  });

  it('change avec la date, le montant, le type ou le libellé', () => {
    const h = computeImportHash(base);
    expect(computeImportHash({ ...base, date: '2026-03-13' })).not.toBe(h);
    expect(computeImportHash({ ...base, amount: 49_000 })).not.toBe(h);
    expect(computeImportHash({ ...base, type: 'INCOME' })).not.toBe(h);
    expect(computeImportHash({ ...base, label: 'Orange' })).not.toBe(h);
  });
});
