'use server';
import type { ActionResult } from '@/domain/result';
import type { UserProfile } from '@/domain/types';
import { profileUpdateSchema, type ProfileUpdateInput } from '@/lib/schemas/auth';
import { authedAction, validatedAction } from '@/server/actions/safe-action';
import * as users from '@/server/services/user.service';
import { revalidateApp } from './_revalidate';

export async function getProfileAction(): Promise<ActionResult<UserProfile>> {
  return authedAction((userId) => users.getProfile(userId));
}

export async function updateProfileAction(
  input: ProfileUpdateInput,
): Promise<ActionResult<UserProfile>> {
  const r = await validatedAction(profileUpdateSchema, input, (d, userId) =>
    users.updateProfile(userId, d),
  );
  if (r.ok) revalidateApp();
  return r;
}

export async function completeOnboardingAction(): Promise<ActionResult<UserProfile>> {
  const r = await authedAction((userId) => users.completeOnboarding(userId));
  if (r.ok) revalidateApp();
  return r;
}

export async function resetOnboardingAction(): Promise<ActionResult<UserProfile>> {
  const r = await authedAction((userId) => users.resetOnboarding(userId));
  if (r.ok) revalidateApp();
  return r;
}
