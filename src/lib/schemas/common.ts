/**
 * Schémas Zod partagés (client + serveur). La validation Zod a lieu à CHAQUE frontière :
 * formulaires, server actions, import CSV, réponses de l'IA.
 */
import { z } from 'zod';
import { isISODate, isYearMonth } from '@/domain/dates';
import {
  ACCOUNT_TYPES,
  CATEGORY_GROUPS,
  CATEGORY_KINDS,
  FREQUENCIES,
  TRANSACTION_TYPES,
} from '@/domain/types';

/** Plafond de sécurité : 1 milliard de dinars en millimes. */
export const MAX_MILLIMES = 1_000_000_000_000;

export const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Identifiant invalide.');
export const isoDateSchema = z.string().refine(isISODate, 'Date invalide (AAAA-MM-JJ).');
export const yearMonthSchema = z.string().refine(isYearMonth, 'Mois invalide (AAAA-MM).');
/** Montant positif strict, en millimes entiers. */
export const positiveMillimesSchema = z
  .number()
  .int('Le montant doit être un nombre entier de millimes.')
  .positive('Le montant doit être supérieur à zéro.')
  .max(MAX_MILLIMES, 'Montant trop élevé.');
/** Montant signé (soldes d'ouverture, retraits d'objectif). */
export const signedMillimesSchema = z
  .number()
  .int('Le montant doit être un nombre entier de millimes.')
  .min(-MAX_MILLIMES)
  .max(MAX_MILLIMES);
export const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur invalide (#RRGGBB).');
export const iconSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9]+$/, 'Icône invalide.');

export const accountTypeSchema = z.enum(ACCOUNT_TYPES);
export const transactionTypeSchema = z.enum(TRANSACTION_TYPES);
export const flowTypeSchema = z.enum(['EXPENSE', 'INCOME']);
export const categoryKindSchema = z.enum(CATEGORY_KINDS);
export const categoryGroupSchema = z.enum(CATEGORY_GROUPS);
export const frequencySchema = z.enum(FREQUENCIES);

export const reorderSchema = z.object({ ids: z.array(idSchema).min(1).max(500) });
export type ReorderInput = z.infer<typeof reorderSchema>;

/** Convertit une ZodError en erreurs par champ (« a.b » → messages). */
export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
