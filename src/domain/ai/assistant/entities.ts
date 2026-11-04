/**
 * Extraction d'entités dans une question normalisée : catégorie (synonymes FR/tunisiens puis
 * correspondance floue par trigrammes/Jaccard), montant et objectif d'épargne.
 */
import { MAX_AMOUNT_MILLIMES, parseMoneyTerm, type Millimes } from '../../money';
import type { AiCategory } from '../types';
import { contentWords, normalizeQuestion, wordSimilarity } from './normalize';

/** Seuil de similarité floue (Jaccard sur trigrammes). */
export const FUZZY_THRESHOLD = 0.5;

/**
 * Synonymes → nom (normalisé) de la catégorie par défaut. Les expressions de plusieurs mots
 * sont cherchées telles quelles ; les mots seuls aussi au pluriel.
 */
export const CATEGORY_SYNONYMS: Record<string, string[]> = {
  restaurants: [
    'resto',
    'restau',
    'restaurant',
    'fast food',
    'pizza',
    'pizzeria',
    'sandwich',
    'mlawi',
    'kebab',
    'burger',
    'makloub',
    'chapati',
    'lablabi',
    'manger dehors',
    'livraison',
  ],
  courses: [
    'bouffe',
    'supermarche',
    'hypermarche',
    'marche',
    'epicerie',
    'alimentation',
    'nourriture',
    'provisions',
    'carrefour',
    'monoprix',
    'aziza',
    'magasin general',
    'geant',
    'hanout',
    'attar',
  ],
  cafes: ['cafe', '9ahwa', 'kahwa', 'qahwa', 'cappuccino', 'capucin', 'salon de the'],
  carburant: ['essence', 'gasoil', 'gazole', 'diesel', 'agil', 'shell', 'station service'],
  telecom: [
    'internet',
    'telephone',
    'mobile',
    'forfait',
    'recharge',
    'ooredoo',
    'orange',
    'tunisie telecom',
    'wifi',
    'adsl',
    'fibre',
  ],
  factures: ['electricite', 'eau', 'steg', 'sonede', 'gaz', 'facture'],
  loisirs: [
    'sortie',
    'cine',
    'cinema',
    'concert',
    'spectacle',
    'jeu',
    'jeux',
    'sport',
    'salle de sport',
    'loisir',
  ],
  sante: [
    'medecin',
    'pharmacie',
    'medicament',
    'docteur',
    'dentiste',
    'clinique',
    'hopital',
    'mutuelle',
  ],
  transport: ['taxi', 'louage', 'metro', 'bus', 'train', 'tgm', 'uber', 'bolt', 'transports'],
  loyer: ['appartement', 'logement', 'location'],
  shopping: ['vetement', 'habits', 'chaussure', 'fringues', 'zara', 'mode'],
  abonnements: ['netflix', 'spotify', 'streaming', 'shahid', 'deezer', 'youtube'],
  education: ['ecole', 'universite', 'fac', 'cours', 'livre', 'scolarite', 'formation', 'creche'],
  'famille & cadeaux': ['cadeau', 'famille', 'anniversaire', 'mariage', 'fete', 'aid'],
  salaire: ['salaire', 'paie'],
  freelance: ['freelance', 'mission', 'client'],
};

/** Mots trop génériques pour désigner une catégorie ou un objectif. */
const GENERIC_WORDS = new Set([
  'depense',
  'depenses',
  'depenser',
  'depensee',
  'depensees',
  'budget',
  'budgets',
  'objectif',
  'objectifs',
  'solde',
  'soldes',
  'reste',
  'restera',
  'argent',
  'total',
  'gagne',
  'gagner',
  'revenu',
  'revenus',
  'autre',
  'autres',
  'compte',
  'comptes',
  'transaction',
  'transactions',
  'achat',
  'achats',
  'acheter',
  'moyenne',
  'grosse',
  'grosses',
  'gros',
  'categorie',
  'categories',
  'taux',
  'epargne',
  'prevision',
  'permettre',
  'peux',
  'abonnement',
  'abonnements',
  'atteindre',
  'quand',
  'part',
  'passe',
  'fin',
  'courant',
]);

export interface CategoryMatch {
  category: AiCategory;
  score: number;
  /** Mot ou expression ayant déclenché la correspondance */
  term: string;
}

function hasPhrase(norm: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const plural = phrase.includes(' ') ? '' : '(?:s|x)?';
  return new RegExp(`(?<![\\p{L}\\d])${escaped}${plural}(?![\\p{L}\\d])`, 'u').test(norm);
}

/**
 * Catégorie mentionnée dans la question (texte normalisé), ou null.
 * `kind` restreint les candidates (EXPENSE pour une dépense, INCOME pour un revenu).
 */
export function matchCategory(
  norm: string,
  categories: readonly AiCategory[],
  kind?: AiCategory['kind'],
): CategoryMatch | null {
  const candidates = kind ? categories.filter((c) => c.kind === kind) : [...categories];
  if (candidates.length === 0) return null;
  const byName = new Map(candidates.map((c) => [normalizeQuestion(c.name), c]));
  const exact: CategoryMatch[] = [];

  // 1. Nom complet présent dans la question.
  for (const [name, category] of byName) {
    if (name.length >= 3 && hasPhrase(norm, name)) exact.push({ category, score: 1, term: name });
  }
  // 2. Synonymes.
  for (const [canonical, synonyms] of Object.entries(CATEGORY_SYNONYMS)) {
    const category = byName.get(canonical);
    if (!category) continue;
    for (const syn of synonyms) {
      if (hasPhrase(norm, syn)) exact.push({ category, score: 1, term: syn });
    }
  }
  if (exact.length > 0) return pickBest(exact);

  // 3. Correspondance floue mot à mot.
  const fuzzy: CategoryMatch[] = [];
  const words = contentWords(norm).filter((w) => !GENERIC_WORDS.has(w));
  for (const [name, category] of byName) {
    const nameWords = contentWords(name).filter((w) => !GENERIC_WORDS.has(w));
    for (const nw of nameWords) {
      for (const w of words) {
        const s = wordSimilarity(w, nw);
        if (s >= FUZZY_THRESHOLD) fuzzy.push({ category, score: Math.min(s, 0.95), term: w });
      }
    }
  }
  return pickBest(fuzzy);
}

function pickBest(matches: readonly CategoryMatch[]): CategoryMatch | null {
  let best: CategoryMatch | null = null;
  for (const m of matches) {
    if (
      !best ||
      m.score > best.score ||
      (m.score === best.score && m.term.length > best.term.length)
    ) {
      best = m;
    }
  }
  return best;
}

export interface GoalRef {
  id: string;
  name: string;
}

/** Objectif nommé dans la question (correspondance floue sur les mots du nom), ou null. */
export function matchGoal<G extends GoalRef>(
  norm: string,
  goals: readonly G[],
): { goal: G; score: number } | null {
  const words = contentWords(norm).filter((w) => !GENERIC_WORDS.has(w));
  let best: { goal: G; score: number } | null = null;
  for (const goal of goals) {
    const name = normalizeQuestion(goal.name);
    let score = name.length >= 3 && norm.includes(name) ? 1 : 0;
    for (const gw of contentWords(name).filter((w) => !GENERIC_WORDS.has(w))) {
      for (const w of words) score = Math.max(score, wordSimilarity(w, gw));
    }
    if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) best = { goal, score };
  }
  return best;
}

const AMOUNT_RE =
  /(?<![\p{L}\d.,])(\d{1,3}(?: \d{3})+|\d+)(?:[.,](\d{1,3}))?\s*(k|dt|tnd|dinars?|d|millimes?|mill?|m)?(?![\p{L}\d])/gu;
const NOT_MONEY_AFTER = /^\s*(?:mois|jours?|ans?|annees?|semaines?|fois|%|e|eme|er|h|heures?)\b/u;

/**
 * Montant mentionné dans la question (texte normalisé, périodes masquées), en millimes.
 * Préfère un nombre suivi d'une unité monétaire ; sinon le plus grand nombre.
 * « 900 dinars » → 900 000 ; « 3,500 » → 3 500 ; « 2k » → 2 000 000 ; « 500 millimes » → 500.
 */
export function extractQuestionAmount(text: string): Millimes | null {
  let withUnit: Millimes | null = null;
  let largest: Millimes | null = null;
  for (const m of text.matchAll(AMOUNT_RE)) {
    const [whole, intPart = '', frac, unit] = m;
    const after = text.slice((m.index ?? 0) + whole.length);
    if (!unit && NOT_MONEY_AFTER.test(after)) continue;
    let value: Millimes | null = null;
    if (unit === 'k') {
      const r = parseMoneyTerm(`${intPart.replace(/ /g, '')}${frac ? `,${frac}` : ''}`);
      value = r.ok ? r.value * 1000 : null;
    } else {
      const r = parseMoneyTerm(`${intPart}${frac ? `,${frac}` : ''}${unit ? ` ${unit}` : ''}`);
      value = r.ok ? r.value : null;
    }
    // Montant hors des entiers sûrs ou au-delà du plafond métier : ignoré (jamais d'entier non sûr).
    if (value === null || value <= 0) continue;
    if (!Number.isSafeInteger(value) || value > MAX_AMOUNT_MILLIMES) continue;
    if (unit) {
      withUnit ??= value;
    } else if (largest === null || value > largest) {
      largest = value;
    }
  }
  return withUnit ?? largest;
}
