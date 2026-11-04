// Propriétaire : agent F
import 'server-only';
import { appError, err, ok, type Result } from '@/domain/result';
import type { RegisterData } from '@/lib/schemas/auth';
import { hashPassword } from '@/server/auth/password';
import { isPrismaError } from '@/server/repositories/_shared';
import * as userRepo from '@/server/repositories/user.repo';
import { bootstrapUser } from './user.service';

/** Message volontairement générique : ne révèle pas si l'adresse est déjà inscrite. */
export const REGISTER_CONFLICT_MESSAGE = 'Impossible de créer ce compte.';

/** Crée l'utilisateur (mot de passe haché bcrypt), puis bootstrapUser. CONFLICT si e-mail pris. */
export async function registerUser(
  input: RegisterData,
): Promise<Result<{ id: string; email: string }>> {
  // Hachage AVANT la vérification d'unicité : temps de réponse identique dans les deux cas.
  const passwordHash = await hashPassword(input.password);
  if ((await userRepo.findUserIdByEmail(input.email)) !== null) {
    return err(appError('CONFLICT', REGISTER_CONFLICT_MESSAGE));
  }

  let user: { id: string; email: string };
  try {
    user = await userRepo.createUser({ email: input.email, name: input.name, passwordHash });
  } catch (e) {
    // Course entre deux inscriptions simultanées : contrainte d'unicité.
    if (isPrismaError(e, 'P2002')) return err(appError('CONFLICT', REGISTER_CONFLICT_MESSAGE));
    throw e;
  }

  const boot = await bootstrapUser(user.id);
  if (!boot.ok) {
    // Compte incomplet : on le retire pour permettre une nouvelle tentative propre.
    await userRepo.deleteUser(user.id);
    return boot;
  }
  return ok(user);
}
