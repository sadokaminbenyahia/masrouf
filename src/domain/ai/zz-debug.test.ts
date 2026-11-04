import { it } from 'vitest';
import { detectSeries } from './recurring-detect';
import { cleanHistory } from './__fixtures__/series';
it('dbg', () => {
  for (const s of detectSeries(cleanHistory())) console.log('S', s.merchantKey, s.frequency, s.transactions.length, s.regularity.toFixed(2), s.cv.toFixed(3), s.transactions.map(t=>t.date.slice(5)+':'+t.amount).join(' '));
});
