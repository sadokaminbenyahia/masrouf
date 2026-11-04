// Propriétaire : agent K — assistant « Pose une question à tes finances »
import type { AssistantAnswer, AssistantContext, AssistantIntent, FinanceTools } from '../types';
import { ANSWERS } from './answers';
import { extractQuestionAmount, matchCategory } from './entities';
import { detectIntent, INTENT_SAMPLES, type IntentScore } from './intents';
import { fnv1a, maskSpans, normalizeQuestion } from './normalize';
import { parsePeriod, parsePeriods } from './periods';

export const EXAMPLE_QUESTIONS: string[] = [
  'Combien j’ai dépensé en restaurants ce trimestre ?',
  'Quelles sont mes plus grosses dépenses du mois dernier ?',
  'Est-ce que je dépense plus que le mois dernier ?',
  'Combien il me reste dans mon budget courses ?',
  'Où part mon argent ce mois-ci ?',
  'Combien j’aurai à la fin du mois ?',
  'Est-ce que je peux me permettre un téléphone à 900 dinars ?',
  'Quel est mon taux d’épargne cette année ?',
];

const GREETING_RE = /^(?:bonjour|bonsoir|salut|hello|coucou|salam|aslema|ahla|hey|merci)\b/;

const HELP_TEXT =
  'Je n’ai pas bien compris votre question. Je peux vous renseigner sur vos dépenses et revenus, vos catégories, vos budgets, votre solde et sa prévision, vos abonnements, vos objectifs ou votre taux d’épargne. Essayez par exemple une de ces questions :';

const GREETING_TEXT =
  'Bonjour ! Je suis votre assistant financier. Posez-moi une question sur vos finances, par exemple :';

const TOOL_ERROR_TEXT =
  'Désolé, je n’ai pas pu consulter vos données pour le moment. Réessayez dans un instant.';

/** 3 à 4 suggestions : questions proches de l'intention la plus probable, puis exemples. */
export function suggestionsFor(norm: string, ranking: readonly IntentScore[]): string[] {
  const out: string[] = [];
  const top = ranking[0];
  if (top) out.push(...INTENT_SAMPLES[top.intent]);
  const offset = fnv1a(norm) % EXAMPLE_QUESTIONS.length;
  for (let i = 0; i < EXAMPLE_QUESTIONS.length && out.length < 4; i++) {
    const q = EXAMPLE_QUESTIONS[(offset + i) % EXAMPLE_QUESTIONS.length];
    if (q && !out.includes(q)) out.push(q);
  }
  return out.slice(0, 4);
}

function notUnderstood(norm: string, ranking: readonly IntentScore[]): AssistantAnswer {
  return {
    intent: 'UNKNOWN',
    understood: false,
    text: GREETING_RE.test(norm) ? GREETING_TEXT : HELP_TEXT,
    highlights: [],
    chart: null,
    suggestions: suggestionsFor(norm, ranking),
    period: null,
    href: null,
  };
}

function toolFailure(intent: AssistantIntent, period: AssistantAnswer['period']): AssistantAnswer {
  return {
    intent,
    understood: true,
    text: TOOL_ERROR_TEXT,
    highlights: [],
    chart: null,
    suggestions: [],
    period,
    href: null,
  };
}

/**
 * Répond à une question en français : normalisation → périodes → entités → intention →
 * appel des outils typés. Ne lève jamais d'exception : une erreur d'outil donne une réponse
 * d'excuse, sans aucun chiffre.
 */
export async function askAssistant(
  question: string,
  ctx: AssistantContext,
  tools: FinanceTools,
): Promise<AssistantAnswer> {
  const norm = normalizeQuestion(question);
  const today = ctx.today;
  const periods = parsePeriods(norm, today);
  const period = parsePeriod(norm, today);
  const masked = maskSpans(
    norm,
    periods.flatMap((p) => (p.span ? [p.span] : [])),
  );
  const amount = extractQuestionAmount(masked);
  const expenseCategory = matchCategory(masked, ctx.categories, 'EXPENSE')?.category ?? null;
  const incomeCategory = matchCategory(masked, ctx.categories, 'INCOME')?.category ?? null;

  const detection = detectIntent(norm, {
    hasCategory: expenseCategory !== null,
    hasAmount: amount !== null,
    hasPeriod: periods.length > 0,
  });
  if (detection.intent === 'UNKNOWN') return notUnderstood(norm, detection.ranking);

  const intent = detection.intent;
  const notes = [...new Set(periods.flatMap((p) => (p.note ? [p.note] : [])))];
  try {
    const answer = await ANSWERS[intent]({
      norm,
      today,
      ctx,
      tools,
      period,
      periods,
      expenseCategory,
      incomeCategory,
      amount,
    });
    return notes.length > 0 ? { ...answer, text: `${notes.join(' ')} ${answer.text}` } : answer;
  } catch {
    return toolFailure(intent, { from: period.from, to: period.to, label: period.label });
  }
}
