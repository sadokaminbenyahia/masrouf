'use server';
import type { ActionResult } from '@/domain/result';
import type { ImportCommitResult, ImportPreviewRow } from '@/domain/types';
import {
  importCommitInputSchema,
  importPreviewInputSchema,
  type ImportCommitInput,
  type ImportPreviewInput,
} from '@/lib/schemas/import';
import { validatedAction } from '@/server/actions/safe-action';
import * as importer from '@/server/services/import.service';
import { revalidateApp } from './_revalidate';

export async function previewImportAction(
  input: ImportPreviewInput,
): Promise<ActionResult<ImportPreviewRow[]>> {
  return validatedAction(importPreviewInputSchema, input, (d, userId) =>
    importer.previewImport(userId, d),
  );
}

export async function commitImportAction(
  input: ImportCommitInput,
): Promise<ActionResult<ImportCommitResult>> {
  const r = await validatedAction(importCommitInputSchema, input, (d, userId) =>
    importer.commitImport(userId, d),
  );
  if (r.ok) revalidateApp();
  return r;
}
