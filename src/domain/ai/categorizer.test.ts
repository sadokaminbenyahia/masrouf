import { describe, expect, it } from 'vitest';
import {
  CATEGORIZER_VERSION,
  capMerchants,
  categorize,
  extractFeatures,
  learnCorrection,
  learnCorrections,
  MAX_MERCHANTS,
  pruneModel,
  ruleScore,
  trainCategorizer,
} from './categorizer';
import { CATEGORY_KEYWORDS } from './keywords';
import { merchantKey } from './text';
import { DEFAULT_TEST_CATEGORIES, categoryId, categoryKind } from './__fixtures__/categories';
import { LABELED_LABELS } from './__fixtures__/labeled-labels';
import type { TrainingSample } from './types';

const samples: TrainingSample[] = LABELED_LABELS.map(([label, dinars, name]) => ({
  label,
  amount: Math.round(dinars * 1000),
  type: categoryKind(name),
  categoryId: categoryId(name),
}));

/** Découpage déterministe 70/30 : 7 premiers éléments de chaque dizaine en entraînement. */
const train = samples.filter((_, i) => i % 10 < 7);
const test = samples.filter((_, i) => i % 10 >= 7);

function accuracy(model: ReturnType<typeof trainCategorizer> | null, set: TrainingSample[]) {
  let correct = 0;
  for (const s of set) {
    const p = categorize(model, s, DEFAULT_TEST_CATEGORIES);
    if (p?.categoryId === s.categoryId) correct++;
  }
  return correct / set.length;
}

describe('jeu de référence', () => {
  it('contient au moins 150 libellés couvrant toutes les catégories par défaut', () => {
    expect(LABELED_LABELS.length).toBeGreaterThanOrEqual(150);
    const names = new Set(LABELED_LABELS.map((l) => l[2]));
    for (const c of DEFAULT_TEST_CATEGORIES) expect(names.has(c.name)).toBe(true);
    for (const name of Object.keys(CATEGORY_KEYWORDS)) expect(() => categoryId(name)).not.toThrow();
  });
});

describe('trainCategorizer', () => {
  it('produit un modèle sérialisable et cohérent', () => {
    const model = trainCategorizer(train);
    expect(model.version).toBe(CATEGORIZER_VERSION);
    expect(model.sampleCount).toBe(train.length);
    expect(model.vocabularySize).toBeGreaterThan(50);
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
    const docs = Object.values(model.docCount).reduce((a, b) => a + b, 0);
    expect(docs).toBe(train.length);
  });

  it('ignore les virements', () => {
    const model = trainCategorizer([
      { label: 'Retrait DAB', amount: 100_000, type: 'TRANSFER', categoryId: 'x' },
    ]);
    expect(model.sampleCount).toBe(0);
    expect(model.vocabularySize).toBe(0);
  });

  it('atteint une exactitude ≥ 0,85 en validation (70/30)', () => {
    const model = trainCategorizer(train);
    const acc = accuracy(model, test);
    expect(acc).toBeGreaterThanOrEqual(0.85);
  });

  it('les règles seules (démarrage à froid) donnent déjà une bonne exactitude', () => {
    expect(accuracy(null, samples)).toBeGreaterThanOrEqual(0.8);
  });

  it('élague le vocabulaire au-delà du plafond', () => {
    const model = trainCategorizer(train);
    const pruned = pruneModel(model, 10);
    expect(pruned.vocabularySize).toBeLessThan(model.vocabularySize);
    for (const counts of Object.values(pruned.tokenCount)) {
      for (const v of Object.values(counts)) expect(v).toBeGreaterThan(0);
    }
    expect(pruneModel(model)).toBe(model);
  });
});

describe('categorize', () => {
  const model = trainCategorizer(samples);

  it('respecte le sens de la transaction', () => {
    const p = categorize(
      model,
      { label: 'Remboursement Sami', amount: 150_000, type: 'INCOME' },
      DEFAULT_TEST_CATEGORIES,
    );
    expect(p?.categoryId).toBe(categoryId('Autres revenus'));
    const e = categorize(
      model,
      { label: 'Netflix', amount: 39_000, type: 'EXPENSE' },
      DEFAULT_TEST_CATEGORIES,
    );
    expect(e?.categoryId).toBe(categoryId('Abonnements'));
    expect(
      categorize(model, { label: 'Netflix', amount: 1, type: 'TRANSFER' }, DEFAULT_TEST_CATEGORIES),
    ).toBeNull();
  });

  it('renvoie null quand rien ne correspond', () => {
    expect(
      categorize(
        model,
        { label: 'zzqx wywy', amount: 5_000, type: 'EXPENSE' },
        DEFAULT_TEST_CATEGORIES,
      ),
    ).toBeNull();
    expect(
      categorize(null, { label: 'zzqx', amount: 5_000, type: 'EXPENSE' }, DEFAULT_TEST_CATEGORIES),
    ).toBeNull();
    expect(
      categorize(model, { label: '  ', amount: 5_000, type: 'EXPENSE' }, DEFAULT_TEST_CATEGORIES),
    ).toBeNull();
    expect(
      categorize(model, { label: 'Carrefour', amount: 5_000, type: 'EXPENSE' }, []),
    ).toBeNull();
  });

  it('tolère les fautes de frappe sur un marchand connu (trigrammes)', () => {
    const p = categorize(
      model,
      { label: 'CARFOUR MARSA', amount: 60_000, type: 'EXPENSE' },
      DEFAULT_TEST_CATEGORIES,
    );
    expect(p?.categoryId).toBe(categoryId('Courses'));
  });

  it('source MODEL avec alternatives, confiance dans [0, 1]', () => {
    const p = categorize(
      model,
      { label: 'Monoprix Lac', amount: 40_000, type: 'EXPENSE' },
      DEFAULT_TEST_CATEGORIES,
    );
    expect(p?.source).toBe('MODEL');
    expect(p?.confidence).toBeGreaterThanOrEqual(0.6);
    expect(p?.confidence).toBeLessThanOrEqual(1);
    for (const a of p?.alternatives ?? []) expect(a.categoryId).not.toBe(p?.categoryId);
  });

  it('règles RULE à froid, par nom de catégorie (ids quelconques)', () => {
    const cats = [
      { id: 'zz1', name: 'Carburant', kind: 'EXPENSE' as const },
      { id: 'zz2', name: 'Courses', kind: 'EXPENSE' as const },
      { id: 'zz3', name: 'Voyage', kind: 'EXPENSE' as const },
    ];
    const p = categorize(null, { label: 'STAR OIL', amount: 40_000, type: 'EXPENSE' }, cats);
    expect(p).toMatchObject({ categoryId: 'zz1', source: 'RULE', confidence: 0.7 });
    const v = categorize(null, { label: 'Voyage Djerba', amount: 400_000, type: 'EXPENSE' }, cats);
    expect(v?.categoryId).toBe('zz3');
  });

  it("n'utilise pas une catégorie sans données pour le modèle", () => {
    const tiny = trainCategorizer([
      { label: 'Salaire', amount: 2_000_000, type: 'INCOME', categoryId: categoryId('Salaire') },
    ]);
    const cats = [
      ...DEFAULT_TEST_CATEGORIES,
      { id: 'new', name: 'Location Airbnb', kind: 'INCOME' as const },
    ];
    const p = categorize(
      tiny,
      { label: 'Virement inconnu xyz', amount: 300_000, type: 'INCOME' },
      cats,
    );
    expect(p).toBeNull();
  });
});

describe('learnCorrection', () => {
  it('une correction change la prédiction suivante, sans muter le modèle', () => {
    const model = trainCategorizer(train);
    const snapshot = JSON.stringify(model);
    const input = { label: 'Pâtisserie Masmoudi', amount: 35_000, type: 'EXPENSE' as const };
    const before = categorize(model, input, DEFAULT_TEST_CATEGORIES);
    expect(before?.categoryId).toBe(categoryId('Cafés'));

    const target = categoryId('Famille & cadeaux');
    const next = learnCorrection(
      model,
      { ...input, categoryId: target },
      before?.categoryId ?? null,
    );
    expect(JSON.stringify(model)).toBe(snapshot);
    const after = categorize(next, input, DEFAULT_TEST_CATEGORIES);
    expect(after).toMatchObject({ categoryId: target, source: 'MERCHANT', confidence: 0.98 });
    expect(next.merchantMap['patisserie masmoudi']).toBe(target);
    expect(next.sampleCount).toBe(model.sampleCount);
  });

  it('ajoute un nouvel échantillon quand la catégorie précédente est inconnue', () => {
    const model = trainCategorizer(train);
    const next = learnCorrection(
      model,
      {
        label: 'Kiosque journaux',
        amount: 2_000,
        type: 'EXPENSE',
        categoryId: categoryId('Divers'),
      },
      null,
    );
    expect(next.sampleCount).toBe(model.sampleCount + 1);
    expect(next.vocabularySize).toBeGreaterThan(model.vocabularySize);
    const counts = next.tokenCount[categoryId('Divers')] ?? {};
    expect(counts['w:kiosque']).toBe(3);
  });

  it('retire les comptes de la catégorie précédente', () => {
    const s = {
      label: 'Agil',
      amount: 50_000,
      type: 'EXPENSE' as const,
      categoryId: categoryId('Carburant'),
    };
    const model = trainCategorizer([s]);
    const next = learnCorrection(
      model,
      { ...s, categoryId: categoryId('Transport') },
      s.categoryId,
    );
    expect(next.tokenCount[s.categoryId]?.['w:agil']).toBeUndefined();
    expect(next.docCount[s.categoryId]).toBe(0);
    expect(next.totalTokens[s.categoryId]).toBe(0);
  });

  it('ignore les virements et renforce une catégorie confirmée', () => {
    const model = trainCategorizer(train);
    expect(
      learnCorrection(model, { label: 'x', amount: 1, type: 'TRANSFER', categoryId: 'a' }, null),
    ).toBe(model);
    const c = categoryId('Courses');
    const next = learnCorrection(
      model,
      { label: 'Aziza', amount: 10_000, type: 'EXPENSE', categoryId: c },
      c,
    );
    expect((next.tokenCount[c]?.['w:aziza'] ?? 0) - (model.tokenCount[c]?.['w:aziza'] ?? 0)).toBe(
      1,
    );
  });
});

describe('learnCorrections (lot)', () => {
  it('équivaut à des corrections successives, sans muter le modèle', () => {
    const model = trainCategorizer(train);
    const snapshot = JSON.stringify(model);
    const items = [
      {
        sample: {
          label: 'Pâtisserie Masmoudi',
          amount: 35_000,
          type: 'EXPENSE' as const,
          categoryId: categoryId('Famille & cadeaux'),
        },
        previousCategoryId: categoryId('Cafés'),
      },
      {
        sample: {
          label: 'Kiosque journaux',
          amount: 2_000,
          type: 'EXPENSE' as const,
          categoryId: categoryId('Divers'),
        },
        previousCategoryId: null,
      },
      {
        sample: { label: 'Retrait', amount: 1, type: 'TRANSFER' as const, categoryId: 'x' },
        previousCategoryId: null,
      },
    ];
    const batch = learnCorrections(model, items);
    let sequential = model;
    for (const i of items) sequential = learnCorrection(sequential, i.sample, i.previousCategoryId);
    expect(JSON.stringify(model)).toBe(snapshot);
    expect(batch).toEqual(sequential);
    expect(batch.sampleCount).toBe(model.sampleCount + 1);
  });

  it('lot vide ou uniquement des virements : modèle inchangé (même référence)', () => {
    const model = trainCategorizer(train);
    expect(learnCorrections(model, [])).toBe(model);
    expect(
      learnCorrections(model, [
        {
          sample: { label: 'x', amount: 1, type: 'TRANSFER', categoryId: 'a' },
          previousCategoryId: null,
        },
      ]),
    ).toBe(model);
  });

  it('plafonne la table marchand en évinçant les associations les plus anciennes', () => {
    const model = trainCategorizer(train);
    const letter = (n: number) => String.fromCharCode(97 + (n % 26));
    const label = (i: number) =>
      `Boutique ${letter(i)}${letter(Math.floor(i / 26))}${letter(Math.floor(i / 676))}`;
    const items = Array.from({ length: MAX_MERCHANTS + 50 }, (_, i) => ({
      sample: {
        label: label(i),
        amount: 10_000,
        type: 'EXPENSE' as const,
        categoryId: categoryId('Divers'),
      },
      previousCategoryId: null,
    }));
    const next = learnCorrections(model, items);
    const keys = Object.keys(next.merchantMap);
    expect(keys.length).toBe(MAX_MERCHANTS);
    // La plus récente est conservée, la plus ancienne évincée.
    expect(keys).toContain(merchantKey(label(MAX_MERCHANTS + 49)));
    expect(keys).not.toContain(merchantKey(label(0)));
  });

  it('une association corrigée de nouveau devient la plus récente', () => {
    const map = { alpha: 'c1', beta: 'c2', gamma: 'c3' };
    const base = { ...trainCategorizer(train), merchantMap: map };
    const divers = categoryId('Divers');
    const next = learnCorrections(base, [
      {
        sample: { label: 'Alpha', amount: 1_000, type: 'EXPENSE', categoryId: divers },
        previousCategoryId: null,
      },
    ]);
    expect(Object.keys(next.merchantMap)).toEqual(['beta', 'gamma', 'alpha']);
    expect(capMerchants(next, 2).merchantMap).toEqual({ gamma: 'c3', alpha: divers });
    expect(capMerchants(next)).toBe(next);
  });

  it('élague le vocabulaire sous le plafond même si toutes les features sont fréquentes', () => {
    const model = trainCategorizer([...train, ...train]);
    const pruned = pruneModel(model, 50);
    expect(pruned.vocabularySize).toBeLessThanOrEqual(50);
    expect(pruned.vocabularySize).toBeGreaterThan(0);
  });
});

describe('features et règles', () => {
  it('extrait mots, bigrammes, trigrammes, montant et sens', () => {
    const f = extractFeatures('Carrefour Market', 87_250, 'EXPENSE');
    expect(f.get('w:carrefour')).toBe(1);
    expect(f.get('b:carrefour market')).toBe(1);
    expect(f.get('c:#ca')).toBe(0.5);
    expect(f.get('a:6')).toBe(1);
    expect(f.get('d:out')).toBe(1);
    expect(extractFeatures('x', 0, 'INCOME').get('d:in')).toBe(1);
  });

  it('les expressions de plusieurs mots priment', () => {
    expect(ruleScore('Courses', 'eau minérale')).toBeGreaterThan(
      ruleScore('Factures', 'eau minérale'),
    );
    expect(ruleScore('Restaurants', 'Baguette & Baguette')).toBeGreaterThan(
      ruleScore('Courses', 'Baguette & Baguette'),
    );
    expect(ruleScore('Courses', '')).toBe(0);
  });
});
