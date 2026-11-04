import { describe, expect, it } from 'vitest';
import {
  applyRatio,
  dinarsToMillimes,
  formatMoney,
  maskMoneyInText,
  isMillimes,
  millimesToDinars,
  millimesToInputString,
  parseAmountInput,
  parseMoneyTerm,
  safeRatio,
  signedAmount,
  sumMillimes,
} from './money';

const NBSP = ' ';
const MINUS = '−';

describe('formatMoney', () => {
  it('formate en dinars avec 3 décimales et séparateur de milliers insécable', () => {
    expect(formatMoney(1_234_500)).toBe(`1${NBSP}234,500${NBSP}DT`);
    expect(formatMoney(3500)).toBe(`3,500${NBSP}DT`);
    expect(formatMoney(5)).toBe(`0,005${NBSP}DT`);
    expect(formatMoney(0)).toBe(`0,000${NBSP}DT`);
  });

  it('gère le signe', () => {
    expect(formatMoney(-12_000)).toBe(`${MINUS}12,000${NBSP}DT`);
    expect(formatMoney(12_000, { sign: 'always' })).toBe(`+12,000${NBSP}DT`);
    expect(formatMoney(-12_000, { sign: 'always' })).toBe(`${MINUS}12,000${NBSP}DT`);
    expect(formatMoney(-12_000, { sign: 'never' })).toBe(`12,000${NBSP}DT`);
    expect(formatMoney(0, { sign: 'always' })).toBe(`0,000${NBSP}DT`);
  });

  it('arrondit au dinar avec decimals: 0', () => {
    expect(formatMoney(1_234_500, { decimals: 0 })).toBe(`1${NBSP}235${NBSP}DT`);
    expect(formatMoney(-499, { decimals: 0 })).toBe(`0${NBSP}DT`);
  });

  it('notation compacte', () => {
    expect(formatMoney(12_500_000, { compact: true })).toBe(`12,5${NBSP}k${NBSP}DT`);
    expect(formatMoney(2_000_000_000, { compact: true })).toBe(`2${NBSP}M${NBSP}DT`);
    expect(formatMoney(450_000, { compact: true })).toBe(`450${NBSP}DT`);
  });

  it('autres devises et masquage', () => {
    expect(formatMoney(1000, { currency: 'EUR' })).toBe(`1,000${NBSP}EUR`);
    expect(formatMoney(1000, { hideCurrency: true })).toBe('1,000');
  });
});

describe('parseMoneyTerm', () => {
  it.each([
    ['3,500', 3500],
    ['3.500', 3500],
    ['3,5', 3500],
    ['3.5', 3500],
    ['3,05', 3050],
    ['2400', 2_400_000],
    ['1 234,5', 1_234_500],
    [`1${NBSP}234`, 1_234_000],
    ['500 millimes', 500],
    ['500m', 500],
    ['12 dt', 12_000],
    ['12DT', 12_000],
    ['7 dinars', 7000],
    ['1.200', 1200],
  ])('%s → %i', (input, expected) => {
    expect(parseMoneyTerm(input)).toEqual({ ok: true, value: expected });
  });

  it('refuse les entrées invalides', () => {
    expect(parseMoneyTerm('abc').ok).toBe(false);
    expect(parseMoneyTerm('12 euros').ok).toBe(false);
    expect(parseMoneyTerm('1,5 millimes').ok).toBe(false);
    expect(parseMoneyTerm('99999999999999999999').ok).toBe(false);
    expect(parseMoneyTerm('99999999999999999999 millimes').ok).toBe(false);
  });
});

describe('parseAmountInput', () => {
  it('additionne et soustrait', () => {
    expect(parseAmountInput('12,5+3')).toEqual({ ok: true, value: 15_500 });
    expect(parseAmountInput('20 - 2,750')).toEqual({ ok: true, value: 17_250 });
    expect(parseAmountInput(' 45 ')).toEqual({ ok: true, value: 45_000 });
  });

  it('refuse vide, négatif, nul et syntaxe incomplète', () => {
    expect(parseAmountInput('').ok).toBe(false);
    expect(parseAmountInput('-5').ok).toBe(false);
    expect(parseAmountInput('5-5').ok).toBe(false);
    expect(parseAmountInput('5+').ok).toBe(false);
    expect(parseAmountInput('5+x').ok).toBe(false);
  });
});

describe('utilitaires', () => {
  it('conversions et sommes', () => {
    expect(dinarsToMillimes(3.5)).toBe(3500);
    expect(dinarsToMillimes(0.1 + 0.2)).toBe(300);
    expect(millimesToDinars(3500)).toBe(3.5);
    expect(sumMillimes([1, 2, 3])).toBe(6);
    expect(applyRatio(1001, 0.5)).toBe(501);
    expect(safeRatio(1, 0)).toBe(0);
    expect(safeRatio(1, 4)).toBe(0.25);
    expect(isMillimes(12)).toBe(true);
    expect(isMillimes(1.5)).toBe(false);
    expect(isMillimes('1')).toBe(false);
  });

  it('montant signé', () => {
    expect(signedAmount('EXPENSE', 500)).toBe(-500);
    expect(signedAmount('INCOME', 500)).toBe(500);
    expect(signedAmount('TRANSFER', 500)).toBe(0);
  });

  it('valeur de champ éditable', () => {
    expect(millimesToInputString(3500)).toBe('3,500');
    expect(millimesToInputString(3000)).toBe('3');
    expect(millimesToInputString(-1050)).toBe('-1,050');
  });
});

describe('maskMoneyInText (mode discret)', () => {
  const NB = ' ';
  it('masque toutes les sorties réelles de formatMoney', () => {
    const values = [0, 1, 999, 3_500, 1_234_500, -12_000, 2_600_000_000, 999_999_999];
    const variants = [
      (v: number) => formatMoney(v),
      (v: number) => formatMoney(v, { decimals: 0 }),
      (v: number) => formatMoney(v, { sign: 'always' }),
      (v: number) => formatMoney(v, { compact: true }),
      (v: number) => formatMoney(-v, { compact: true, decimals: 0 }),
      (v: number) => formatMoney(v, { currency: 'EUR' }),
    ];
    for (const v of values) {
      for (const f of variants) {
        const formatted = f(v);
        const text = `Vous avez dépensé ${formatted} ce mois-ci (12 % de plus).`;
        const masked = maskMoneyInText(text);
        expect(masked, formatted).not.toContain(formatted);
        expect(masked).toMatch(/^Vous avez dépensé •••\u00a0(DT|EUR) ce mois-ci \(12 % de plus\)\.$/);
      }
    }
  });

  it('plusieurs montants ; les autres nombres sont conservés', () => {
    const t = `Courses : ${formatMoney(450_000)} sur ${formatMoney(500_000, { decimals: 0 })} (90${NB}%), le 12 mars 2026.`;
    expect(maskMoneyInText(t)).toBe(`Courses : •••${NB}DT sur •••${NB}DT (90${NB}%), le 12 mars 2026.`);
    expect(maskMoneyInText('3 mois, 12 jours, 2026')).toBe('3 mois, 12 jours, 2026');
    expect(maskMoneyInText('le 12 DTs, 3 dt')).toBe('le 12 DTs, 3 dt');
  });
});
