import { describe, expect, it } from 'vitest';
import {
  ceilTo,
  clamp,
  coefficientOfVariation,
  ewma,
  floorTo,
  linearRegression,
  mad,
  mean,
  median,
  quantile,
  stdDev,
  sum,
} from './stats';

describe('stats', () => {
  it('renvoie 0 sur un tableau vide', () => {
    for (const f of [sum, mean, median, mad, stdDev, coefficientOfVariation]) expect(f([])).toBe(0);
    expect(quantile([], 0.7)).toBe(0);
    expect(ewma([], 30)).toBe(0);
    expect(linearRegression([], [])).toEqual({ slope: 0, intercept: 0, residualStd: 0 });
  });

  it('moyenne, médiane, MAD', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(mad([1, 1, 2, 2, 4, 6, 9])).toBe(1);
  });

  it('quantile avec interpolation linéaire', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.7)).toBeCloseTo(3.8);
    expect(quantile([10], 0.3)).toBe(10);
    expect(quantile([1, 2], 2)).toBe(2);
    expect(quantile([1, 2], -1)).toBe(1);
  });

  it('écart type d’échantillon et coefficient de variation', () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(stdDev([3])).toBe(0);
    expect(coefficientOfVariation([10, 10])).toBe(0);
    expect(coefficientOfVariation([0, 0])).toBe(0);
  });

  it('régression linéaire', () => {
    const fit = linearRegression([0, 1, 2, 3], [1, 3, 5, 7]);
    expect(fit.slope).toBeCloseTo(2);
    expect(fit.intercept).toBeCloseTo(1);
    expect(fit.residualStd).toBeCloseTo(0);
    expect(linearRegression([2, 2], [1, 3])).toMatchObject({ slope: 0, intercept: 2 });
    const noisy = linearRegression([0, 1, 2, 3], [0, 2, 1, 3]);
    expect(noisy.residualStd).toBeGreaterThan(0);
  });

  it('moyenne exponentielle (demi-vie)', () => {
    expect(ewma([5, 5, 5], 10)).toBe(5);
    // demi-vie 1 : poids 0,5 pour l'avant-dernière valeur
    expect(ewma([0, 3], 1)).toBeCloseTo(2);
    expect(ewma([1, 9], 0)).toBe(9);
  });

  it('arrondis et bornes', () => {
    expect(ceilTo(12_001, 5000)).toBe(15_000);
    expect(floorTo(14_999, 5000)).toBe(10_000);
    expect(clamp(5, 0, 3)).toBe(3);
  });
});
