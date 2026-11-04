/**
 * Détection d'intention : mots déclencheurs pondérés et expressions régulières appliqués au
 * texte normalisé (minuscules, sans accents). Score = somme des poids des motifs trouvés ;
 * en dessous du seuil, la question n'est pas comprise.
 */
import type { AssistantIntent } from '../types';

export type KnownIntent = Exclude<AssistantIntent, 'UNKNOWN'>;

/** Score minimal pour considérer une intention comme reconnue. */
export const INTENT_THRESHOLD = 2;

interface Trigger {
  re: RegExp;
  weight: number;
}

const t = (re: RegExp, weight: number): Trigger => ({ re, weight });

/** Ordre = priorité en cas d'égalité. */
export const INTENT_TRIGGERS: Record<KnownIntent, Trigger[]> = {
  CAN_AFFORD: [
    t(/\b(?:me )?permettre\b/, 5),
    t(/\bpeux (?:je )?(?:acheter|me payer|m offrir|payer|depenser)\b/, 5),
    t(/\bpourrais (?:je )?(?:acheter|me payer|m offrir)\b/, 5),
    t(/\b(?:ai|aurai) (?:les|assez de) moyens\b/, 5),
    t(/\bassez (?:d argent )?pour (?:acheter|payer|un|une)\b/, 4),
    t(/\b(?:acheter|m offrir|craquer)\b/, 2),
  ],
  GOAL_PROGRESS: [
    t(/\bobjectifs?\b/, 5),
    t(/\b(?:atteindre|atteins|atteint|atteindrai|atteindre)\b/, 3),
    t(/\b(?:cagnotte|projet d epargne)\b/, 3),
    t(/\bou en (?:suis|est) (?:je|mon|ma)\b/, 1),
  ],
  SAVINGS_RATE: [
    t(/\btaux d epargne\b/, 6),
    t(/\bepargne\b/, 3),
    t(/\b(?:economise|economiser|economies|economie)\b/, 3),
    t(/\bmis(?: de)? cote\b|\bmets de cote\b|\bmettre de cote\b/, 3),
  ],
  SUBSCRIPTIONS: [
    t(/\babonnements?\b/, 5),
    t(/\bprelevements?\b/, 3),
    t(/\brecurrent(?:e|s|es)?\b/, 4),
    t(/\bcharges fixes\b/, 4),
    t(/\b(?:netflix|spotify|streaming)\b/, 2),
  ],
  BUDGET_STATUS: [
    t(/\bbudgets?\b/, 4),
    t(/\breste\b/, 1.5),
    t(/\bplafonds?\b/, 3),
    t(/\bdepasse\b|\bdepassement\b|\bhors budget\b/, 2),
  ],
  FORECAST: [
    t(/\bfin (?:du|de) mois\b|\bfin du mois\b/, 4),
    t(/\bprevision|\bprevoir\b|\bprevu\b|\bprojection\b/, 4),
    t(/\b(?:j aurai|aurai je|il me restera|restera|je vais avoir|vais je avoir|sera)\b/, 3),
    t(/\bprochains? mois\b|\bmois prochain\b|\bdans \d+ mois\b/, 2),
  ],
  BALANCE: [
    t(/\bsoldes?\b/, 4),
    t(/\b(?:sur|dans) (?:mon|mes) comptes?\b/, 3),
    t(/\bcomptes?\b/, 1),
    t(/\b(?:argent disponible|tresorerie|combien j ai en banque|en banque)\b/, 3),
    t(/\bcombien (?:j ai|il me reste|me reste t il)\b(?! (?:depense|gagne|recu|economise))/, 1),
  ],
  COMPARE_PERIODS: [
    // « plus que », mais aussi « plus en octobre qu'en septembre » (jusqu'à 4 mots intercalés).
    t(/\b(?:plus|moins)(?: [a-z0-9]+){0,4} (?:que|qu)\b/, 4),
    t(/\bpar rapport (?:a|au|aux)\b/, 4),
    t(/\bcompar/, 4),
    t(/\b(?:vs|versus)\b/, 4),
    t(/\b(?:evolution|evolue|augmente|baisse|diminue|hausse)\b/, 2),
  ],
  TOP_CATEGORIES: [
    t(/\bou (?:part|va|vont|passe|partent) (?:mon|mes|l)\b/, 5),
    t(/\brepartition\b/, 5),
    t(/\bpar categories?\b/, 4),
    t(/\bcategories?\b/, 2),
    t(/\bpostes? de depenses?\b|\bpostes?\b/, 3),
    t(/\b(?:je depense le plus|plus gros postes?)\b/, 2),
  ],
  TOP_MERCHANTS: [
    t(/\b(?:commercants?|marchands?|magasins?|enseignes?|boutiques?|fournisseurs?)\b/, 5),
    t(/\bou (?:j achete|je fais mes courses)\b/, 3),
    t(/\bchez qui\b/, 4),
  ],
  BIGGEST_EXPENSE: [
    t(/\bplus (?:grosses?|grandes?|importantes?|cheres?|gros|grand|cher)\b/, 3),
    t(/\b(?:grosses?|grandes?) depenses?\b|\bgros achats?\b/, 2),
    t(/\bdepenses? (?:la|les) plus (?:importantes?|elevees?|grosses?|cheres?)\b/, 4),
    t(/\b(?:top|principales?) depenses?\b/, 3),
  ],
  AVERAGE_SPENDING: [
    t(/\ben moyenne\b|\bmoyenne\b|\bmoyen\b/, 5),
    t(/\bpar mois\b|\bpar semaine\b|\bmensuellement\b/, 2.5),
    t(/\bhabituellement\b|\bd habitude\b|\bgeneralement\b|\bnormalement\b/, 2),
  ],
  INCOME_TOTAL: [
    t(/\b(?:gagne|gagner|gagnes)\b/, 4),
    t(/\brevenus?\b/, 3),
    t(/\b(?:recu|touche|encaisse)\b/, 3),
    t(/\b(?:salaire|entrees? d argent|rentrees? d argent)\b/, 3),
  ],
  SPENDING_TOTAL: [
    t(/\bdepens/, 2),
    t(/\bcombien\b/, 1),
    t(/\b(?:claque|flambe|coute|paye|sorti de ma poche|achete)\b/, 1.5),
    t(/\btotal\b/, 1),
    t(/\bcombien (?:en|pour|de)\b/, 1),
  ],
};

export const KNOWN_INTENTS = Object.keys(INTENT_TRIGGERS) as KnownIntent[];

export interface IntentScore {
  intent: KnownIntent;
  score: number;
}

export interface IntentDetection {
  /** Intention retenue ('UNKNOWN' si sous le seuil) */
  intent: AssistantIntent;
  score: number;
  /** Toutes les intentions par score décroissant (scores > 0) */
  ranking: IntentScore[];
}

export interface IntentHints {
  /** Une catégorie a été reconnue (favorise les totaux de dépenses) */
  hasCategory?: boolean;
  /** Un montant a été reconnu (favorise « puis-je me permettre ») */
  hasAmount?: boolean;
  /** Une période a été reconnue */
  hasPeriod?: boolean;
}

/** Score de chaque intention pour un texte normalisé. */
export function scoreIntents(norm: string, hints: IntentHints = {}): IntentScore[] {
  const scores: IntentScore[] = KNOWN_INTENTS.map((intent) => {
    let score = 0;
    for (const trig of INTENT_TRIGGERS[intent]) if (trig.re.test(norm)) score += trig.weight;
    return { intent, score };
  });
  const bump = (intent: KnownIntent, delta: number, onlyIfPositive = true) => {
    const s = scores.find((x) => x.intent === intent);
    if (s && (!onlyIfPositive || s.score > 0)) s.score += delta;
  };
  if (hints.hasAmount) bump('CAN_AFFORD', 1);
  if (hints.hasCategory) {
    bump('SPENDING_TOTAL', 1.5, false);
    bump('BUDGET_STATUS', 0.5);
    bump('AVERAGE_SPENDING', 0.5);
  }
  if (hints.hasPeriod) bump('SPENDING_TOTAL', 0.5);
  return scores
    .filter((s) => s.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || KNOWN_INTENTS.indexOf(a.intent) - KNOWN_INTENTS.indexOf(b.intent),
    );
}

export function detectIntent(norm: string, hints: IntentHints = {}): IntentDetection {
  const ranking = scoreIntents(norm, hints);
  const top = ranking[0];
  if (!top || top.score < INTENT_THRESHOLD) {
    return { intent: 'UNKNOWN', score: top?.score ?? 0, ranking };
  }
  return { intent: top.intent, score: top.score, ranking };
}

/** Questions types par intention (suggestions quand la question n'est pas comprise). */
export const INTENT_SAMPLES: Record<KnownIntent, string[]> = {
  SPENDING_TOTAL: [
    'Combien j’ai dépensé ce mois-ci ?',
    'Combien j’ai dépensé en restaurants ce trimestre ?',
  ],
  INCOME_TOTAL: ['Combien j’ai gagné depuis janvier ?', 'Quels sont mes revenus ce mois-ci ?'],
  COMPARE_PERIODS: [
    'Est-ce que je dépense plus que le mois dernier ?',
    'Mes courses ce mois-ci par rapport au mois dernier ?',
  ],
  TOP_CATEGORIES: ['Où part mon argent ce trimestre ?', 'Répartition de mes dépenses ce mois-ci'],
  TOP_MERCHANTS: ['Quels sont mes plus gros commerçants ?', 'Chez qui je dépense le plus ?'],
  BIGGEST_EXPENSE: [
    'Quelles sont mes plus grosses dépenses du mois dernier ?',
    'Ma plus grosse dépense cette année ?',
  ],
  AVERAGE_SPENDING: ['Combien je dépense en moyenne en courses ?', 'Ma dépense moyenne par mois ?'],
  BUDGET_STATUS: [
    'Il me reste combien dans mon budget courses ?',
    'Où en sont mes budgets ce mois-ci ?',
  ],
  BALANCE: ['Quel est mon solde ?', 'Combien j’ai sur mes comptes ?'],
  FORECAST: ['Combien j’aurai à la fin du mois ?', 'Quelle est la prévision de mon solde ?'],
  CAN_AFFORD: [
    'Est-ce que je peux me permettre un téléphone à 900 dinars ?',
    'Puis-je acheter un vélo à 450 DT ?',
  ],
  SUBSCRIPTIONS: ['Quels sont mes abonnements ?', 'Combien me coûtent mes charges fixes ?'],
  GOAL_PROGRESS: ['Quand vais-je atteindre mon objectif ?', 'Où en sont mes objectifs ?'],
  SAVINGS_RATE: [
    'Quel est mon taux d’épargne cette année ?',
    'Combien j’ai économisé ce mois-ci ?',
  ],
};
