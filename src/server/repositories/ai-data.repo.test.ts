import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []);
vi.mock('@/server/db', () => ({ prisma: { transaction: { findMany } } }));

const repo = await import('./ai-data.repo');
const { DataIntegrityError } = await import('./_shared');

const row = (id: string, date: string, type = 'EXPENSE') => ({
  id,
  date,
  amount: 1000,
  type,
  label: id,
  categoryId: null,
  accountId: 'a1',
  recurringId: null,
});

describe('ai-data.repo', () => {
  beforeEach(() => findMany.mockReset());

  it('listAiTransactions : plafond (plus récentes d’abord), puis ordre chronologique', async () => {
    findMany.mockResolvedValueOnce([row('t3', '2026-11-03'), row('t2', '2026-11-02')]);
    const out = await repo.listAiTransactions('u1', { from: '2026-01-01', to: '2026-12-31' }, 2);
    expect(out.map((t) => t.id)).toEqual(['t2', 't3']);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', date: { gte: '2026-01-01', lte: '2026-12-31' } },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 2,
      }),
    );
    await repo.listAiTransactions('u1', { from: '2026-01-01', to: '2026-12-31' });
    expect(findMany.mock.calls[1]?.[0]).toMatchObject({ take: repo.MAX_AI_TRANSACTIONS });
  });

  it('type inconnu en base : DataIntegrityError (jamais remplacé silencieusement)', async () => {
    findMany.mockResolvedValueOnce([row('t1', '2026-11-01', 'REFUND')]);
    await expect(
      repo.listAiTransactions('u1', { from: '2026-01-01', to: '2026-12-31' }),
    ).rejects.toBeInstanceOf(DataIntegrityError);
  });
});
