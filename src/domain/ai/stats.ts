// Propriétaire : agent J. Statistiques descriptives pures.
// Convention : sur un tableau vide, chaque fonction renvoie 0 (jamais NaN), pour que les
// algorithmes appelants n'aient pas à propager de NaN. Les appelants vérifient la taille
// de l'échantillon quand la distinction compte.

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Moyenne arithmétique (0 si vide). */
export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function sorted(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/** Quantile d'un tableau déjà trié, interpolation linéaire (type 7). */
export function quantileSorted(sortedValues: readonly number[], q: number): number {
  const n = sortedValues.length;
  if (n === 0) return 0;
  const p = Math.min(1, Math.max(0, q));
  const pos = (n - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sortedValues[lo] ?? 0;
  const b = sortedValues[hi] ?? a;
  return a + (b - a) * (pos - lo);
}

/** Quantile `q` ∈ [0, 1] avec interpolation linéaire entre rangs (0 si vide). */
export function quantile(values: readonly number[], q: number): number {
  return quantileSorted(sorted(values), q);
}

/** Médiane (0 si vide). */
export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

/** Écart absolu médian, non mis à l'échelle : médiane(|x − médiane(x)|) (0 si vide). */
export function mad(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

/** Écart type d'échantillon (n − 1) ; 0 si moins de 2 valeurs. */
export function stdDev(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const m = mean(values);
  let ss = 0;
  for (const v of values) ss += (v - m) * (v - m);
  return Math.sqrt(ss / (n - 1));
}

/** Coefficient de variation σ/|μ| (0 si vide ou de moyenne nulle). */
export function coefficientOfVariation(values: readonly number[]): number {
  const m = mean(values);
  return m === 0 ? 0 : stdDev(values) / Math.abs(m);
}

export interface LinearFit {
  slope: number;
  intercept: number;
  /** Écart type des résidus, √(SSE / (n − 2)) ; 0 si n ≤ 2 */
  residualStd: number;
}

/**
 * Moindres carrés ordinaires y = intercept + slope·x. Avec moins de 2 points ou des x
 * constants, la pente vaut 0 et l'ordonnée la moyenne des y.
 */
export function linearRegression(xs: readonly number[], ys: readonly number[]): LinearFit {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return { slope: 0, intercept: 0, residualStd: 0 };
  const x = xs.slice(0, n);
  const y = ys.slice(0, n);
  const mx = mean(x);
  const my = mean(y);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (x[i] ?? 0) - mx;
    sxx += dx * dx;
    sxy += dx * ((y[i] ?? 0) - my);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const r = (y[i] ?? 0) - (intercept + slope * (x[i] ?? 0));
    sse += r * r;
  }
  const residualStd = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  return { slope, intercept, residualStd };
}

/**
 * Moyenne pondérée exponentiellement d'une série ordonnée du plus ancien au plus récent :
 * la dernière valeur pèse 1, une valeur d'âge k pèse 0,5^(k / halfLife). 0 si vide.
 */
export function ewma(values: readonly number[], halfLife: number): number {
  const n = values.length;
  if (n === 0) return 0;
  const decay = halfLife > 0 ? Math.pow(0.5, 1 / halfLife) : 0;
  let weight = 1;
  let wsum = 0;
  let total = 0;
  for (let i = n - 1; i >= 0; i--) {
    total += weight * (values[i] ?? 0);
    wsum += weight;
    weight *= decay;
  }
  return wsum === 0 ? 0 : total / wsum;
}

/** Arrondi d'un nombre au multiple supérieur de `step` (step > 0). */
export function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/** Arrondi d'un nombre au multiple inférieur de `step` (step > 0). */
export function floorTo(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

/** Borne `value` dans [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
