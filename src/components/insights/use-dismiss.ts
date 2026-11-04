'use client';
/**
 * Masquage optimiste d'un conseil ou d'une anomalie (dismissInsightAction). L'élément disparaît
 * immédiatement ; en cas d'échec il réapparaît et un toast d'erreur s'affiche.
 * Pas d'« Annuler » : la clé ignorée est définitive côté serveur, d'où le toast « Masqué ».
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { dismissInsightAction } from '@/app/actions/ai';
import { errorMessage, queryKeys, unwrap } from '@/lib/query';
import { toastError, toastSuccess } from '@/lib/toast';

export function useDismissible<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  successMessage: string,
) {
  const queryClient = useQueryClient();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());

  const mutation = useMutation({
    mutationFn: async (key: string) => unwrap(await dismissInsightAction(key)),
    onMutate: (key) => {
      setHidden((prev) => new Set(prev).add(key));
    },
    onError: (e, key) => {
      setHidden((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      toastError(errorMessage(e));
    },
    onSuccess: () => {
      toastSuccess(successMessage);
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.ai.anomalies });
    },
  });

  const visible = useMemo(
    () => items.filter((i) => !hidden.has(getKey(i))),
    [items, hidden, getKey],
  );
  const { mutate } = mutation;
  const dismiss = useCallback((key: string) => mutate(key), [mutate]);
  return { visible, dismiss };
}
