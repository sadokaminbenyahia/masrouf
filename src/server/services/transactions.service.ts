// Propriétaire : agent A
import 'server-only';
import { transactionsToCsv } from '@/domain/csv/export';
import type { DateRange } from '@/domain/dates';
import { appError, err, ok, type AppError, type Result } from '@/domain/result';
import {
  categoryMismatchMessage,
  decideCategoryChange,
  isCategoryCompatible,
  normalizeTags,
  pageCount,
  pageWindow,
  totalsFromTypeSums,
} from '@/domain/transactions';
import type {
  CategorySource,
  Paginated,
  Transaction,
  TransactionTotals,
  TransactionType,
} from '@/domain/types';
import type {
  TransactionInputData,
  TransactionPatchData,
  TransactionQueryData,
  TransactionSnapshotData,
} from '@/lib/schemas/transactions';
import { today } from '@/server/clock';
import { withPrismaErrors } from '@/server/repositories/_shared';
import * as accountRepo from '@/server/repositories/account.repo';
import * as categoryRepo from '@/server/repositories/category.repo';
import * as recurringRepo from '@/server/repositories/recurring.repo';
import * as txRepo from '@/server/repositories/transaction.repo';
import {
  AUTO_CATEGORIZE_THRESHOLD,
  learnFromCorrection,
  predictCategory,
} from '@/server/services/ai.service';

export type TransactionPage = Paginated<Transaction> & { totals: TransactionTotals };

const notFound = (message = 'Transaction introuvable.') => err(appError('NOT_FOUND', message));
const validation = (field: string, message: string) =>
  err(appError('VALIDATION', message, { [field]: [message] }));

// ───────────────────────── Vérifications d'appartenance ─────────────────────────

/** Vérifie la forme d'un virement et l'appartenance des comptes. */
async function checkAccounts(
  userId: string,
  type: TransactionType,
  accountId: string,
  transferAccountId: string | null,
): Promise<Result<void>> {
  if (type === 'TRANSFER' && (transferAccountId === null || transferAccountId === accountId)) {
    return validation('transferAccountId', 'Choisissez un compte destinataire différent.');
  }
  const ids = transferAccountId === null ? [accountId] : [accountId, transferAccountId];
  const owned = await accountRepo.ownedAccountIds(userId, ids);
  if (!owned.has(accountId)) {
    return err(appError('NOT_FOUND', 'Compte introuvable.', { accountId: ['Compte introuvable.'] }));
  }
  if (transferAccountId !== null && !owned.has(transferAccountId)) {
    return err(
      appError('NOT_FOUND', 'Compte destinataire introuvable.', {
        transferAccountId: ['Compte introuvable.'],
      }),
    );
  }
  return ok(undefined);
}

/** Vérifie qu'une catégorie appartient à l'utilisateur et convient au type de transaction. */
async function checkCategory(
  userId: string,
  type: TransactionType,
  categoryId: string,
): Promise<Result<void>> {
  if (type === 'TRANSFER') return validation('categoryId', 'Un virement ne peut pas avoir de catégorie.');
  const category = await categoryRepo.findCategory(userId, categoryId);
  if (!category) {
    return err(appError('NOT_FOUND', 'Catégorie introuvable.', { categoryId: ['Catégorie introuvable.'] }));
  }
  const mismatch = categoryMismatchMessage(type, category.kind);
  return mismatch === null ? ok(undefined) : validation('categoryId', mismatch);
}

async function checkRecurring(userId: string, recurringId: string | null): Promise<Result<void>> {
  if (recurringId === null) return ok(undefined);
  return (await recurringRepo.findRecurring(userId, recurringId))
    ? ok(undefined)
    : notFound('Dépense récurrente introuvable.');
}

/**
 * Catégorie prédite par l'IA, appliquée si sa confiance atteint le seuil. Une erreur de l'IA
 * n'empêche pas la création : elle est journalisée et la transaction reste sans catégorie.
 */
async function predictedCategory(
  userId: string,
  input: { label: string; amount: number; type: 'EXPENSE' | 'INCOME' },
): Promise<{ categoryId: string; confidence: number } | null> {
  const r = await predictCategory(userId, input);
  if (!r.ok) {
    console.warn('[transactions] catégorisation automatique indisponible :', r.error.code, r.error.message);
    return null;
  }
  const p = r.value;
  if (p === null || p.confidence < AUTO_CATEGORIZE_THRESHOLD) return null;
  // Défense en profondeur : la catégorie prédite doit appartenir à l'utilisateur et au bon sens.
  const category = await categoryRepo.findCategory(userId, p.categoryId);
  if (!category || !isCategoryCompatible(input.type, category.kind)) return null;
  return { categoryId: category.id, confidence: p.confidence };
}

async function learn(
  userId: string,
  t: { label: string; amount: number; type: TransactionType; categoryId: string },
  previousCategoryId: string | null,
): Promise<Result<void>> {
  return learnFromCorrection(
    userId,
    { label: t.label, amount: t.amount, type: t.type, categoryId: t.categoryId },
    previousCategoryId,
  );
}

function snapshotOf(t: Transaction): TransactionSnapshotData {
  return {
    id: t.id,
    accountId: t.accountId,
    categoryId: t.categoryId,
    type: t.type,
    amount: t.amount,
    date: t.date,
    label: t.label,
    note: t.note,
    tags: t.tags,
    transferAccountId: t.transferAccountId,
    recurringId: t.recurringId,
  };
}

const emptyToNull = (s: string | null | undefined): string | null =>
  s === undefined || s === null || s.trim() === '' ? null : s.trim();

// ───────────────────────── Lecture ─────────────────────────

/** Pagination côté serveur + totaux du filtre courant. */
export async function listTransactions(
  userId: string,
  query: TransactionQueryData,
): Promise<Result<TransactionPage>> {
  const w = pageWindow(query.page, query.pageSize);
  const { items, total, sums } = await txRepo.findPage(userId, query, w);
  return ok({
    items,
    total,
    page: w.page,
    pageSize: w.pageSize,
    pageCount: pageCount(total, w.pageSize),
    totals: { ...totalsFromTypeSums(sums), count: total },
  });
}

export async function getTransaction(userId: string, id: string): Promise<Result<Transaction>> {
  const t = await txRepo.findTransaction(userId, id);
  return t ? ok(t) : notFound();
}

// ───────────────────────── Écriture ─────────────────────────

/** Si `categoryId` est undefined (et type ≠ TRANSFER), la catégorie est prédite par l'IA (categorySource = 'AI'). */
export async function createTransaction(
  userId: string,
  input: TransactionInputData,
): Promise<Result<Transaction>> {
  return withPrismaErrors(async () => {
    const type = input.type;
    const transferAccountId = type === 'TRANSFER' ? (input.transferAccountId ?? null) : null;
    const accounts = await checkAccounts(userId, type, input.accountId, transferAccountId);
    if (!accounts.ok) return accounts;

    let categoryId: string | null = null;
    let categorySource: CategorySource | null = null;
    let aiConfidence: number | null = null;
    if (type === 'TRANSFER') {
      if (input.categoryId) {
        return validation('categoryId', 'Un virement ne peut pas avoir de catégorie.');
      }
    } else if (input.categoryId === undefined) {
      const predicted = await predictedCategory(userId, {
        label: input.label,
        amount: input.amount,
        type,
      });
      if (predicted) {
        categoryId = predicted.categoryId;
        categorySource = 'AI';
        aiConfidence = predicted.confidence;
      }
    } else if (input.categoryId !== null) {
      const c = await checkCategory(userId, type, input.categoryId);
      if (!c.ok) return c;
      categoryId = input.categoryId;
      categorySource = 'USER';
    }

    return ok(
      await txRepo.createTransaction(userId, {
        accountId: input.accountId,
        categoryId,
        type,
        amount: input.amount,
        date: input.date,
        label: input.label.trim(),
        note: emptyToNull(input.note),
        transferAccountId,
        recurringId: null,
        importHash: null,
        categorySource,
        aiConfidence,
        tags: normalizeTags(input.tags),
      }),
    );
  });
}

/** Si la catégorie change, l'IA apprend la correction (categorySource = 'USER'). */
export async function updateTransaction(
  userId: string,
  id: string,
  patch: TransactionPatchData,
): Promise<Result<{ before: Transaction; after: Transaction }>> {
  return withPrismaErrors(async () => {
    const before = await txRepo.findTransaction(userId, id);
    if (!before) return notFound();

    const type = patch.type ?? before.type;
    const accountId = patch.accountId ?? before.accountId;
    const transferAccountId =
      type === 'TRANSFER'
        ? patch.transferAccountId !== undefined
          ? patch.transferAccountId
          : before.transferAccountId
        : null;
    const accounts = await checkAccounts(userId, type, accountId, transferAccountId);
    if (!accounts.ok) return accounts;

    const data: Parameters<typeof txRepo.updateTransaction>[2] = {};
    if (patch.type !== undefined) data.type = type;
    if (patch.accountId !== undefined) data.accountId = accountId;
    if (transferAccountId !== before.transferAccountId) data.transferAccountId = transferAccountId;
    if (patch.amount !== undefined) data.amount = patch.amount;
    if (patch.date !== undefined) data.date = patch.date;
    if (patch.label !== undefined) data.label = patch.label.trim();
    if (patch.note !== undefined) data.note = emptyToNull(patch.note);

    // Catégorie : explicite (validée), effacée pour un virement, ou effacée si le changement de
    // type la rend incompatible.
    let pendingLearn: { categoryId: string } | null = null;
    if (type === 'TRANSFER') {
      if (patch.categoryId) {
        return validation('categoryId', 'Un virement ne peut pas avoir de catégorie.');
      }
      if (before.categoryId !== null) {
        Object.assign(data, { categoryId: null, categorySource: null, aiConfidence: null });
      }
    } else if (patch.categoryId !== undefined) {
      if (patch.categoryId !== null) {
        const c = await checkCategory(userId, type, patch.categoryId);
        if (!c.ok) return c;
      }
      const decision = decideCategoryChange(before, patch.categoryId);
      if (decision.markAsUser) {
        Object.assign(data, {
          categoryId: patch.categoryId,
          categorySource: patch.categoryId === null ? null : 'USER',
          aiConfidence: null,
        });
      }
      if (decision.learn && patch.categoryId !== null) pendingLearn = { categoryId: patch.categoryId };
    } else if (type !== before.type && before.categoryId !== null) {
      const current = await categoryRepo.findCategory(userId, before.categoryId);
      if (!current || !isCategoryCompatible(type, current.kind)) {
        Object.assign(data, { categoryId: null, categorySource: null, aiConfidence: null });
      }
    }

    // Apprentissage AVANT l'écriture : si l'IA échoue, rien n'est modifié.
    if (pendingLearn) {
      const learned = await learn(
        userId,
        {
          label: data.label ?? before.label,
          amount: data.amount ?? before.amount,
          type,
          categoryId: pendingLearn.categoryId,
        },
        before.categoryId,
      );
      if (!learned.ok) return learned;
    }

    const tags = patch.tags === undefined ? undefined : normalizeTags(patch.tags);
    const after = await txRepo.updateTransaction(userId, id, data, tags);
    return ok({ before, after });
  });
}

/** Renvoie l'instantané nécessaire à « Annuler ». */
export async function deleteTransaction(
  userId: string,
  id: string,
): Promise<Result<TransactionSnapshotData>> {
  return withPrismaErrors(async () => {
    const t = await txRepo.findTransaction(userId, id);
    if (!t) return notFound();
    const count = await txRepo.deleteTransactions(userId, [id]);
    return count === 0 ? notFound() : ok(snapshotOf(t));
  });
}

export async function restoreTransaction(
  userId: string,
  snapshot: TransactionSnapshotData,
): Promise<Result<Transaction>> {
  return withPrismaErrors(
    async () => {
      if (await txRepo.transactionIdExists(snapshot.id)) {
        return err(appError('CONFLICT', 'Cette transaction existe déjà.'));
      }
      const type = snapshot.type;
      const transferAccountId = type === 'TRANSFER' ? (snapshot.transferAccountId ?? null) : null;
      const accounts = await checkAccounts(userId, type, snapshot.accountId, transferAccountId);
      if (!accounts.ok) return accounts;
      const categoryId = type === 'TRANSFER' ? null : (snapshot.categoryId ?? null);
      if (categoryId !== null) {
        const c = await checkCategory(userId, type, categoryId);
        if (!c.ok) return c;
      }
      const recurringId = snapshot.recurringId ?? null;
      const rec = await checkRecurring(userId, recurringId);
      if (!rec.ok) return rec;
      return ok(
        await txRepo.createTransaction(userId, {
          id: snapshot.id,
          accountId: snapshot.accountId,
          categoryId,
          type,
          amount: snapshot.amount,
          date: snapshot.date,
          label: snapshot.label.trim(),
          note: emptyToNull(snapshot.note),
          transferAccountId,
          recurringId,
          importHash: null,
          categorySource: categoryId === null ? null : 'USER',
          aiConfidence: null,
          tags: normalizeTags(snapshot.tags),
        }),
      );
    },
    { conflict: 'Cette transaction existe déjà.' },
  );
}

/** Copie une transaction (catégorie et tags compris) à la date donnée, par défaut aujourd'hui. */
export async function duplicateTransaction(
  userId: string,
  id: string,
  date?: string,
): Promise<Result<Transaction>> {
  return withPrismaErrors(async () => {
    const t = await txRepo.findTransaction(userId, id);
    if (!t) return notFound();
    const fromAi = t.categorySource === 'AI';
    return ok(
      await txRepo.createTransaction(userId, {
        accountId: t.accountId,
        categoryId: t.categoryId,
        type: t.type,
        amount: t.amount,
        date: date ?? today(),
        label: t.label,
        note: t.note,
        transferAccountId: t.transferAccountId,
        recurringId: null,
        importHash: null,
        categorySource: t.categoryId === null ? null : fromAi ? 'AI' : 'USER',
        aiConfidence: fromAi ? t.aiConfidence : null,
        tags: t.tags,
      }),
    );
  });
}

export async function bulkDeleteTransactions(
  userId: string,
  ids: string[],
): Promise<Result<TransactionSnapshotData[]>> {
  return withPrismaErrors(async () => {
    const found = await txRepo.findTransactionsByIds(userId, ids);
    if (found.length === 0) return notFound('Aucune transaction trouvée.');
    await txRepo.deleteTransactions(
      userId,
      found.map((t) => t.id),
    );
    return ok(found.map(snapshotOf));
  });
}

export async function bulkCategorize(
  userId: string,
  ids: string[],
  categoryId: string | null,
): Promise<Result<{ before: Transaction[]; after: Transaction[] }>> {
  return withPrismaErrors(async () => {
    const before = await txRepo.findTransactionsByIds(userId, ids);
    if (before.length === 0) return notFound('Aucune transaction trouvée.');
    if (categoryId !== null) {
      const category = await categoryRepo.findCategory(userId, categoryId);
      if (!category) return notFound('Catégorie introuvable.');
      const mismatched = before.filter((t) => !isCategoryCompatible(t.type, category.kind));
      if (mismatched.length > 0) {
        return err(
          appError(
            'VALIDATION',
            mismatched.some((t) => t.type === 'TRANSFER')
              ? 'Les virements ne peuvent pas recevoir de catégorie.'
              : `La catégorie « ${category.name} » ne convient pas à ${mismatched.length} transaction(s) sélectionnée(s).`,
          ),
        );
      }
    }
    const changed = before.filter((t) => decideCategoryChange(t, categoryId).markAsUser);
    if (changed.length === 0) return ok({ before, after: before });

    // Apprentissage AVANT l'écriture : si l'IA échoue, rien n'est modifié.
    if (categoryId !== null) {
      for (const t of changed) {
        if (!decideCategoryChange(t, categoryId).learn) continue;
        const learned: Result<void, AppError> = await learn(
          userId,
          { label: t.label, amount: t.amount, type: t.type, categoryId },
          t.categoryId,
        );
        if (!learned.ok) return learned;
      }
    }
    await txRepo.setCategory(
      userId,
      changed.map((t) => t.id),
      categoryId,
      categoryId === null ? null : 'USER',
    );
    const after = await txRepo.findTransactionsByIds(
      userId,
      before.map((t) => t.id),
    );
    return ok({ before, after });
  });
}

/** Lecture non paginée (≤ 20 000 lignes) pour l'IA et les agrégats. */
export async function getTransactionsInRange(
  userId: string,
  range: DateRange,
  filter?: { types?: TransactionType[]; categoryIds?: string[] },
): Promise<Result<Transaction[]>> {
  if (range.from > range.to) return validation('range', 'La date de début doit précéder la date de fin.');
  return ok(await txRepo.findInRange(userId, range, filter ?? {}));
}

/** Plafond de lignes d'un export CSV. */
const MAX_EXPORT_ROWS = 100_000;

/** CSV (séparateur « ; », UTF-8 avec BOM, montants « 12,500 »). */
export async function exportTransactionsCsv(
  userId: string,
  range?: Partial<DateRange>,
): Promise<Result<string>> {
  if (range?.from !== undefined && range.to !== undefined && range.from > range.to) {
    return validation('from', 'La date de début doit précéder la date de fin.');
  }
  const [rows, accounts, categories] = await Promise.all([
    txRepo.findInRange(userId, range ?? {}, {}, MAX_EXPORT_ROWS),
    accountRepo.listAccounts(userId, { includeArchived: true }),
    categoryRepo.listCategories(userId),
  ]);
  return ok(
    transactionsToCsv(rows, {
      accounts: new Map(accounts.map((a) => [a.id, a.name])),
      categories: new Map(categories.map((c) => [c.id, c.name])),
    }),
  );
}
