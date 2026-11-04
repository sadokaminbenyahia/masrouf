import { z } from 'zod';
import {
  idSchema,
  isoDateSchema,
  positiveMillimesSchema,
  signedMillimesSchema,
  transactionTypeSchema,
} from './common';

const tagListSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(30)
      .regex(/^[^,;]+$/, 'Tag invalide.'),
  )
  .max(10, '10 tags maximum.');

// Champs SANS valeur par défaut : en Zod 4, `.partial()` conserve les `.default()`,
// ce qui écraserait des champs absents d'un patch. Les défauts sont ajoutés via `.extend`.
const transactionFields = z.object({
  accountId: idSchema,
  categoryId: idSchema.nullable().optional(),
  type: transactionTypeSchema,
  amount: positiveMillimesSchema,
  date: isoDateSchema,
  label: z.string().trim().min(1, 'Libellé requis.').max(140),
  note: z.string().trim().max(500).nullable().optional(),
  tags: tagListSchema,
  transferAccountId: idSchema.nullable().optional(),
});

const baseTransaction = transactionFields.extend({ tags: tagListSchema.default([]) });

const transferRule = <
  T extends { type?: string; transferAccountId?: string | null; accountId?: string },
>(
  t: T,
) => t.type !== 'TRANSFER' || (!!t.transferAccountId && t.transferAccountId !== t.accountId);
const transferIssue = {
  message: 'Choisissez un compte destinataire différent.',
  path: ['transferAccountId'],
};

/** Création. Si `categoryId` est omis (undefined) pour une dépense/revenu, l'IA propose une catégorie. */
export const transactionInputSchema = baseTransaction.refine(transferRule, transferIssue);
export type TransactionInput = z.input<typeof transactionInputSchema>;

/** Mise à jour partielle (édition inline). */
export const transactionPatchSchema = transactionFields
  .partial()
  .refine(transferRule, transferIssue);
export type TransactionPatch = z.input<typeof transactionPatchSchema>;

/** Instantané renvoyé par la suppression, rejoué par « Annuler ». */
export const transactionSnapshotSchema = baseTransaction
  .extend({ id: idSchema, recurringId: idSchema.nullable().optional() })
  .refine(transferRule, transferIssue);
export type TransactionSnapshot = z.input<typeof transactionSnapshotSchema>;

export const transactionQuerySchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional(),
  types: z.array(transactionTypeSchema).max(3).optional(),
  accountIds: z.array(idSchema).max(50).optional(),
  categoryIds: z.array(idSchema).max(100).optional(),
  uncategorized: z.boolean().optional(),
  tag: z.string().trim().max(30).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  minAmount: signedMillimesSchema.optional(),
  maxAmount: signedMillimesSchema.optional(),
  sort: z
    .object({ field: z.enum(['date', 'amount', 'label']), direction: z.enum(['asc', 'desc']) })
    .default({ field: 'date', direction: 'desc' }),
});
export type TransactionQueryInput = z.input<typeof transactionQuerySchema>;

export const exportQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
/** Données validées (sortie Zod) */
export type TransactionInputData = z.output<typeof transactionInputSchema>;
/** Données validées (sortie Zod) */
export type TransactionPatchData = z.output<typeof transactionPatchSchema>;
/** Données validées (sortie Zod) */
export type TransactionSnapshotData = z.output<typeof transactionSnapshotSchema>;
/** Données validées (sortie Zod) */
export type TransactionQueryData = z.output<typeof transactionQuerySchema>;
