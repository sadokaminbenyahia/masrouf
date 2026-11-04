import 'server-only';
import type { Category as CategoryRow } from '@prisma/client';
import {
  CATEGORY_GROUPS,
  CATEGORY_KINDS,
  type Category,
  type CategoryGroup,
  type CategoryKind,
} from '@/domain/types';
import { prisma } from '@/server/db';
import { parseEnum, type Db } from './_shared';

export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    kind: parseEnum(CATEGORY_KINDS, row.kind, 'Category.kind'),
    group: parseEnum(CATEGORY_GROUPS, row.group, 'Category.group'),
    icon: row.icon,
    color: row.color,
    sortOrder: row.sortOrder,
  };
}

export async function listCategories(userId: string, db: Db = prisma): Promise<Category[]> {
  const rows = await db.category.findMany({
    where: { userId },
    orderBy: [{ kind: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toCategory);
}

export async function findCategory(
  userId: string,
  id: string,
  db: Db = prisma,
): Promise<Category | null> {
  const row = await db.category.findFirst({ where: { id, userId } });
  return row ? toCategory(row) : null;
}

/** Catégories de l'utilisateur parmi `ids`, indexées par id. */
export async function findCategoriesByIds(
  userId: string,
  ids: readonly string[],
  db: Db = prisma,
): Promise<Map<string, Category>> {
  if (ids.length === 0) return new Map();
  const rows = await db.category.findMany({ where: { userId, id: { in: [...new Set(ids)] } } });
  return new Map(rows.map((r) => [r.id, toCategory(r)]));
}

export async function findCategoryByName(
  userId: string,
  name: string,
  db: Db = prisma,
): Promise<Category | null> {
  const row = await db.category.findFirst({ where: { userId, name } });
  return row ? toCategory(row) : null;
}

export async function nextSortOrder(userId: string, db: Db = prisma): Promise<number> {
  const agg = await db.category.aggregate({ where: { userId }, _max: { sortOrder: true } });
  return (agg._max.sortOrder ?? -1) + 1;
}

export interface CategoryData {
  name: string;
  kind: CategoryKind;
  group: CategoryGroup;
  icon: string;
  color: string;
  sortOrder: number;
}

export async function createCategory(
  userId: string,
  data: CategoryData,
  db: Db = prisma,
): Promise<Category> {
  return toCategory(await db.category.create({ data: { ...data, userId } }));
}

export async function updateCategory(
  userId: string,
  id: string,
  data: Partial<Pick<CategoryData, 'name' | 'group' | 'icon' | 'color'>>,
): Promise<Category | null> {
  const { count } = await prisma.category.updateMany({ where: { id, userId }, data });
  return count === 0 ? null : findCategory(userId, id);
}

/** Supprime la catégorie ; les transactions liées passent « sans catégorie » (FK SetNull). */
export async function deleteCategory(userId: string, id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Remise à zéro explicite de la source : une transaction sans catégorie n'a pas de source.
    await tx.transaction.updateMany({
      where: { userId, categoryId: id },
      data: { categoryId: null, categorySource: null, aiConfidence: null },
    });
    await tx.recurringRule.updateMany({
      where: { userId, categoryId: id },
      data: { categoryId: null },
    });
    const { count } = await tx.category.deleteMany({ where: { id, userId } });
    return count > 0;
  });
}
