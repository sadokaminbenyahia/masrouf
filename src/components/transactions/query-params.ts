/**
 * Paramètres d'URL de /transactions ↔ TransactionQuery (fonctions pures, partagées RSC + client).
 *
 * Paramètres reconnus : q, type, accountId, categoryId (répétables ou séparés par des virgules),
 * uncategorized=1, tag, from, to, min, max (millimes entiers), page, size, sort, dir.
 * Un paramètre invalide est ignoré (jamais d'erreur) ; le résultat est validé par
 * `transactionQuerySchema`.
 */
import { formatDateFR, isISODate, type DateRange, type ISODate } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import { PERIOD_LABELS, PERIOD_PRESETS, resolvePeriod, type PeriodPreset } from '@/domain/periods';
import { TRANSACTION_TYPES, type TransactionType } from '@/domain/types';
import { idSchema, signedMillimesSchema } from '@/lib/schemas/common';
import { transactionQuerySchema, type TransactionQueryData } from '@/lib/schemas/transactions';

export type SearchParamsRecord = Record<string, string | string[] | undefined>;
/** `URLSearchParams`, `ReadonlyURLSearchParams` (next/navigation) ou l'objet `searchParams` d'une page. */
export type SearchParamsLike = SearchParamsRecord | { getAll(name: string): string[] };

export type SortField = TransactionQueryData['sort']['field'];
export type SortDirection = TransactionQueryData['sort']['direction'];

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_SORT: TransactionQueryData['sort'] = { field: 'date', direction: 'desc' };

/** Sens de tri par défaut quand on choisit une colonne. */
export const DEFAULT_DIRECTION: Record<SortField, SortDirection> = {
  date: 'desc',
  amount: 'desc',
  label: 'asc',
};

const SORT_FIELDS: readonly SortField[] = ['date', 'amount', 'label'];

export const TYPE_LABELS: Record<TransactionType, string> = {
  EXPENSE: 'Dépenses',
  INCOME: 'Revenus',
  TRANSFER: 'Virements',
};

function isRecord(sp: SearchParamsLike): sp is SearchParamsRecord {
  return typeof (sp as { getAll?: unknown }).getAll !== 'function';
}

function getAll(sp: SearchParamsLike, name: string): string[] {
  if (!isRecord(sp)) return sp.getAll(name);
  const v = sp[name];
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function first(sp: SearchParamsLike, name: string): string | undefined {
  const v = getAll(sp, name)[0];
  if (v === undefined) return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

/** Valeurs répétées et/ou séparées par des virgules, nettoyées et dédoublonnées. */
function list(sp: SearchParamsLike, name: string): string[] {
  const out: string[] = [];
  for (const raw of getAll(sp, name)) {
    for (const part of raw.split(',')) {
      const t = part.trim();
      if (t !== '' && !out.includes(t)) out.push(t);
    }
  }
  return out;
}

function parseIntStrict(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^-?\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : undefined;
}

function isTransactionType(v: string): v is TransactionType {
  return (TRANSACTION_TYPES as readonly string[]).includes(v);
}

function isSortField(v: string): v is SortField {
  return (SORT_FIELDS as readonly string[]).includes(v);
}

const idsOf = (values: string[], max: number): string[] =>
  values.filter((v) => idSchema.safeParse(v).success).slice(0, max);

/** searchParams → TransactionQuery validée (paramètres invalides ignorés). */
export function parseTransactionSearchParams(sp: SearchParamsLike): TransactionQueryData {
  const candidate: Record<string, unknown> = {};

  const q = first(sp, 'q');
  if (q !== undefined) candidate.search = q.slice(0, 100);

  const types = list(sp, 'type')
    .map((t) => t.toUpperCase())
    .filter(isTransactionType);
  // Les trois types cochés = aucun filtre.
  if (types.length > 0 && types.length < TRANSACTION_TYPES.length) candidate.types = types;

  const accountIds = idsOf(list(sp, 'accountId'), 50);
  if (accountIds.length > 0) candidate.accountIds = accountIds;

  const categoryIds = idsOf(list(sp, 'categoryId'), 100);
  if (categoryIds.length > 0) candidate.categoryIds = categoryIds;

  const uncategorized = first(sp, 'uncategorized');
  if (uncategorized === '1' || uncategorized === 'true') candidate.uncategorized = true;

  const tag = first(sp, 'tag');
  if (tag !== undefined && tag.length <= 30) candidate.tag = tag;

  let from = first(sp, 'from');
  let to = first(sp, 'to');
  if (from !== undefined && !isISODate(from)) from = undefined;
  if (to !== undefined && !isISODate(to)) to = undefined;
  if (from !== undefined && to !== undefined && from > to) [from, to] = [to, from];
  if (from !== undefined) candidate.from = from;
  if (to !== undefined) candidate.to = to;

  const okAmount = (n: number | undefined) =>
    n !== undefined && n >= 0 && signedMillimesSchema.safeParse(n).success ? n : undefined;
  let min = okAmount(parseIntStrict(first(sp, 'min')));
  let max = okAmount(parseIntStrict(first(sp, 'max')));
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  if (min !== undefined) candidate.minAmount = min;
  if (max !== undefined) candidate.maxAmount = max;

  const page = parseIntStrict(first(sp, 'page'));
  if (page !== undefined && page >= 1) candidate.page = page;

  const size = parseIntStrict(first(sp, 'size'));
  if (size !== undefined && (PAGE_SIZES as readonly number[]).includes(size)) {
    candidate.pageSize = size;
  }

  const sort = first(sp, 'sort');
  const dir = first(sp, 'dir');
  if (sort !== undefined && isSortField(sort)) {
    candidate.sort = {
      field: sort,
      direction: dir === 'asc' || dir === 'desc' ? dir : DEFAULT_DIRECTION[sort],
    };
  } else if (dir === 'asc' || dir === 'desc') {
    candidate.sort = { field: DEFAULT_SORT.field, direction: dir };
  }

  const parsed = transactionQuerySchema.safeParse(candidate);
  return parsed.success ? parsed.data : transactionQuerySchema.parse({});
}

/** TransactionQuery → URLSearchParams (seules les valeurs non par défaut, ordre stable). */
export function toSearchParams(query: TransactionQueryData): URLSearchParams {
  const sp = new URLSearchParams();
  if (query.search) sp.set('q', query.search);
  if (query.types && query.types.length > 0) sp.set('type', query.types.join(','));
  if (query.accountIds && query.accountIds.length > 0) {
    sp.set('accountId', query.accountIds.join(','));
  }
  if (query.categoryIds && query.categoryIds.length > 0) {
    sp.set('categoryId', query.categoryIds.join(','));
  }
  if (query.uncategorized) sp.set('uncategorized', '1');
  if (query.tag) sp.set('tag', query.tag);
  if (query.from) sp.set('from', query.from);
  if (query.to) sp.set('to', query.to);
  if (query.minAmount !== undefined) sp.set('min', String(query.minAmount));
  if (query.maxAmount !== undefined) sp.set('max', String(query.maxAmount));
  const { field, direction } = query.sort;
  if (field !== DEFAULT_SORT.field || direction !== DEFAULT_SORT.direction) {
    sp.set('sort', field);
    sp.set('dir', direction);
  }
  if (query.pageSize !== DEFAULT_PAGE_SIZE) sp.set('size', String(query.pageSize));
  if (query.page > 1) sp.set('page', String(query.page));
  return sp;
}

/** Clé canonique (comparaison de deux requêtes). */
export function serializeQuery(query: TransactionQueryData): string {
  return toSearchParams(query).toString();
}

export function sameQuery(a: TransactionQueryData, b: TransactionQueryData): boolean {
  return serializeQuery(a) === serializeQuery(b);
}

export type FilterPatch = Partial<Omit<TransactionQueryData, 'page' | 'pageSize' | 'sort'>>;

/**
 * Applique un changement de filtres : revient à la page 1. Une clé présente avec la valeur
 * `undefined` (ou un tableau vide) retire le filtre.
 */
export function withFilters(query: TransactionQueryData, patch: FilterPatch): TransactionQueryData {
  const next: TransactionQueryData = { ...query, page: 1 };
  for (const [key, value] of Object.entries(patch) as [keyof FilterPatch, unknown][]) {
    const empty =
      value === undefined ||
      value === '' ||
      value === false ||
      (Array.isArray(value) && !value.length);
    if (empty) delete next[key];
    else (next as Record<string, unknown>)[key] = value;
  }
  return next;
}

/** Retire tous les filtres (garde le tri et la taille de page). */
export function clearFilters(query: TransactionQueryData): TransactionQueryData {
  return { page: 1, pageSize: query.pageSize, sort: query.sort };
}

export function hasActiveFilters(query: TransactionQueryData): boolean {
  return (
    !!query.search ||
    !!query.types?.length ||
    !!query.accountIds?.length ||
    !!query.categoryIds?.length ||
    !!query.uncategorized ||
    !!query.tag ||
    !!query.from ||
    !!query.to ||
    query.minAmount !== undefined ||
    query.maxAmount !== undefined
  );
}

/** Tri suivant après un clic sur l'en-tête `field`. */
export function nextSort(
  current: TransactionQueryData['sort'],
  field: SortField,
): TransactionQueryData['sort'] {
  if (current.field === field) {
    return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { field, direction: DEFAULT_DIRECTION[field] };
}

/** Preset correspondant exactement à l'intervalle, sinon CUSTOM. */
export function detectPreset(range: DateRange, today: ISODate): PeriodPreset {
  for (const preset of PERIOD_PRESETS) {
    if (preset === 'CUSTOM') continue;
    const r = resolvePeriod(preset, today);
    if (r.from === range.from && r.to === range.to) return preset;
  }
  return 'CUSTOM';
}

/** « Ce mois », « 3 mars – 12 avril 2026 », « Depuis le 3 mars 2026 »… */
export function describePeriod(
  from: ISODate | undefined,
  to: ISODate | undefined,
  today: ISODate,
): string | null {
  if (from && to) {
    const preset = detectPreset({ from, to }, today);
    if (preset !== 'CUSTOM') return PERIOD_LABELS[preset];
    if (from === to) return formatDateFR(from);
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    return `${formatDateFR(from, sameYear ? 'dayMonth' : 'long')} – ${formatDateFR(to)}`;
  }
  if (from) return `Depuis le ${formatDateFR(from)}`;
  if (to) return `Jusqu'au ${formatDateFR(to)}`;
  return null;
}

export interface ActiveFilterChip {
  id: string;
  label: string;
  /** Requête obtenue en retirant ce filtre */
  next: TransactionQueryData;
}

/** Chips des filtres actifs (chacune amovible). */
export function describeActiveFilters(
  query: TransactionQueryData,
  ctx: { accountNames: Map<string, string>; categoryNames: Map<string, string>; today: ISODate },
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (query.search) {
    chips.push({
      id: 'search',
      label: `Recherche : « ${query.search} »`,
      next: withFilters(query, { search: undefined }),
    });
  }
  for (const t of query.types ?? []) {
    chips.push({
      id: `type:${t}`,
      label: TYPE_LABELS[t],
      next: withFilters(query, { types: (query.types ?? []).filter((x) => x !== t) }),
    });
  }
  for (const id of query.accountIds ?? []) {
    chips.push({
      id: `account:${id}`,
      label: `Compte : ${ctx.accountNames.get(id) ?? 'inconnu'}`,
      next: withFilters(query, { accountIds: (query.accountIds ?? []).filter((x) => x !== id) }),
    });
  }
  for (const id of query.categoryIds ?? []) {
    chips.push({
      id: `category:${id}`,
      label: `Catégorie : ${ctx.categoryNames.get(id) ?? 'inconnue'}`,
      next: withFilters(query, {
        categoryIds: (query.categoryIds ?? []).filter((x) => x !== id),
      }),
    });
  }
  if (query.uncategorized) {
    chips.push({
      id: 'uncategorized',
      label: 'Sans catégorie',
      next: withFilters(query, { uncategorized: undefined }),
    });
  }
  if (query.tag) {
    chips.push({
      id: 'tag',
      label: `Tag : ${query.tag}`,
      next: withFilters(query, { tag: undefined }),
    });
  }
  const period = describePeriod(query.from, query.to, ctx.today);
  if (period) {
    chips.push({
      id: 'period',
      label: `Période : ${period}`,
      next: withFilters(query, { from: undefined, to: undefined }),
    });
  }
  if (query.minAmount !== undefined) {
    chips.push({
      id: 'min',
      label: `Montant ≥ ${formatMoney(query.minAmount)}`,
      next: withFilters(query, { minAmount: undefined }),
    });
  }
  if (query.maxAmount !== undefined) {
    chips.push({
      id: 'max',
      label: `Montant ≤ ${formatMoney(query.maxAmount)}`,
      next: withFilters(query, { maxAmount: undefined }),
    });
  }
  return chips;
}

/** Lien d'export CSV conservant la période filtrée. */
export function exportHref(query: Pick<TransactionQueryData, 'from' | 'to'>): string {
  const sp = new URLSearchParams();
  if (query.from) sp.set('from', query.from);
  if (query.to) sp.set('to', query.to);
  const qs = sp.toString();
  return qs ? `/api/export/transactions?${qs}` : '/api/export/transactions';
}
