// Propriétaire : agent J. Classifieur naïf bayésien multinomial + règles de démarrage
// (AI-DESIGN §1). Pur, déterministe, sérialisable.
import { CATEGORY_KEYWORDS } from './keywords';
import { charTrigrams, merchantKey, nameKey, stem, tokenize } from './text';
import type {
  AiCategory,
  CategorizeInput,
  CategorizerModel,
  CategoryPrediction,
  TrainingSample,
} from './types';
import type { CategoryKind, TransactionType } from '../types';

export const CATEGORIZER_VERSION = 1;

/** Lissage de Laplace. */
const ALPHA = 1;
/** Au-delà de cette taille, on élague les features de fréquence < 2. */
export const MAX_VOCABULARY = 20_000;
/** Poids des trigrammes de caractères du marchand (tolère « carfour »). */
const TRIGRAM_WEIGHT = 0.5;
/** Poids d'une correction de l'utilisateur. */
const CORRECTION_WEIGHT = 3;
/** Nombre d'échantillons à partir duquel les mots-clés ne comptent plus dans le modèle. */
const COLD_START_SAMPLES = 200;

export const MERCHANT_CONFIDENCE = 0.98;
export const RULE_CONFIDENCE = 0.7;
export const MODEL_MIN_CONFIDENCE = 0.6;
export const MODEL_MIN_MARGIN = 0.15;
const MAX_ALTERNATIVES = 3;

type FeatureCounts = Map<string, number>;

function add(map: FeatureCounts, key: string, weight: number): void {
  map.set(key, (map.get(key) ?? 0) + weight);
}

function amountBucket(amount: number): string {
  const dinars = Math.max(Math.abs(amount), 1) / 1000;
  return `a:${Math.floor(Math.log2(dinars))}`;
}

/** Features textuelles (mots, bigrammes, trigrammes du marchand). */
function textFeatures(label: string, out: FeatureCounts): void {
  const tokens = tokenize(label).map(stem);
  for (const t of tokens) add(out, `w:${t}`, 1);
  for (let i = 0; i + 1 < tokens.length; i++) add(out, `b:${tokens[i]} ${tokens[i + 1]}`, 1);
  for (const tri of charTrigrams(merchantKey(label))) add(out, `c:${tri}`, TRIGRAM_WEIGHT);
}

/** Features complètes d'une transaction : texte + tranche de montant + sens. */
export function extractFeatures(
  label: string,
  amount: number,
  type: TransactionType,
): FeatureCounts {
  const out: FeatureCounts = new Map();
  textFeatures(label, out);
  add(out, amountBucket(amount), 1);
  add(out, type === 'INCOME' ? 'd:in' : 'd:out', 1);
  return out;
}

// ───────────────────────── Mots-clés (pseudo-documents et règles) ─────────────────────────

interface KeywordProfile {
  /** Comptes de features des pseudo-documents */
  counts: FeatureCounts;
  total: number;
  /** Mots-clés tokenisés (et racinisés) */
  phrases: string[][];
}

function buildProfile(keywords: readonly string[]): KeywordProfile {
  const counts: FeatureCounts = new Map();
  const phrases: string[][] = [];
  const seen = new Set<string>();
  for (const kw of keywords) {
    const tokens = tokenize(kw).map(stem);
    const id = tokens.join(' ');
    if (tokens.length === 0 || seen.has(id)) continue;
    seen.add(id);
    phrases.push(tokens);
    textFeatures(kw, counts);
  }
  let total = 0;
  for (const v of counts.values()) total += v;
  return { counts, total, phrases };
}

const KEYWORD_PROFILES: ReadonlyMap<string, KeywordProfile> = new Map(
  Object.entries(CATEGORY_KEYWORDS).map(([name, kws]) => [nameKey(name), buildProfile(kws)]),
);

const KEYWORD_VOCABULARY = (() => {
  const vocab = new Set<string>();
  for (const p of KEYWORD_PROFILES.values()) for (const k of p.counts.keys()) vocab.add(k);
  return vocab.size;
})();

const rulePhraseCache = new Map<string, string[][]>();
/**
 * Mots-clés d'une catégorie pour les règles : ceux de CATEGORY_KEYWORDS plus le nom de la
 * catégorie lui-même (utile pour les catégories créées par l'utilisateur), sans doublon.
 */
function rulePhrases(name: string): string[][] {
  const key = nameKey(name);
  const cached = rulePhraseCache.get(key);
  if (cached) return cached;
  const keywords = Object.entries(CATEGORY_KEYWORDS).find(([n]) => nameKey(n) === key)?.[1] ?? [];
  const phrases = buildProfile([...keywords, name]).phrases;
  if (rulePhraseCache.size > 1000) rulePhraseCache.clear();
  rulePhraseCache.set(key, phrases);
  return phrases;
}

/** Score de correspondance d'un mot-clé (tokens consécutifs) dans un libellé. */
function phraseScore(phrase: readonly string[], tokens: readonly string[]): number {
  const first = phrase[0];
  if (first === undefined) return 0;
  if (phrase.length === 1) {
    let best = 0;
    for (const t of tokens) {
      if (t === first) return 1;
      if (first.length >= 5 && t.startsWith(first)) best = Math.max(best, 0.5);
    }
    return best;
  }
  for (let i = 0; i + phrase.length <= tokens.length; i++) {
    let all = true;
    for (let j = 0; j < phrase.length; j++) {
      if (tokens[i + j] !== phrase[j]) {
        all = false;
        break;
      }
    }
    if (all) return phrase.length;
  }
  return 0;
}

/** Score des règles par mots-clés pour une catégorie (0 = aucune correspondance). */
export function ruleScore(categoryName: string, label: string): number {
  const tokens = tokenize(label).map(stem);
  return ruleScoreTokens(categoryName, tokens);
}

function ruleScoreTokens(categoryName: string, tokens: readonly string[]): number {
  if (tokens.length === 0) return 0;
  let score = 0;
  for (const phrase of rulePhrases(categoryName)) score += phraseScore(phrase, tokens);
  return score;
}

// ───────────────────────── Entraînement ─────────────────────────

function emptyModel(): CategorizerModel {
  return {
    version: CATEGORIZER_VERSION,
    alpha: ALPHA,
    docCount: {},
    tokenCount: {},
    totalTokens: {},
    vocabularySize: 0,
    merchantMap: {},
    sampleCount: 0,
  };
}

function computeVocabulary(tokenCount: Record<string, Record<string, number>>): number {
  const vocab = new Set<string>();
  for (const counts of Object.values(tokenCount)) for (const k of Object.keys(counts)) vocab.add(k);
  return vocab.size;
}

/** Élague les features rares (fréquence totale < 2) si le vocabulaire dépasse le plafond. */
export function pruneModel(
  model: CategorizerModel,
  maxVocabulary = MAX_VOCABULARY,
): CategorizerModel {
  if (model.vocabularySize <= maxVocabulary) return model;
  const freq = new Map<string, number>();
  for (const counts of Object.values(model.tokenCount)) {
    for (const [k, v] of Object.entries(counts)) freq.set(k, (freq.get(k) ?? 0) + v);
  }
  const tokenCount: Record<string, Record<string, number>> = {};
  const totalTokens: Record<string, number> = {};
  for (const [cat, counts] of Object.entries(model.tokenCount)) {
    const kept: Record<string, number> = {};
    let total = 0;
    for (const [k, v] of Object.entries(counts)) {
      if ((freq.get(k) ?? 0) >= 2) {
        kept[k] = v;
        total += v;
      }
    }
    tokenCount[cat] = kept;
    totalTokens[cat] = total;
  }
  return { ...model, tokenCount, totalTokens, vocabularySize: computeVocabulary(tokenCount) };
}

/** Entraîne un modèle à partir d'échantillons confirmés (les virements sont ignorés). */
export function trainCategorizer(samples: TrainingSample[]): CategorizerModel {
  const model = emptyModel();
  for (const s of samples) {
    if (s.type === 'TRANSFER' || s.categoryId === '') continue;
    const features = extractFeatures(s.label, s.amount, s.type);
    const counts = (model.tokenCount[s.categoryId] ??= {});
    let added = 0;
    for (const [k, w] of features) {
      counts[k] = (counts[k] ?? 0) + w;
      added += w;
    }
    model.docCount[s.categoryId] = (model.docCount[s.categoryId] ?? 0) + 1;
    model.totalTokens[s.categoryId] = (model.totalTokens[s.categoryId] ?? 0) + added;
    model.sampleCount++;
  }
  model.vocabularySize = computeVocabulary(model.tokenCount);
  return pruneModel(model);
}

function featureInAnyCategory(
  tokenCount: Record<string, Record<string, number>>,
  key: string,
): boolean {
  for (const counts of Object.values(tokenCount)) if ((counts[key] ?? 0) > 0) return true;
  return false;
}

/**
 * Apprend une correction de l'utilisateur, sans modifier `model` (renvoie un nouveau modèle).
 * Retire les comptes de l'ancienne catégorie, ajoute ceux de la nouvelle avec un poids de 3
 * et associe le marchand à la nouvelle catégorie. Coût en O(nombre de features).
 */
export function learnCorrection(
  model: CategorizerModel,
  sample: TrainingSample,
  previousCategoryId: string | null,
): CategorizerModel {
  if (sample.type === 'TRANSFER' || sample.categoryId === '') return model;
  const features = extractFeatures(sample.label, sample.amount, sample.type);
  const tokenCount = { ...model.tokenCount };
  const totalTokens = { ...model.totalTokens };
  const docCount = { ...model.docCount };
  const touched = new Set<string>(features.keys());
  let vocabularySize = model.vocabularySize;
  const wasKnown = new Map<string, boolean>();
  for (const k of touched) wasKnown.set(k, featureInAnyCategory(model.tokenCount, k));

  const moved =
    previousCategoryId !== null &&
    previousCategoryId !== sample.categoryId &&
    Object.hasOwn(model.tokenCount, previousCategoryId);
  if (moved) {
    const prev = { ...(model.tokenCount[previousCategoryId] ?? {}) };
    let removed = 0;
    for (const [k, w] of features) {
      const current = prev[k] ?? 0;
      if (current <= 0) continue;
      const next = Math.max(0, current - w);
      removed += current - next;
      if (next === 0) delete prev[k];
      else prev[k] = next;
    }
    tokenCount[previousCategoryId] = prev;
    totalTokens[previousCategoryId] = Math.max(0, (totalTokens[previousCategoryId] ?? 0) - removed);
    docCount[previousCategoryId] = Math.max(0, (docCount[previousCategoryId] ?? 0) - 1);
  }

  const reinforcement = previousCategoryId === sample.categoryId ? 1 : CORRECTION_WEIGHT;
  const next = { ...(model.tokenCount[sample.categoryId] ?? {}) };
  let added = 0;
  for (const [k, w] of features) {
    next[k] = (next[k] ?? 0) + w * reinforcement;
    added += w * reinforcement;
  }
  tokenCount[sample.categoryId] = next;
  totalTokens[sample.categoryId] = (totalTokens[sample.categoryId] ?? 0) + added;
  docCount[sample.categoryId] = (docCount[sample.categoryId] ?? 0) + 1;

  for (const k of touched) {
    const known = featureInAnyCategory(tokenCount, k);
    const before = wasKnown.get(k) ?? false;
    if (known && !before) vocabularySize++;
    if (!known && before) vocabularySize--;
  }

  const key = merchantKey(sample.label);
  const merchantMap =
    key === '' ? model.merchantMap : { ...model.merchantMap, [key]: sample.categoryId };

  return pruneModel({
    ...model,
    docCount,
    tokenCount,
    totalTokens,
    vocabularySize,
    merchantMap,
    sampleCount: moved ? model.sampleCount : model.sampleCount + 1,
  });
}

// ───────────────────────── Prédiction ─────────────────────────

function kindFor(type: TransactionType): CategoryKind | null {
  if (type === 'EXPENSE') return 'EXPENSE';
  if (type === 'INCOME') return 'INCOME';
  return null;
}

interface Posterior {
  categoryId: string;
  p: number;
  /** Un mot ou un bigramme du libellé a déjà été vu dans cette catégorie, ou la moitié des trigrammes du marchand. */
  evidence: boolean;
}

/** Posteriors du naïf bayésien (log-espace + softmax stable), triés par probabilité décroissante. */
export function posteriors(
  model: CategorizerModel,
  input: CategorizeInput,
  candidates: readonly AiCategory[],
): Posterior[] {
  const features = extractFeatures(input.label, input.amount, input.type);
  const coldWeight = Math.max(0, 1 - model.sampleCount / COLD_START_SAMPLES);
  const vocab = Math.max(1, model.vocabularySize + (coldWeight > 0 ? KEYWORD_VOCABULARY : 0));
  const alpha = model.alpha > 0 ? model.alpha : ALPHA;

  interface Scored {
    category: AiCategory;
    docs: number;
    counts: Record<string, number>;
    total: number;
    kw: KeywordProfile | undefined;
  }
  const scored: Scored[] = [];
  for (const category of candidates) {
    const kw = coldWeight > 0 ? KEYWORD_PROFILES.get(nameKey(category.name)) : undefined;
    const docs = (model.docCount[category.id] ?? 0) + (kw ? coldWeight : 0);
    if (docs <= 0) continue;
    const counts = model.tokenCount[category.id] ?? {};
    const total = (model.totalTokens[category.id] ?? 0) + (kw ? coldWeight * kw.total : 0);
    scored.push({ category, docs, counts, total, kw });
  }
  if (scored.length === 0) return [];

  const countOf = (s: Scored, k: string) =>
    (s.counts[k] ?? 0) + (s.kw ? coldWeight * (s.kw.counts.get(k) ?? 0) : 0);

  // Les features inconnues de toutes les catégories candidates sont ignorées.
  const known: [string, number][] = [];
  for (const [k, n] of features) if (scored.some((s) => countOf(s, k) > 0)) known.push([k, n]);
  const trigramTotal = [...features.keys()].filter((k) => k.startsWith('c:')).length;

  const logScores = scored.map((s) => {
    let score = Math.log(s.docs);
    const denom = s.total + alpha * vocab;
    for (const [k, n] of known) score += n * Math.log((countOf(s, k) + alpha) / denom);
    return score;
  });
  const max = Math.max(...logScores);
  const exps = logScores.map((v) => Math.exp(v - max));
  const z = exps.reduce((a, b) => a + b, 0);

  const out: Posterior[] = scored.map((s, i) => {
    let wordHit = false;
    let trigramHits = 0;
    for (const [k] of known) {
      if (countOf(s, k) <= 0) continue;
      if (k.startsWith('w:') || k.startsWith('b:')) wordHit = true;
      else if (k.startsWith('c:')) trigramHits++;
    }
    const evidence = wordHit || (trigramTotal > 0 && trigramHits / trigramTotal >= 0.5);
    return { categoryId: s.category.id, p: (exps[i] ?? 0) / z, evidence };
  });
  return out.sort((a, b) => b.p - a.p || a.categoryId.localeCompare(b.categoryId));
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function alternativesFrom(post: readonly Posterior[], chosen: string) {
  return post
    .filter((p) => p.categoryId !== chosen && p.p >= 0.01)
    .slice(0, MAX_ALTERNATIVES)
    .map((p) => ({ categoryId: p.categoryId, confidence: round3(p.p) }));
}

/**
 * Prédit une catégorie du même sens que la transaction. Cascade : marchand corrigé (0,98)
 * → modèle (p ≥ 0,6 et écart ≥ 0,15) → règles par mots-clés (0,7) → null.
 * `model` null : seules les règles de démarrage s'appliquent. Un virement renvoie null.
 */
export function categorize(
  model: CategorizerModel | null,
  input: CategorizeInput,
  categories: AiCategory[],
): CategoryPrediction | null {
  const kind = kindFor(input.type);
  if (kind === null) return null;
  const candidates = categories.filter((c) => c.kind === kind);
  if (candidates.length === 0 || input.label.trim() === '') return null;
  const byId = new Map(candidates.map((c) => [c.id, c]));

  const post = model ? posteriors(model, input, candidates) : [];

  // 1. Marchand corrigé par l'utilisateur
  if (model) {
    const key = merchantKey(input.label);
    if (key !== '' && Object.hasOwn(model.merchantMap, key)) {
      const id = model.merchantMap[key];
      if (id !== undefined && byId.has(id)) {
        return {
          categoryId: id,
          confidence: MERCHANT_CONFIDENCE,
          source: 'MERCHANT',
          alternatives: alternativesFrom(post, id),
        };
      }
    }
  }

  // 2. Modèle
  const [best, second] = post;
  if (best && best.evidence) {
    const margin = best.p - (second?.p ?? 0);
    if (best.p >= MODEL_MIN_CONFIDENCE && margin >= MODEL_MIN_MARGIN) {
      return {
        categoryId: best.categoryId,
        confidence: round3(best.p),
        source: 'MODEL',
        alternatives: alternativesFrom(post, best.categoryId),
      };
    }
  }

  // 3. Règles par mots-clés (par nom de catégorie)
  const tokens = tokenize(input.label).map(stem);
  const rules = candidates
    .map((c) => ({ id: c.id, score: ruleScoreTokens(c.name, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  const top = rules[0];
  if (top) {
    const alternatives =
      post.length > 0
        ? alternativesFrom(post, top.id)
        : rules
            .slice(1, 1 + MAX_ALTERNATIVES)
            .map((r) => ({
              categoryId: r.id,
              confidence: round3((RULE_CONFIDENCE * r.score) / (2 * top.score)),
            }));
    return { categoryId: top.id, confidence: RULE_CONFIDENCE, source: 'RULE', alternatives };
  }
  return null;
}
