import { z } from 'zod';
import {
  flowTypeSchema,
  frequencySchema,
  idSchema,
  isoDateSchema,
  positiveMillimesSchema,
} from './common';

export const recurringInputSchema = z
  .object({
    accountId: idSchema,
    categoryId: idSchema.nullable().optional(),
    type: flowTypeSchema,
    amount: positiveMillimesSchema,
    label: z.string().trim().min(1, 'Libellé requis.').max(140),
    frequency: frequencySchema,
    startDate: isoDateSchema,
    endDate: isoDateSchema.nullable().optional(),
    autoCreate: z.boolean().default(true),
  })
  .refine((r) => !r.endDate || r.endDate >= r.startDate, {
    message: 'La date de fin doit suivre la date de début.',
    path: ['endDate'],
  });
export type RecurringInput = z.input<typeof recurringInputSchema>;

export const recurringPatchSchema = z.object({
  accountId: idSchema.optional(),
  categoryId: idSchema.nullable().optional(),
  amount: positiveMillimesSchema.optional(),
  label: z.string().trim().min(1).max(140).optional(),
  frequency: frequencySchema.optional(),
  nextDate: isoDateSchema.optional(),
  endDate: isoDateSchema.nullable().optional(),
  active: z.boolean().optional(),
  autoCreate: z.boolean().optional(),
});
export type RecurringPatch = z.input<typeof recurringPatchSchema>;
/** Données validées (sortie Zod) */
export type RecurringInputData = z.output<typeof recurringInputSchema>;
/** Données validées (sortie Zod) */
export type RecurringPatchData = z.output<typeof recurringPatchSchema>;
