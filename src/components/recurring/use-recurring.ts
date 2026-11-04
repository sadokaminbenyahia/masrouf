'use client';
/**
 * Données et mutations des règles récurrentes (TanStack Query), avec mises à jour optimistes
 * et retour arrière en cas d'erreur.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { RecurringCandidate } from '@/domain/ai/types';
import type { RecurringRule } from '@/domain/types';
import { dismissInsightAction, getRecurringSuggestionsAction } from '@/app/actions/ai';
import {
  createRecurringAction,
  deleteRecurringAction,
  listRecurringAction,
  updateRecurringAction,
} from '@/app/actions/recurring';
import { errorMessage, queryKeys, unwrap } from '@/lib/query';
import type { RecurringInput, RecurringPatch } from '@/lib/schemas/recurring';
import { toastError } from '@/lib/toast';

const TEMP_PREFIX = 'temp-';

export function isTempRule(rule: RecurringRule): boolean {
  return rule.id.startsWith(TEMP_PREFIX);
}

/** Invalide tout ce qui dépend des récurrences (tableau de bord, prévisions, suggestions). */
export function invalidateRecurringDependents(qc: QueryClient): void {
  void Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.recurring }),
    qc.invalidateQueries({ queryKey: queryKeys.dashboard() }),
    qc.invalidateQueries({ queryKey: queryKeys.transactions() }),
    qc.invalidateQueries({ queryKey: queryKeys.accounts }),
    qc.invalidateQueries({ queryKey: queryKeys.ai.forecast }),
  ]);
}

function setRules(qc: QueryClient, update: (rules: RecurringRule[]) => RecurringRule[]): void {
  qc.setQueryData<RecurringRule[]>(queryKeys.recurring, (old) => update(old ?? []));
}

export function useRecurringRules(initialData?: RecurringRule[]) {
  return useQuery({
    queryKey: queryKeys.recurring,
    queryFn: async () => unwrap(await listRecurringAction()),
    initialData,
    staleTime: 30_000,
  });
}

export function useRecurringSuggestions() {
  return useQuery({
    queryKey: queryKeys.ai.recurringSuggestions,
    queryFn: async () => unwrap(await getRecurringSuggestionsAction()),
    staleTime: 5 * 60_000,
  });
}

interface RulesSnapshot {
  rules: RecurringRule[] | undefined;
}

export function useUpdateRecurring() {
  const qc = useQueryClient();
  return useMutation<RecurringRule, Error, { id: string; patch: RecurringPatch }, RulesSnapshot>({
    mutationFn: async ({ id, patch }) => unwrap(await updateRecurringAction(id, patch)),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: queryKeys.recurring });
      const rules = qc.getQueryData<RecurringRule[]>(queryKeys.recurring);
      setRules(qc, (list) =>
        list.map((r) => {
          if (r.id !== id) return r;
          const next: RecurringRule = { ...r };
          if (patch.active !== undefined) next.active = patch.active;
          if (patch.autoCreate !== undefined) next.autoCreate = patch.autoCreate;
          if (patch.label !== undefined) next.label = patch.label;
          if (patch.amount !== undefined) next.amount = patch.amount;
          if (patch.frequency !== undefined) next.frequency = patch.frequency;
          if (patch.nextDate !== undefined) next.nextDate = patch.nextDate;
          if (patch.accountId !== undefined) next.accountId = patch.accountId;
          if (patch.categoryId !== undefined) next.categoryId = patch.categoryId;
          if (patch.endDate !== undefined) next.endDate = patch.endDate;
          return next;
        }),
      );
      return { rules };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.rules) qc.setQueryData(queryKeys.recurring, ctx.rules);
      toastError(errorMessage(e));
    },
    onSuccess: (rule) => setRules(qc, (list) => list.map((r) => (r.id === rule.id ? rule : r))),
    onSettled: () => invalidateRecurringDependents(qc),
  });
}

export function useCreateRecurring() {
  const qc = useQueryClient();
  return useMutation<RecurringRule, Error, RecurringInput>({
    mutationFn: async (input) => unwrap(await createRecurringAction(input)),
    onSuccess: (rule) => setRules(qc, (list) => [...list.filter((r) => r.id !== rule.id), rule]),
    onSettled: () => {
      invalidateRecurringDependents(qc);
      void qc.invalidateQueries({ queryKey: queryKeys.ai.recurringSuggestions });
    },
  });
}

export function useDeleteRecurring() {
  const qc = useQueryClient();
  return useMutation<{ id: string }, Error, string, RulesSnapshot>({
    mutationFn: async (id) => unwrap(await deleteRecurringAction(id)),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.recurring });
      const rules = qc.getQueryData<RecurringRule[]>(queryKeys.recurring);
      setRules(qc, (list) => list.filter((r) => r.id !== id));
      return { rules };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.rules) qc.setQueryData(queryKeys.recurring, ctx.rules);
      toastError(errorMessage(e));
    },
    onSettled: () => {
      invalidateRecurringDependents(qc);
      void qc.invalidateQueries({ queryKey: queryKeys.ai.recurringSuggestions });
    },
  });
}

interface SuggestionSnapshot {
  rules: RecurringRule[] | undefined;
  suggestions: RecurringCandidate[] | undefined;
}

function candidateToInput(c: RecurringCandidate): RecurringInput {
  return {
    accountId: c.accountId,
    categoryId: c.categoryId,
    type: c.type,
    amount: c.amount,
    label: c.label.slice(0, 140),
    frequency: c.frequency,
    startDate: c.nextDate,
    endDate: null,
    autoCreate: true,
  };
}

async function snapshotSuggestions(qc: QueryClient): Promise<SuggestionSnapshot> {
  await Promise.all([
    qc.cancelQueries({ queryKey: queryKeys.recurring }),
    qc.cancelQueries({ queryKey: queryKeys.ai.recurringSuggestions }),
  ]);
  return {
    rules: qc.getQueryData<RecurringRule[]>(queryKeys.recurring),
    suggestions: qc.getQueryData<RecurringCandidate[]>(queryKeys.ai.recurringSuggestions),
  };
}

function restoreSuggestions(qc: QueryClient, ctx: SuggestionSnapshot | undefined): void {
  if (!ctx) return;
  if (ctx.rules) qc.setQueryData(queryKeys.recurring, ctx.rules);
  if (ctx.suggestions) qc.setQueryData(queryKeys.ai.recurringSuggestions, ctx.suggestions);
}

function removeSuggestion(qc: QueryClient, key: string): void {
  qc.setQueryData<RecurringCandidate[]>(queryKeys.ai.recurringSuggestions, (old) =>
    (old ?? []).filter((c) => c.key !== key),
  );
}

/** « Ajouter comme récurrence » : la règle apparaît tout de suite dans la liste. */
export function useAcceptSuggestion() {
  const qc = useQueryClient();
  return useMutation<RecurringRule, Error, RecurringCandidate, SuggestionSnapshot>({
    mutationFn: async (candidate) => unwrap(await createRecurringAction(candidateToInput(candidate))),
    onMutate: async (candidate) => {
      const ctx = await snapshotSuggestions(qc);
      removeSuggestion(qc, candidate.key);
      const input = candidateToInput(candidate);
      const temp: RecurringRule = {
        id: `${TEMP_PREFIX}${candidate.key}`,
        accountId: input.accountId,
        categoryId: input.categoryId ?? null,
        type: input.type,
        amount: input.amount,
        label: input.label,
        frequency: input.frequency,
        startDate: input.startDate,
        nextDate: input.startDate,
        endDate: null,
        active: true,
        autoCreate: true,
      };
      setRules(qc, (list) => [...list, temp]);
      return ctx;
    },
    onError: (e, _c, ctx) => {
      restoreSuggestions(qc, ctx);
      toastError(errorMessage(e));
    },
    onSuccess: (rule, candidate) =>
      setRules(qc, (list) => list.map((r) => (r.id === `${TEMP_PREFIX}${candidate.key}` ? rule : r))),
    onSettled: () => invalidateRecurringDependents(qc),
  });
}

/** « Ignorer » : la suggestion disparaît et n'est plus proposée. */
export function useDismissSuggestion() {
  const qc = useQueryClient();
  return useMutation<void, Error, RecurringCandidate, SuggestionSnapshot>({
    mutationFn: async (candidate) => unwrap(await dismissInsightAction(candidate.key)),
    onMutate: async (candidate) => {
      const ctx = await snapshotSuggestions(qc);
      removeSuggestion(qc, candidate.key);
      return ctx;
    },
    onError: (e, _c, ctx) => {
      restoreSuggestions(qc, ctx);
      toastError(errorMessage(e));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.ai.recurringSuggestions }),
  });
}
