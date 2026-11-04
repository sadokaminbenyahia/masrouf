// Propriétaire : agent A
import 'server-only';
import { addMonthsYM, monthEnd, monthOf, monthStart, type ISODate } from '@/domain/dates';
import { applyContribution, completionDate, computeGoalProgress } from '@/domain/goals';
import { USER_LIMITS } from '@/domain/limits';
import { appError, err, ok, type Result } from '@/domain/result';
import { totalsFromTypeSums } from '@/domain/transactions';
import type { Goal, GoalProgress } from '@/domain/types';
import type { GoalInputData, GoalPatchData } from '@/lib/schemas/budgets';
import { today } from '@/server/clock';
import { withPrismaErrors } from '@/server/repositories/_shared';
import * as goalRepo from '@/server/repositories/goal.repo';
import * as txRepo from '@/server/repositories/transaction.repo';

const notFound = () => err(appError('NOT_FOUND', 'Objectif introuvable.'));
/** Mois complets servant à estimer la capacité d'épargne. */
const CAPACITY_MONTHS = 3;

/**
 * Capacité d'épargne mensuelle : (revenus − dépenses) moyens des 3 derniers mois complets,
 * virements exclus. null s'il n'y a aucun revenu sur la période (capacité inconnue).
 */
async function monthlyCapacity(userId: string, day: ISODate): Promise<number | null> {
  const last = addMonthsYM(monthOf(day), -1);
  const first = addMonthsYM(last, -(CAPACITY_MONTHS - 1));
  const totals = totalsFromTypeSums(
    await txRepo.sumByType(userId, { from: monthStart(first), to: monthEnd(last) }),
  );
  if (totals.income <= 0) return null;
  return Math.round(totals.net / CAPACITY_MONTHS);
}

async function progressOf(userId: string, goals: readonly Goal[]): Promise<GoalProgress[]> {
  const day = today();
  const capacity = goals.length > 0 ? await monthlyCapacity(userId, day) : null;
  return goals.map((g) => computeGoalProgress(g, day, { monthlyCapacity: capacity }));
}

async function oneProgress(userId: string, goal: Goal): Promise<GoalProgress> {
  const [p] = await progressOf(userId, [goal]);
  return p ?? computeGoalProgress(goal, today());
}

export async function listGoals(userId: string): Promise<Result<GoalProgress[]>> {
  return ok(await progressOf(userId, await goalRepo.listGoals(userId)));
}

export async function createGoal(
  userId: string,
  input: GoalInputData,
): Promise<Result<GoalProgress>> {
  return withPrismaErrors(async () => {
    if ((await goalRepo.countGoals(userId)) >= USER_LIMITS.goals) {
      return err(
        appError(
          'CONFLICT',
          `Vous avez atteint le maximum de ${USER_LIMITS.goals} objectifs. Supprimez un objectif terminé pour en créer un nouveau.`,
        ),
      );
    }
    const goal = await goalRepo.createGoal(userId, {
      name: input.name.trim(),
      targetAmount: input.targetAmount,
      savedAmount: input.savedAmount,
      targetDate: input.targetDate ?? null,
      icon: input.icon,
      color: input.color,
      completedAt: input.savedAmount >= input.targetAmount ? new Date() : null,
    });
    return ok(await oneProgress(userId, goal));
  });
}

export async function updateGoal(
  userId: string,
  id: string,
  patch: GoalPatchData,
): Promise<Result<GoalProgress>> {
  return withPrismaErrors(async () => {
    const current = await goalRepo.findGoal(userId, id);
    if (!current) return notFound();
    const data: Parameters<typeof goalRepo.updateGoal>[2] = {};
    if (patch.name !== undefined) data.name = patch.name.trim();
    if (patch.targetAmount !== undefined) data.targetAmount = patch.targetAmount;
    if (patch.savedAmount !== undefined) data.savedAmount = patch.savedAmount;
    if (patch.targetDate !== undefined) data.targetDate = patch.targetDate;
    if (patch.icon !== undefined) data.icon = patch.icon;
    if (patch.color !== undefined) data.color = patch.color;
    const completedAt = completionDate(
      data.savedAmount ?? current.savedAmount,
      data.targetAmount ?? current.targetAmount,
      current.completedAt,
      new Date().toISOString(),
    );
    data.completedAt = completedAt === null ? null : new Date(completedAt);
    const goal = await goalRepo.updateGoal(userId, id, data);
    return goal ? ok(await oneProgress(userId, goal)) : notFound();
  });
}

/** Renvoie l'objectif supprimé (pour « Annuler »). */
export async function deleteGoal(userId: string, id: string): Promise<Result<Goal>> {
  return withPrismaErrors(async () => {
    const goal = await goalRepo.findGoal(userId, id);
    if (!goal) return notFound();
    return (await goalRepo.deleteGoal(userId, id)) ? ok(goal) : notFound();
  });
}

/** Versement (>0) ou retrait (<0) ; marque completedAt quand la cible est atteinte. */
export async function contributeToGoal(
  userId: string,
  id: string,
  amount: number,
): Promise<Result<GoalProgress>> {
  return withPrismaErrors(async () => {
    // Verrou optimiste : on réessaie si une autre écriture a modifié le montant entre-temps.
    for (let attempt = 0; attempt < 3; attempt++) {
      const goal = await goalRepo.findGoal(userId, id);
      if (!goal) return notFound();
      const next = applyContribution(goal, amount, new Date().toISOString());
      const written = await goalRepo.compareAndSetSaved(userId, id, goal.savedAmount, {
        savedAmount: next.savedAmount,
        completedAt: next.completedAt === null ? null : new Date(next.completedAt),
      });
      if (written) {
        return ok(await oneProgress(userId, { ...goal, ...next }));
      }
    }
    return err(appError('CONFLICT', 'L’objectif a été modifié en même temps. Réessayez.'));
  });
}

export async function reorderGoals(userId: string, ids: string[]): Promise<Result<void>> {
  return withPrismaErrors(async () => {
    const owned = new Set((await goalRepo.listGoals(userId)).map((g) => g.id));
    if (!ids.every((id) => owned.has(id))) return notFound();
    await goalRepo.reorderGoals(userId, ids);
    return ok(undefined);
  });
}
