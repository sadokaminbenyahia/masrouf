// Propriétaire : agent A
import 'server-only';
import { appError, err, ok, type Result } from '@/domain/result';
import type { UserProfile } from '@/domain/types';
import type { ProfileUpdateInput } from '@/lib/schemas/auth';
import { withPrismaErrors } from '@/server/repositories/_shared';
import * as userRepo from '@/server/repositories/user.repo';

const notFound = () => err(appError('NOT_FOUND', 'Utilisateur introuvable.'));

export async function getProfile(userId: string): Promise<Result<UserProfile>> {
  const profile = await userRepo.findProfile(userId);
  return profile ? ok(profile) : notFound();
}

export async function updateProfile(
  userId: string,
  input: ProfileUpdateInput,
): Promise<Result<UserProfile>> {
  return withPrismaErrors(async () => {
    const profile = await userRepo.updateUser(userId, { name: input.name.trim() });
    return profile ? ok(profile) : notFound();
  });
}

export async function completeOnboarding(userId: string): Promise<Result<UserProfile>> {
  return withPrismaErrors(async () => {
    const current = await userRepo.findProfile(userId);
    if (!current) return notFound();
    if (current.onboarded) return ok(current);
    const profile = await userRepo.updateUser(userId, { onboardedAt: new Date() });
    return profile ? ok(profile) : notFound();
  });
}

export async function resetOnboarding(userId: string): Promise<Result<UserProfile>> {
  return withPrismaErrors(async () => {
    const profile = await userRepo.updateUser(userId, { onboardedAt: null });
    return profile ? ok(profile) : notFound();
  });
}

/** Crée les catégories par défaut + comptes « Espèces » et « Banque » d'un nouvel utilisateur (idempotent). */
export async function bootstrapUser(userId: string): Promise<Result<void>> {
  return withPrismaErrors(
    async () => ((await userRepo.bootstrapDefaults(userId)) ? ok(undefined) : notFound()),
    // Deux appels concurrents : l'unicité (userId, name) des catégories empêche les doublons.
    { conflict: 'Les données par défaut sont déjà en cours de création.' },
  );
}

/**
 * Supprime toutes les données de l'utilisateur (RGPD) mais garde le compte. Les catégories et
 * comptes par défaut sont recréés pour que l'application reste utilisable.
 */
export async function deleteAllUserData(userId: string): Promise<Result<void>> {
  return withPrismaErrors(async () => ((await userRepo.wipeData(userId)) ? ok(undefined) : notFound()));
}
