import { it } from 'vitest';
import { parseEntry } from './nl-entry';
import { DEFAULT_TEST_CATEGORIES } from './__fixtures__/categories';
import { NL_ACCOUNTS, NL_CASES, NL_TODAY } from './__fixtures__/nl-entries';
it('dbg', () => {
  for (const c of NL_CASES) {
    const r = parseEntry(c.text, { today: NL_TODAY, categories: DEFAULT_TEST_CATEGORIES, accounts: NL_ACCOUNTS, model: null });
    if (!r.ok) { console.log('FAIL', c.text); continue; }
    const e = r.entry; const cat = DEFAULT_TEST_CATEGORIES.find(x => x.id === e.categoryId)?.name;
    if (e.amount !== c.amount || e.date !== c.date || e.label !== c.label || e.type !== c.type || (c.category && cat !== c.category) || (c.accountId ?? null) !== e.accountId) console.log('MISMATCH', c.text, JSON.stringify(e), cat);
  }
});
