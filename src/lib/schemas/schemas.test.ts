import { expect, it } from 'vitest';
import { transactionPatchSchema, transactionInputSchema } from '@/lib/schemas/transactions';
import { accountPatchSchema } from '@/lib/schemas/accounts';
import { goalPatchSchema } from '@/lib/schemas/budgets';
it('patches sans défauts', () => {
  expect(transactionPatchSchema.parse({ label: 'x' })).toEqual({ label: 'x' });
  expect(accountPatchSchema.parse({ archived: true })).toEqual({ archived: true });
  expect(goalPatchSchema.parse({ name: 'x' })).toEqual({ name: 'x' });
  expect(
    transactionInputSchema.parse({
      accountId: 'a',
      type: 'EXPENSE',
      amount: 1,
      date: '2026-01-01',
      label: 'x',
    }).tags,
  ).toEqual([]);
});
