// Propriétaire : agent K — implémentation serveur des outils typés de l'assistant (scopés userId)
import 'server-only';
import type { FinanceTools } from '@/domain/ai/types';
import { notImplemented } from './_stub';

export function createFinanceTools(_userId: string): FinanceTools {
  return notImplemented('createFinanceTools');
}
