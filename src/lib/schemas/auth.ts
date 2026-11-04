import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Adresse e-mail invalide.')
  .max(254);

export const passwordSchema = z
  .string()
  .min(8, 'Au moins 8 caractères.')
  .max(128, '128 caractères maximum.')
  .regex(/[A-Za-z]/, 'Au moins une lettre.')
  .regex(/\d/, 'Au moins un chiffre.');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Votre prénom est requis.').max(60),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Mot de passe requis.').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
/** Données validées (sortie Zod) */
export type RegisterData = z.output<typeof registerSchema>;
