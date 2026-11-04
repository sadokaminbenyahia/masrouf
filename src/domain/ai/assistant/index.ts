// Propriétaire : agent K — assistant « Pose une question à tes finances »
import { notImplemented } from '../_stub';
import type { AssistantAnswer, AssistantContext, FinanceTools } from '../types';

export const EXAMPLE_QUESTIONS: string[] = [
  'Combien j’ai dépensé en restaurants ce trimestre ?',
  'Quelles sont mes plus grosses dépenses du mois dernier ?',
  'Est-ce que je dépense plus que le mois dernier ?',
  'Combien il me reste dans mon budget courses ?',
];

export async function askAssistant(
  _question: string,
  _ctx: AssistantContext,
  _tools: FinanceTools,
): Promise<AssistantAnswer> {
  return notImplemented('askAssistant');
}
