import 'server-only';
import type { User } from '@prisma/client';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/domain/default-categories';
import type { UserProfile } from '@/domain/types';
import { prisma } from '@/server/db';
import type { Db } from './_shared';

export function toUserProfile(
  row: Pick<User, 'id' | 'email' | 'name' | 'currency' | 'onboardedAt'>,
): UserProfile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    currency: row.currency,
    onboarded: row.onboardedAt !== null,
  };
}

const PROFILE_SELECT = {
  id: true,
  email: true,
  name: true,
  currency: true,
  onboardedAt: true,
} as const;

export async function findProfile(userId: string): Promise<UserProfile | null> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
  return row ? toUserProfile(row) : null;
}

/** Met à jour le profil ; null si l'utilisateur n'existe pas. */
export async function updateUser(
  userId: string,
  data: { name?: string; onboardedAt?: Date | null },
): Promise<UserProfile | null> {
  const { count } = await prisma.user.updateMany({ where: { id: userId }, data });
  return count === 0 ? null : findProfile(userId);
}

export async function userExists(userId: string, db: Db = prisma): Promise<boolean> {
  const row = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  return row !== null;
}

/** Crée ce qui manque parmi les catégories et comptes par défaut (comparaison par nom). */
async function createDefaults(userId: string, db: Db): Promise<void> {
  const [categories, accounts] = await Promise.all([
    db.category.findMany({ where: { userId }, select: { name: true } }),
    db.account.findMany({ where: { userId }, select: { name: true } }),
  ]);
  const existingCategories = new Set(categories.map((c) => c.name));
  const missingCategories = DEFAULT_CATEGORIES.filter((c) => !existingCategories.has(c.name));
  if (missingCategories.length > 0) {
    await db.category.createMany({ data: missingCategories.map((c) => ({ ...c, userId })) });
  }
  const existingAccounts = new Set(accounts.map((a) => a.name));
  const missingAccounts = DEFAULT_ACCOUNTS.filter((a) => !existingAccounts.has(a.name));
  if (missingAccounts.length > 0) {
    await db.account.createMany({ data: missingAccounts.map((a) => ({ ...a, userId })) });
  }
}

/** Données par défaut (idempotent). false si l'utilisateur n'existe pas. */
export async function bootstrapDefaults(userId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    if (!(await userExists(userId, tx))) return false;
    await createDefaults(userId, tx);
    return true;
  });
}

/** Efface toutes les données métier puis recrée les données par défaut. false si inconnu. */
export async function wipeData(userId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    if (!(await userExists(userId, tx))) return false;
    await deleteAllData(userId, tx);
    await createDefaults(userId, tx);
    return true;
  });
}

/** Supprime toutes les données métier de l'utilisateur (le compte est conservé). */
async function deleteAllData(userId: string, db: Db): Promise<void> {
  const where = { userId };
  await db.transaction.deleteMany({ where });
  await db.recurringRule.deleteMany({ where });
  await db.budget.deleteMany({ where });
  await db.goal.deleteMany({ where });
  await db.tag.deleteMany({ where });
  await db.category.deleteMany({ where });
  await db.account.deleteMany({ where });
  await db.aiModel.deleteMany({ where });
  await db.dismissedInsight.deleteMany({ where });
}
