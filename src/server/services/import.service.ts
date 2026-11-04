// Propriétaire : agent A
import 'server-only';
import type { Result } from '@/domain/result';
import type { ImportCommitResult, ImportPreviewRow } from '@/domain/types';
import type { ImportCommitData, ImportPreviewData } from '@/lib/schemas/import';
import { notImplemented } from './_stub';

/** Calcule importHash, détecte les doublons (existants + dans le fichier), suggère une catégorie (IA). */
export async function previewImport(
  _userId: string,
  _input: ImportPreviewData,
): Promise<Result<ImportPreviewRow[]>> {
  return notImplemented('previewImport');
}
/** Crée les transactions (ignore les doublons existants), en une transaction Prisma. */
export async function commitImport(
  _userId: string,
  _input: ImportCommitData,
): Promise<Result<ImportCommitResult>> {
  return notImplemented('commitImport');
}
