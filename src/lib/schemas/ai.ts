import { z } from 'zod';
import {
  flowTypeSchema,
  idSchema,
  MAX_MILLIMES,
  positiveMillimesSchema,
  yearMonthSchema,
} from './common';

export const parseEntryInputSchema = z.object({
  text: z.string().trim().min(1, 'Écrivez une dépense.').max(200),
});
export const askInputSchema = z.object({
  question: z.string().trim().min(1, 'Posez une question.').max(300),
});
export const suggestCategoryInputSchema = z.object({
  label: z.string().trim().min(1).max(140),
  amount: positiveMillimesSchema,
  type: flowTypeSchema,
});
export const monthlySummaryInputSchema = z.object({ month: yearMonthSchema });
export const whatIfInputSchema = z.object({
  goalId: idSchema,
  adjustments: z
    .array(z.object({ categoryId: idSchema, percent: z.number().min(0).max(100) }))
    .max(30),
  extraMonthlySaving: z.number().int().min(0).max(MAX_MILLIMES).default(0),
});
export type WhatIfActionInput = z.input<typeof whatIfInputSchema>;
export const dismissInputSchema = z.object({ key: z.string().min(1).max(200) });
/** Données validées (sortie Zod) */
export type WhatIfActionData = z.output<typeof whatIfInputSchema>;
