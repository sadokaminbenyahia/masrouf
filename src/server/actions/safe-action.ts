import 'server-only';
import type { z } from 'zod';
import { appError, err, type ActionResult, type Result } from '@/domain/result';
import { zodFieldErrors } from '@/lib/schemas/common';
import { getCurrentUserId } from '@/server/auth/session';

/**
 * Enveloppe commune des server actions : authentification, validation Zod, et conversion
 * de toute exception inattendue en erreur typée INTERNAL (journalisée, jamais avalée).
 */
export async function authedAction<T>(
  fn: (userId: string) => Promise<Result<T>>,
): Promise<ActionResult<T>> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return err(appError('UNAUTHORIZED', 'Veuillez vous connecter.'));
    return await fn(userId);
  } catch (e) {
    console.error('[action] erreur inattendue', e);
    return err(appError('INTERNAL', 'Une erreur inattendue est survenue.'));
  }
}

export async function validatedAction<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  fn: (data: z.output<S>, userId: string) => Promise<Result<T>>,
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return err(
      appError(
        'VALIDATION',
        'Certaines informations sont invalides.',
        zodFieldErrors(parsed.error),
      ),
    );
  }
  return authedAction((userId) => fn(parsed.data, userId));
}
