// Propriétaire : agent A
import 'server-only';
import type { ISODate } from '@/domain/dates';
import { dueOccurrences, firstOccurrenceOnOrAfter, sortRules } from '@/domain/recurring';
import { appError, err, ok, type Result } from '@/domain/result';
import { categoryMismatchMessage } from '@/domain/transactions';
import type { RecurringRule } from '@/domain/types';
import type { RecurringInputData, RecurringPatchData } from '@/lib/schemas/recurring';
import { today } from '@/server/clock';
import { withPrismaErrors } from '@/server/repositories/_shared';
import * as accountRepo from '@/server/repositories/account.repo';
import * as categoryRepo from '@/server/repositories/category.repo';
import * as recurringRepo from '@/server/repositories/recurring.repo';

const notFound = () => err(appError('NOT_FOUND', 'Dépense récurrente introuvable.'));

async function checkRefs(
  userId: string,
  type: 'EXPENSE' | 'INCOME',
  accountId: string | undefined,
  categoryId: string | null | undefined,
): Promise<Result<void>> {
  if (accountId !== undefined && !(await accountRepo.findAccount(userId, accountId))) {
    return err(
      appError('NOT_FOUND', 'Compte introuvable.', { accountId: ['Compte introuvable.'] }),
    );
  }
  if (categoryId !== undefined && categoryId !== null) {
    const c = await categoryRepo.findCategory(userId, categoryId);
    if (!c) {
      return err(
        appError('NOT_FOUND', 'Catégorie introuvable.', { categoryId: ['Catégorie introuvable.'] }),
      );
    }
    const mismatch = categoryMismatchMessage(type, c.kind);
    if (mismatch !== null) return err(appError('VALIDATION', mismatch, { categoryId: [mismatch] }));
  }
  return ok(undefined);
}

export async function listRecurring(userId: string): Promise<Result<RecurringRule[]>> {
  return ok(sortRules(await recurringRepo.listRecurring(userId)));
}

/**
 * Crée une règle. La première échéance est la première date ≥ aujourd'hui : une règle créée
 * avec une date de début passée ne recrée pas l'historique (déjà saisi ou importé).
 */
export async function createRecurring(
  userId: string,
  input: RecurringInputData,
): Promise<Result<RecurringRule>> {
  return withPrismaErrors(async () => {
    const refs = await checkRefs(userId, input.type, input.accountId, input.categoryId);
    if (!refs.ok) return refs;
    const endDate = input.endDate ?? null;
    const nextDate = firstOccurrenceOnOrAfter(input, today());
    return ok(
      await recurringRepo.createRecurring(userId, {
        accountId: input.accountId,
        categoryId: input.categoryId ?? null,
        type: input.type,
        amount: input.amount,
        label: input.label.trim(),
        frequency: input.frequency,
        startDate: input.startDate,
        nextDate,
        endDate,
        active: endDate === null || nextDate <= endDate,
        autoCreate: input.autoCreate,
      }),
    );
  });
}

export async function updateRecurring(
  userId: string,
  id: string,
  patch: RecurringPatchData,
): Promise<Result<RecurringRule>> {
  return withPrismaErrors(async () => {
    const current = await recurringRepo.findRecurring(userId, id);
    if (!current) return notFound();
    const refs = await checkRefs(userId, current.type, patch.accountId, patch.categoryId);
    if (!refs.ok) return refs;
    const endDate = patch.endDate !== undefined ? patch.endDate : current.endDate;
    if (endDate !== null && endDate < current.startDate) {
      const message = 'La date de fin doit suivre la date de début.';
      return err(appError('VALIDATION', message, { endDate: [message] }));
    }
    const data: Parameters<typeof recurringRepo.updateRecurring>[2] = {};
    if (patch.accountId !== undefined) data.accountId = patch.accountId;
    if (patch.categoryId !== undefined) data.categoryId = patch.categoryId;
    if (patch.amount !== undefined) data.amount = patch.amount;
    if (patch.label !== undefined) data.label = patch.label.trim();
    if (patch.frequency !== undefined) data.frequency = patch.frequency;
    if (patch.nextDate !== undefined) data.nextDate = patch.nextDate;
    if (patch.endDate !== undefined) data.endDate = patch.endDate;
    if (patch.active !== undefined) data.active = patch.active;
    if (patch.autoCreate !== undefined) data.autoCreate = patch.autoCreate;
    const updated = await recurringRepo.updateRecurring(userId, id, data);
    return updated ? ok(updated) : notFound();
  });
}

/** Les transactions déjà créées sont conservées (elles perdent simplement leur lien). */
export async function deleteRecurring(userId: string, id: string): Promise<Result<{ id: string }>> {
  return withPrismaErrors(async () =>
    (await recurringRepo.deleteRecurring(userId, id)) ? ok({ id }) : notFound(),
  );
}

/** Crée les transactions des échéances ≤ today (autoCreate) et avance nextDate. Idempotent. */
export async function materializeDueRecurring(
  userId: string,
  today: ISODate,
): Promise<Result<{ created: number }>> {
  return withPrismaErrors(async () => {
    const due = await recurringRepo.listDueRules(userId, today);
    if (due.length === 0) return ok({ created: 0 });
    const plans = due
      .map((rule) => ({ rule, ...dueOccurrences(rule, today) }))
      .filter((p) => p.dates.length > 0);
    return ok({ created: await recurringRepo.materializeRules(userId, plans) });
  });
}
