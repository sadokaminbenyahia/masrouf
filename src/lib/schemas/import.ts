import { z } from 'zod';
import { flowTypeSchema, idSchema, isoDateSchema, positiveMillimesSchema } from './common';

export const MAX_IMPORT_ROWS = 5000;

export const importRowSchema = z.object({
  index: z.number().int().min(0),
  date: isoDateSchema,
  label: z.string().trim().min(1).max(140),
  amount: positiveMillimesSchema,
  type: flowTypeSchema,
  note: z.string().trim().max(500).optional(),
});

export const importPreviewInputSchema = z.object({
  accountId: idSchema,
  rows: z
    .array(importRowSchema)
    .min(1, 'Aucune ligne à importer.')
    .max(MAX_IMPORT_ROWS, `${MAX_IMPORT_ROWS} lignes maximum.`),
});
export type ImportPreviewInput = z.input<typeof importPreviewInputSchema>;

export const importCommitInputSchema = z.object({
  accountId: idSchema,
  rows: z
    .array(
      importRowSchema.extend({
        /** Indicatif : recalculé et vérifié côté serveur, jamais utilisé tel quel. */
        importHash: z.string().min(1).max(128).optional(),
        categoryId: idSchema.nullable(),
        /** La catégorie vient-elle d'une suggestion IA non modifiée ? */
        categoryFromAI: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(MAX_IMPORT_ROWS),
});
export type ImportCommitInput = z.input<typeof importCommitInputSchema>;
/** Données validées (sortie Zod) */
export type ImportPreviewData = z.output<typeof importPreviewInputSchema>;
/** Données validées (sortie Zod) */
export type ImportCommitData = z.output<typeof importCommitInputSchema>;
