// Propriétaire : agent F
import 'server-only';
import type { Result } from '@/domain/result';
import type { RegisterData } from '@/lib/schemas/auth';
import { notImplemented } from './_stub';

/** Crée l'utilisateur (mot de passe haché bcrypt), puis bootstrapUser. CONFLICT si e-mail pris. */
export async function registerUser(
  _input: RegisterData,
): Promise<Result<{ id: string; email: string }>> {
  return notImplemented('registerUser');
}
