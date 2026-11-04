import 'server-only';
import { Prisma, type PrismaClient } from '@prisma/client';
import { appError, err, type Result } from '@/domain/result';

/** Client utilisable dans ou hors d'une transaction Prisma interactive. */
export type Db = PrismaClient | Prisma.TransactionClient;

/** Donnée incohérente en base (valeur « enum » inconnue…) : bug ou corruption, jamais un cas métier. */
export class DataIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataIntegrityError';
  }
}

/** Valide une chaîne « enum » lue en base (SQLite n'a pas d'enum natif). */
export function parseEnum<T extends string>(values: readonly T[], value: string, field: string): T {
  const found = values.find((v) => v === value);
  if (found === undefined)
    throw new DataIntegrityError(`Valeur invalide pour ${field} : « ${value} »`);
  return found;
}

export function parseNullableEnum<T extends string>(
  values: readonly T[],
  value: string | null,
  field: string,
): T | null {
  return value === null ? null : parseEnum(values, value, field);
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function isPrismaError(e: unknown, code: string): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;
}

/**
 * Convertit les erreurs Prisma connues en erreurs typées :
 * P2002 (unicité) → CONFLICT, P2025 (introuvable) → NOT_FOUND, P2003 (clé étrangère) → NOT_FOUND.
 * Les autres exceptions remontent (safe-action les journalise et renvoie INTERNAL).
 */
export async function withPrismaErrors<T>(
  fn: () => Promise<Result<T>>,
  messages: { conflict?: string; notFound?: string } = {},
): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    if (isPrismaError(e, 'P2002')) {
      return err(appError('CONFLICT', messages.conflict ?? 'Cet élément existe déjà.'));
    }
    if (isPrismaError(e, 'P2025') || isPrismaError(e, 'P2003')) {
      return err(appError('NOT_FOUND', messages.notFound ?? 'Élément introuvable.'));
    }
    throw e;
  }
}
