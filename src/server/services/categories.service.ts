// Propriétaire : agent A
import 'server-only';
import { appError, err, ok, type Result } from '@/domain/result';
import type { Category, Tag } from '@/domain/types';
import type { CategoryInputData, CategoryPatchData } from '@/lib/schemas/categories';
import { withPrismaErrors } from '@/server/repositories/_shared';
import * as categoryRepo from '@/server/repositories/category.repo';
import * as tagRepo from '@/server/repositories/tag.repo';

const notFound = () => err(appError('NOT_FOUND', 'Catégorie introuvable.'));
const nameTaken = (name: string) =>
  err(
    appError('CONFLICT', `Une catégorie « ${name} » existe déjà.`, {
      name: ['Ce nom est déjà utilisé.'],
    }),
  );

export async function listCategories(userId: string): Promise<Result<Category[]>> {
  return ok(await categoryRepo.listCategories(userId));
}

export async function createCategory(
  userId: string,
  input: CategoryInputData,
): Promise<Result<Category>> {
  const name = input.name.trim();
  return withPrismaErrors(
    async () => {
      if (await categoryRepo.findCategoryByName(userId, name)) return nameTaken(name);
      const sortOrder = await categoryRepo.nextSortOrder(userId);
      return ok(
        await categoryRepo.createCategory(userId, {
          name,
          kind: input.kind,
          group: input.group,
          icon: input.icon,
          color: input.color,
          sortOrder,
        }),
      );
    },
    { conflict: `Une catégorie « ${name} » existe déjà.` },
  );
}

export async function updateCategory(
  userId: string,
  id: string,
  patch: CategoryPatchData,
): Promise<Result<Category>> {
  const name = patch.name?.trim();
  return withPrismaErrors(
    async () => {
      const current = await categoryRepo.findCategory(userId, id);
      if (!current) return notFound();
      const group = patch.group ?? current.group;
      if ((current.kind === 'INCOME') !== (group === 'INCOME')) {
        return err(
          appError('VALIDATION', 'Ce groupe ne correspond pas au type de la catégorie.', {
            group: [
              current.kind === 'INCOME'
                ? 'Une catégorie de revenu reste dans le groupe « Revenus ».'
                : 'Choisissez Besoins, Envies ou Épargne.',
            ],
          }),
        );
      }
      if (name !== undefined && name !== current.name) {
        const other = await categoryRepo.findCategoryByName(userId, name);
        if (other && other.id !== id) return nameTaken(name);
      }
      const data: Parameters<typeof categoryRepo.updateCategory>[2] = {};
      if (name !== undefined) data.name = name;
      if (patch.group !== undefined) data.group = patch.group;
      if (patch.icon !== undefined) data.icon = patch.icon;
      if (patch.color !== undefined) data.color = patch.color;
      const updated = await categoryRepo.updateCategory(userId, id, data);
      return updated ? ok(updated) : notFound();
    },
    { conflict: 'Ce nom de catégorie est déjà utilisé.' },
  );
}

/** Les transactions liées passent « sans catégorie ». */
export async function deleteCategory(userId: string, id: string): Promise<Result<{ id: string }>> {
  return withPrismaErrors(async () =>
    (await categoryRepo.deleteCategory(userId, id)) ? ok({ id }) : notFound(),
  );
}

export async function listTags(userId: string): Promise<Result<Tag[]>> {
  return ok(await tagRepo.listTags(userId));
}
