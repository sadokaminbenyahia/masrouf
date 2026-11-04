/**
 * Type Result : toutes les opérations faillibles du domaine et des services renvoient
 * un Result au lieu de lever une exception. Les erreurs sont typées et jamais avalées.
 */
export type AppErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface AppError {
  code: AppErrorCode;
  /** Message lisible par l'utilisateur, en français */
  message: string;
  /** Erreurs par champ (formulaires), clé = chemin du champ */
  fieldErrors?: Record<string, string[]>;
}

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
export const err = <E>(error: E): { ok: false; error: E } => ({ ok: false, error });

export const appError = (
  code: AppErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): AppError => (fieldErrors ? { code, message, fieldErrors } : { code, message });

export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok;

/** Transforme la valeur d'un Result réussi. */
export function mapResult<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

/** Messages par défaut (FR) par code d'erreur. */
export const DEFAULT_ERROR_MESSAGES: Record<AppErrorCode, string> = {
  VALIDATION: 'Certaines informations sont invalides.',
  UNAUTHORIZED: 'Veuillez vous connecter.',
  FORBIDDEN: 'Action non autorisée.',
  NOT_FOUND: 'Élément introuvable.',
  CONFLICT: 'Cette action entre en conflit avec des données existantes.',
  RATE_LIMITED: 'Trop de tentatives. Réessayez dans un instant.',
  INTERNAL: 'Une erreur inattendue est survenue.',
};

/** Résultat renvoyé par toute server action (sérialisable). */
export type ActionResult<T> = Result<T, AppError>;
