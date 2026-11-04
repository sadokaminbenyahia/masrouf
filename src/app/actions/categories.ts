'use server';
import { z } from 'zod';
import type { ActionResult } from '@/domain/result';
import type { Category, Tag } from '@/domain/types';
import {
  categoryInputSchema,
  categoryPatchSchema,
  type CategoryInput,
  type CategoryPatch,
} from '@/lib/schemas/categories';
import { idSchema } from '@/lib/schemas/common';
import { authedAction, validatedAction } from '@/server/actions/safe-action';
import * as categories from '@/server/services/categories.service';
import { revalidateApp } from './_revalidate';

export async function listCategoriesAction(): Promise<ActionResult<Category[]>> {
  return authedAction((userId) => categories.listCategories(userId));
}

export async function createCategoryAction(input: CategoryInput): Promise<ActionResult<Category>> {
  const r = await validatedAction(categoryInputSchema, input, (d, userId) =>
    categories.createCategory(userId, d),
  );
  if (r.ok) revalidateApp();
  return r;
}

export async function updateCategoryAction(
  id: string,
  patch: CategoryPatch,
): Promise<ActionResult<Category>> {
  const r = await validatedAction(
    z.object({ id: idSchema, patch: categoryPatchSchema }),
    { id, patch },
    (d, userId) => categories.updateCategory(userId, d.id, d.patch),
  );
  if (r.ok) revalidateApp();
  return r;
}

export async function deleteCategoryAction(id: string): Promise<ActionResult<{ id: string }>> {
  const r = await validatedAction(idSchema, id, (d, userId) =>
    categories.deleteCategory(userId, d),
  );
  if (r.ok) revalidateApp();
  return r;
}

export async function listTagsAction(): Promise<ActionResult<Tag[]>> {
  return authedAction((userId) => categories.listTags(userId));
}
