import { z } from 'zod';
import { accountTypeSchema, colorSchema, signedMillimesSchema } from './common';

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis.').max(60),
  type: accountTypeSchema,
  initialBalance: signedMillimesSchema.default(0),
  color: colorSchema.default('#1F5FAD'),
});
export type AccountInput = z.input<typeof accountInputSchema>;

/** Patch : aucun défaut (Zod 4 conserve les `.default()` dans `.partial()`). */
export const accountPatchSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis.').max(60).optional(),
  type: accountTypeSchema.optional(),
  initialBalance: signedMillimesSchema.optional(),
  color: colorSchema.optional(),
  archived: z.boolean().optional(),
});
export type AccountPatch = z.input<typeof accountPatchSchema>;
/** Données validées (sortie Zod) */
export type AccountInputData = z.output<typeof accountInputSchema>;
/** Données validées (sortie Zod) */
export type AccountPatchData = z.output<typeof accountPatchSchema>;
