import { z } from 'zod';
import { categoryGroupSchema, categoryKindSchema, colorSchema, iconSchema } from './common';

export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Nom requis.').max(40),
    kind: categoryKindSchema,
    group: categoryGroupSchema,
    icon: iconSchema.default('Tag'),
    color: colorSchema.default('#64748B'),
  })
  .refine((c) => (c.kind === 'INCOME') === (c.group === 'INCOME'), {
    message: 'Une catégorie de revenu doit appartenir au groupe « Revenus ».',
    path: ['group'],
  });
export type CategoryInput = z.input<typeof categoryInputSchema>;

export const categoryPatchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  group: categoryGroupSchema.optional(),
  icon: iconSchema.optional(),
  color: colorSchema.optional(),
});
export type CategoryPatch = z.input<typeof categoryPatchSchema>;
/** Données validées (sortie Zod) */
export type CategoryInputData = z.output<typeof categoryInputSchema>;
/** Données validées (sortie Zod) */
export type CategoryPatchData = z.output<typeof categoryPatchSchema>;
