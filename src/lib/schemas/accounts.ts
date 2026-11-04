import { z } from 'zod';
import { accountTypeSchema, colorSchema, signedMillimesSchema } from './common';

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis.').max(60),
  type: accountTypeSchema,
  initialBalance: signedMillimesSchema.default(0),
  color: colorSchema.default('#1F5FAD'),
});
export type AccountInput = z.input<typeof accountInputSchema>;

export const accountPatchSchema = accountInputSchema.partial().extend({
  archived: z.boolean().optional(),
});
export type AccountPatch = z.input<typeof accountPatchSchema>;
/** Données validées (sortie Zod) */
export type AccountInputData = z.output<typeof accountInputSchema>;
/** Données validées (sortie Zod) */
export type AccountPatchData = z.output<typeof accountPatchSchema>;
