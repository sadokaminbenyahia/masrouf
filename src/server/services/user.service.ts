// Propriétaire : agent A
import 'server-only';
import type { Result } from '@/domain/result';
import type { UserProfile } from '@/domain/types';
import type { ProfileUpdateInput } from '@/lib/schemas/auth';
import { notImplemented } from './_stub';

export async function getProfile(_userId: string): Promise<Result<UserProfile>> {
  return notImplemented('getProfile');
}
export async function updateProfile(
  _userId: string,
  _input: ProfileUpdateInput,
): Promise<Result<UserProfile>> {
  return notImplemented('updateProfile');
}
export async function completeOnboarding(_userId: string): Promise<Result<UserProfile>> {
  return notImplemented('completeOnboarding');
}
export async function resetOnboarding(_userId: string): Promise<Result<UserProfile>> {
  return notImplemented('resetOnboarding');
}
/** Crée les catégories par défaut + comptes « Espèces » et « Banque » d'un nouvel utilisateur (idempotent). */
export async function bootstrapUser(_userId: string): Promise<Result<void>> {
  return notImplemented('bootstrapUser');
}
/** Supprime toutes les données de l'utilisateur (RGPD) mais garde le compte. */
export async function deleteAllUserData(_userId: string): Promise<Result<void>> {
  return notImplemented('deleteAllUserData');
}
