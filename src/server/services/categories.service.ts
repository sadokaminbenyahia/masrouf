// Propriétaire : agent A
import 'server-only';
import type { Result } from '@/domain/result';
import type { Category, Tag } from '@/domain/types';
import type { CategoryInputData, CategoryPatchData } from '@/lib/schemas/categories';
import { notImplemented } from './_stub';

export async function listCategories(_userId: string): Promise<Result<Category[]>> {
  return notImplemented('listCategories');
}
export async function createCategory(
  _userId: string,
  _input: CategoryInputData,
): Promise<Result<Category>> {
  return notImplemented('createCategory');
}
export async function updateCategory(
  _userId: string,
  _id: string,
  _patch: CategoryPatchData,
): Promise<Result<Category>> {
  return notImplemented('updateCategory');
}
/** Les transactions liées passent « sans catégorie ». */
export async function deleteCategory(
  _userId: string,
  _id: string,
): Promise<Result<{ id: string }>> {
  return notImplemented('deleteCategory');
}
export async function listTags(_userId: string): Promise<Result<Tag[]>> {
  return notImplemented('listTags');
}
