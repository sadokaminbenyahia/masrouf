/**
 * Exécute un appel de service et garantit un Result : une exception imprévue est journalisée
 * puis convertie en INTERNAL, pour que chaque bloc de page gère son propre échec.
 */
import { appError, DEFAULT_ERROR_MESSAGES, err, type Result } from '@/domain/result';

export async function settle<T>(label: string, run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await run();
  } catch (e) {
    console.error(`[${label}] erreur inattendue`, e);
    return err(appError('INTERNAL', DEFAULT_ERROR_MESSAGES.INTERNAL));
  }
}
