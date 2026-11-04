import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query';

/** Invalide tout ce qui dérive des transactions (listes, soldes, tableau de bord, budgets, IA). */
export async function invalidateFinanceQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.transactions() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.budgets() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tags }),
    queryClient.invalidateQueries({ queryKey: queryKeys.breakdown() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.monthlySeries() }),
    queryClient.invalidateQueries({ queryKey: ['ai'] }),
  ]);
}
