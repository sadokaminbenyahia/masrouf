import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeImportHash } from '@/domain/csv/hash';
import type { TransactionType } from '@/domain/types';

interface Flow {
  date: string;
  amount: number;
  type: TransactionType;
  label: string;
  accountId: string;
}
const flows: Flow[] = [];
const created: { label: string; importHash: string | null }[][] = [];

vi.mock('@/server/db', () => ({
  prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn({}) },
}));
vi.mock('@/server/repositories/account.repo', () => ({
  findAccount: vi.fn(async (_u: string, id: string) => (id === 'acc_1' ? { id } : null)),
}));
vi.mock('@/server/repositories/category.repo', () => ({
  listCategories: vi.fn(async () => []),
  findCategoriesByIds: vi.fn(async () => new Map()),
}));
vi.mock('@/server/repositories/transaction.repo', () => ({
  existingImportHashes: vi.fn(async () => new Set<string>()),
  findFlowsForDuplicates: vi.fn(async () => flows),
  createManyTransactions: vi.fn(
    async (_u: string, rows: { label: string; importHash: string | null }[]) => {
      created.push(rows);
      return rows.length;
    },
  ),
}));
vi.mock('@/server/services/ai.service', () => ({
  predictCategories: vi.fn(async (_u: string, inputs: unknown[]) => ({
    ok: true,
    value: inputs.map(() => null),
  })),
  retrainCategorizer: vi.fn(async () => ({ ok: true, value: { samples: 0 } })),
}));

const svc = await import('./import.service');

const row = (index: number, date: string, label: string, amount = 45_000) => ({
  index,
  date,
  label,
  amount,
  type: 'EXPENSE' as const,
});

describe('import.service', () => {
  beforeEach(() => {
    flows.length = 0;
    created.length = 0;
  });

  it('doublon POSSIBLE : même compte, montant et type à ±2 jours, libellé différent', async () => {
    flows.push(
      {
        date: '2026-11-02',
        amount: 45_000,
        type: 'EXPENSE',
        label: 'Monoprix',
        accountId: 'acc_1',
      },
      { date: '2026-11-10', amount: 45_000, type: 'EXPENSE', label: 'Aziza', accountId: 'acc_2' },
    );
    const r = await svc.previewImport('u1', {
      accountId: 'acc_1',
      rows: [
        row(0, '2026-11-04', 'PAIEMENT CB MONOPRIX MENZAH 04/11'),
        row(1, '2026-11-05', 'MAGASIN GENERAL'),
        row(2, '2026-11-10', 'CARREFOUR'), // même montant, mais autre compte
        row(3, '2026-11-02', 'Monoprix'), // même libellé, même jour : EXISTING
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((x) => x.duplicate)).toEqual(['POSSIBLE', 'NONE', 'NONE', 'EXISTING']);
    expect(r.value[0]?.suggestedLabel).toBe('Monoprix Menzah');
  });

  it('commit : empreinte calculée sur le libellé bancaire d’origine si fourni', async () => {
    const raw = 'PAIEMENT CB MONOPRIX MENZAH 04/11';
    const r = await svc.commitImport('u1', {
      accountId: 'acc_1',
      rows: [
        {
          ...row(0, '2026-11-04', 'Monoprix Menzah'),
          originalLabel: raw,
          categoryId: null,
          categoryFromAI: false,
        },
      ],
    });
    expect(r).toEqual({ ok: true, value: { created: 1, skipped: 0 } });
    expect(created[0]?.[0]).toMatchObject({
      label: 'Monoprix Menzah',
      importHash: computeImportHash({ ...row(0, '2026-11-04', raw) }),
    });
  });
});
