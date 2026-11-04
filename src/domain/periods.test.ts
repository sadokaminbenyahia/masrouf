import { describe, expect, it } from 'vitest';
import { PERIOD_LABELS, PERIOD_PRESETS, resolvePeriod } from './periods';

const today = '2026-11-04';

describe('resolvePeriod', () => {
  it.each([
    ['THIS_MONTH', '2026-11-01', '2026-11-30'],
    ['LAST_MONTH', '2026-10-01', '2026-10-31'],
    ['LAST_3_MONTHS', '2026-09-01', '2026-11-30'],
    ['LAST_6_MONTHS', '2026-06-01', '2026-11-30'],
    ['THIS_QUARTER', '2026-10-01', '2026-12-31'],
    ['THIS_YEAR', '2026-01-01', '2026-12-31'],
    ['LAST_12_MONTHS', '2025-12-01', '2026-11-30'],
  ] as const)('%s', (preset, from, to) => {
    expect(resolvePeriod(preset, today)).toEqual({ from, to });
  });

  it('CUSTOM utilise la plage fournie, sinon le mois courant', () => {
    expect(resolvePeriod('CUSTOM', today, { from: '2026-01-05', to: '2026-02-01' })).toEqual({
      from: '2026-01-05',
      to: '2026-02-01',
    });
    expect(resolvePeriod('CUSTOM', today)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });

  it('chaque preset a un libellé', () => {
    for (const p of PERIOD_PRESETS) expect(PERIOD_LABELS[p].length).toBeGreaterThan(0);
  });
});
