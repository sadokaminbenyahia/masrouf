import { describe, expect, it } from 'vitest';
import { formatNumber, formatPercent } from './format';

const NBSP = ' ';

describe('formatPercent', () => {
  it('entier par défaut, espace insécable avant « % »', () => {
    expect(formatPercent(0.123)).toBe(`12${NBSP}%`);
    expect(formatPercent(0)).toBe(`0${NBSP}%`);
    expect(formatPercent(1.5)).toBe(`150${NBSP}%`);
  });

  it('signe : « − » toujours, « + » si demandé, jamais sur zéro', () => {
    expect(formatPercent(-0.25)).toBe(`−25${NBSP}%`);
    expect(formatPercent(0.25, { signed: true })).toBe(`+25${NBSP}%`);
    expect(formatPercent(0.001, { signed: true })).toBe(`0${NBSP}%`);
    expect(formatPercent(-0.001)).toBe(`0${NBSP}%`);
  });

  it('décimales : 1, ou « auto » (une décimale sous 1 %)', () => {
    expect(formatPercent(0.1234, { decimals: 1 })).toBe(`12,3${NBSP}%`);
    expect(formatPercent(0.12, { decimals: 1 })).toBe(`12,0${NBSP}%`);
    expect(formatPercent(0.005, { decimals: 'auto' })).toBe(`0,5${NBSP}%`);
    expect(formatPercent(0.123, { decimals: 'auto' })).toBe(`12${NBSP}%`);
    expect(formatPercent(-0.25, { signed: true, decimals: 'auto' })).toBe(`−25${NBSP}%`);
  });

  it('valeur non finie : 0 %', () => {
    expect(formatPercent(Number.NaN)).toBe(`0${NBSP}%`);
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe(`0${NBSP}%`);
  });
});

describe('formatNumber', () => {
  it('séparateur de milliers insécable, arrondi, signe « − »', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1234)).toBe(`1${NBSP}234`);
    expect(formatNumber(1_234_567.6)).toBe(`1${NBSP}234${NBSP}568`);
    expect(formatNumber(-12_000)).toBe(`−12${NBSP}000`);
    expect(formatNumber(Number.NaN)).toBe('0');
  });
});
