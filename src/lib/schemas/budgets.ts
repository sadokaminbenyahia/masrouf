import { z } from 'zod';
import {
  MAX_MILLIMES,
  colorSchema,
  iconSchema,
  idSchema,
  isoDateSchema,
  positiveMillimesSchema,
  signedMillimesSchema,
} from './common';

export const budgetUpsertSchema = z.object({
  categoryId: idSchema,
  amount: positiveMillimesSchema,
});
export type BudgetUpsertInput = z.input<typeof budgetUpsertSchema>;

export const goalInputSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis.').max(60),
  targetAmount: positiveMillimesSchema,
  savedAmount: z.number().int().min(0).max(MAX_MILLIMES, 'Montant trop élevé.').default(0),
  targetDate: isoDateSchema.nullable().optional(),
  icon: iconSchema.default('PiggyBank'),
  color: colorSchema.default('#15803D'),
});
export type GoalInput = z.input<typeof goalInputSchema>;

/** Patch : aucun défaut (Zod 4 conserve les `.default()` dans `.partial()`). */
export const goalPatchSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis.').max(60).optional(),
  targetAmount: positiveMillimesSchema.optional(),
  savedAmount: z.number().int().min(0).max(MAX_MILLIMES, 'Montant trop élevé.').optional(),
  targetDate: isoDateSchema.nullable().optional(),
  icon: iconSchema.optional(),
  color: colorSchema.optional(),
});
export type GoalPatch = z.input<typeof goalPatchSchema>;

/** Versement (positif) ou retrait (négatif) sur un objectif. */
export const goalContributionSchema = z.object({
  amount: signedMillimesSchema.refine((v) => v !== 0, 'Le montant ne peut pas être nul.'),
});
export type GoalContributionInput = z.input<typeof goalContributionSchema>;
/** Données validées (sortie Zod) */
export type BudgetUpsertData = z.output<typeof budgetUpsertSchema>;
/** Données validées (sortie Zod) */
export type GoalInputData = z.output<typeof goalInputSchema>;
/** Données validées (sortie Zod) */
export type GoalPatchData = z.output<typeof goalPatchSchema>;
