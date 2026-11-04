// Propriétaire : agent A
import 'server-only';
import { computeImportHash, normalizeForHash } from '@/domain/csv/hash';
import { addDays, type ISODate } from '@/domain/dates';
import { appError, err, ok, type Result } from '@/domain/result';
import { isCategoryCompatible } from '@/domain/transactions';
import type { ImportCommitResult, ImportPreviewRow, ImportRow } from '@/domain/types';
import type { ImportCommitData, ImportPreviewData } from '@/lib/schemas/import';
import { prisma } from '@/server/db';
import { withPrismaErrors, type Db } from '@/server/repositories/_shared';
import * as accountRepo from '@/server/repositories/account.repo';
import * as categoryRepo from '@/server/repositories/category.repo';
import * as txRepo from '@/server/repositories/transaction.repo';
import { aiEngine } from '@/server/ai/engine';
import { predictCategories, retrainCategorizer } from '@/server/services/ai.service';

/** Nombre minimal de lignes créées pour réentraîner le catégoriseur. */
const RETRAIN_MIN_ROWS = 20;

type RowKey = Pick<ImportRow, 'date' | 'amount' | 'type' | 'label'>;

const fuzzyKey = (r: { amount: number; type: string; label: string }) =>
  `${r.type}|${r.amount}|${normalizeForHash(r.label)}`;

/**
 * Indices des lignes déjà présentes en base : même empreinte, ou même montant + type +
 * libellé normalisé à ±1 jour.
 */
async function findExisting(
  userId: string,
  rows: readonly RowKey[],
  hashes: readonly string[],
  db: Db = prisma,
): Promise<Set<number>> {
  const out = new Set<number>();
  if (rows.length === 0) return out;
  const known = await txRepo.existingImportHashes(userId, hashes, db);

  let from: ISODate | null = null;
  let to: ISODate | null = null;
  for (const r of rows) {
    if (from === null || r.date < from) from = r.date;
    if (to === null || r.date > to) to = r.date;
  }
  const dates = new Map<string, Set<ISODate>>();
  if (from !== null && to !== null) {
    const existing = await txRepo.findFlowsForDuplicates(
      userId,
      { from: addDays(from, -1), to: addDays(to, 1) },
      db,
    );
    for (const e of existing) {
      const key = fuzzyKey(e);
      const set = dates.get(key) ?? new Set<ISODate>();
      set.add(e.date);
      dates.set(key, set);
    }
  }

  rows.forEach((r, i) => {
    const hash = hashes[i];
    if (hash !== undefined && known.has(hash)) {
      out.add(i);
      return;
    }
    const set = dates.get(fuzzyKey(r));
    if (set && (set.has(r.date) || set.has(addDays(r.date, -1)) || set.has(addDays(r.date, 1)))) {
      out.add(i);
    }
  });
  return out;
}

/** Fenêtre (jours) d'un doublon « possible » : même compte, montant et type, libellé différent. */
const POSSIBLE_WINDOW_DAYS = 2;

/**
 * Indices des lignes qui ressemblent à une transaction existante du MÊME compte : même montant,
 * même type, date à ±2 jours (libellé différent : sinon la ligne est déjà EXISTING).
 */
async function findPossible(
  userId: string,
  accountId: string,
  rows: readonly RowKey[],
  exclude: ReadonlySet<number>,
): Promise<Set<number>> {
  const out = new Set<number>();
  let from: ISODate | null = null;
  let to: ISODate | null = null;
  for (const r of rows) {
    if (from === null || r.date < from) from = r.date;
    if (to === null || r.date > to) to = r.date;
  }
  if (from === null || to === null) return out;
  const existing = await txRepo.findFlowsForDuplicates(userId, {
    from: addDays(from, -POSSIBLE_WINDOW_DAYS),
    to: addDays(to, POSSIBLE_WINDOW_DAYS),
  });
  const dates = new Map<string, Set<ISODate>>();
  for (const e of existing) {
    if (e.accountId !== accountId) continue;
    const key = `${e.type}|${e.amount}`;
    const set = dates.get(key) ?? new Set<ISODate>();
    set.add(e.date);
    dates.set(key, set);
  }
  rows.forEach((r, i) => {
    if (exclude.has(i)) return;
    const set = dates.get(`${r.type}|${r.amount}`);
    if (!set) return;
    for (let d = -POSSIBLE_WINDOW_DAYS; d <= POSSIBLE_WINDOW_DAYS; d++) {
      if (set.has(addDays(r.date, d))) {
        out.add(i);
        return;
      }
    }
  });
  return out;
}

/**
 * Calcule importHash, détecte les doublons (existants, dans le fichier, possibles), suggère une
 * catégorie (IA) et un libellé lisible.
 */
export async function previewImport(
  userId: string,
  input: ImportPreviewData,
): Promise<Result<ImportPreviewRow[]>> {
  if (!(await accountRepo.findAccount(userId, input.accountId))) {
    return err(
      appError('NOT_FOUND', 'Compte introuvable.', { accountId: ['Compte introuvable.'] }),
    );
  }
  const rows = input.rows;
  const hashes = rows.map((r) => computeImportHash(r));
  const existing = await findExisting(userId, rows, hashes);
  const possible = await findPossible(userId, input.accountId, rows, existing);

  const predictions = await predictCategories(
    userId,
    rows.map((r) => ({ label: r.label, amount: r.amount, type: r.type })),
  );
  if (!predictions.ok) return predictions;
  const categories = new Map((await categoryRepo.listCategories(userId)).map((c) => [c.id, c]));

  const seen = new Set<string>();
  return ok(
    rows.map((r, i): ImportPreviewRow => {
      const hash = hashes[i] ?? computeImportHash(r);
      const duplicate = existing.has(i)
        ? 'EXISTING'
        : seen.has(hash)
          ? 'IN_FILE'
          : possible.has(i)
            ? 'POSSIBLE'
            : 'NONE';
      seen.add(hash);
      const p = predictions.value[i] ?? null;
      const category = p ? categories.get(p.categoryId) : undefined;
      const valid = category !== undefined && isCategoryCompatible(r.type, category.kind);
      return {
        index: r.index,
        date: r.date,
        label: r.label,
        amount: r.amount,
        type: r.type,
        ...(r.note !== undefined ? { note: r.note } : {}),
        importHash: hash,
        duplicate,
        suggestedCategoryId: valid && p ? p.categoryId : null,
        suggestionConfidence: valid && p ? p.confidence : null,
        suggestedLabel: aiEngine.cleanLabel(r.label),
      };
    }),
  );
}

/** Crée les transactions (ignore les doublons existants), en une transaction Prisma. */
export async function commitImport(
  userId: string,
  input: ImportCommitData,
): Promise<Result<ImportCommitResult>> {
  return withPrismaErrors(async () => {
    if (!(await accountRepo.findAccount(userId, input.accountId))) {
      return err(
        appError('NOT_FOUND', 'Compte introuvable.', { accountId: ['Compte introuvable.'] }),
      );
    }
    const categoryIds = input.rows.flatMap((r) => (r.categoryId === null ? [] : [r.categoryId]));
    const categories = await categoryRepo.findCategoriesByIds(userId, categoryIds);
    for (const r of input.rows) {
      if (r.categoryId === null) continue;
      const c = categories.get(r.categoryId);
      if (!c) return err(appError('NOT_FOUND', `Catégorie introuvable (ligne ${r.index + 1}).`));
      if (!isCategoryCompatible(r.type, c.kind)) {
        return err(
          appError(
            'VALIDATION',
            `Ligne ${r.index + 1} : la catégorie « ${c.name} » ne correspond pas au type de la transaction.`,
          ),
        );
      }
    }

    // Empreintes recalculées côté serveur (on ne fait pas confiance au client), sur le libellé
    // bancaire d'origine quand un libellé nettoyé a été choisi : dédoublonnage stable.
    const keys = input.rows.map((r) => ({ ...r, label: r.originalLabel ?? r.label }));
    const hashes = keys.map((r) => computeImportHash(r));
    const result = await prisma.$transaction(
      async (tx) => {
        const existing = await findExisting(userId, keys, hashes, tx);
        const toCreate = input.rows.flatMap((r, i) =>
          existing.has(i)
            ? []
            : [
                {
                  accountId: input.accountId,
                  categoryId: r.categoryId,
                  type: r.type,
                  amount: r.amount,
                  date: r.date,
                  label: r.label.trim(),
                  note: r.note === undefined || r.note.trim() === '' ? null : r.note.trim(),
                  transferAccountId: null,
                  recurringId: null,
                  importHash: hashes[i] ?? computeImportHash(r),
                  categorySource:
                    r.categoryId === null
                      ? null
                      : r.categoryFromAI
                        ? ('AI' as const)
                        : ('IMPORT' as const),
                  aiConfidence: null,
                },
              ],
        );
        const created = await txRepo.createManyTransactions(userId, toCreate, tx);
        return { created, skipped: input.rows.length - toCreate.length };
      },
      { timeout: 30_000 },
    );

    if (result.created >= RETRAIN_MIN_ROWS) {
      const retrained = await retrainCategorizer(userId);
      if (!retrained.ok) {
        // L'import est enregistré : on le dit clairement plutôt que de masquer l'échec.
        return err(
          appError(
            'INTERNAL',
            `${result.created} transactions importées, mais la mise à jour de la catégorisation automatique a échoué.`,
          ),
        );
      }
    }
    return ok(result);
  });
}
