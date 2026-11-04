import { describe, expect, it } from 'vitest';
import { trainCategorizer } from './categorizer';
import { extractAmount, extractDate, foldKeepLength, parseEntry } from './nl-entry';
import { DEFAULT_TEST_CATEGORIES, categoryId } from './__fixtures__/categories';
import {
  NL_ACCOUNTS,
  NL_CASES,
  NL_FAILURES,
  NL_TODAY,
  REQUIRED_NL_CASES,
  type NlCase,
} from './__fixtures__/nl-entries';
import type { ParseEntryContext } from './types';

const ctx: ParseEntryContext = {
  today: NL_TODAY,
  categories: DEFAULT_TEST_CATEGORIES,
  accounts: NL_ACCOUNTS,
  model: null,
};

function mismatches(c: NlCase, context: ParseEntryContext = ctx): string[] {
  const r = parseEntry(c.text, context);
  if (!r.ok) return ['aucun résultat'];
  const e = r.entry;
  const out: string[] = [];
  if (e.amount !== c.amount) out.push(`montant ${e.amount}`);
  if (e.type !== c.type) out.push(`type ${e.type}`);
  if (e.date !== c.date) out.push(`date ${e.date}`);
  if (e.label !== c.label) out.push(`libellé « ${e.label} »`);
  if (c.category !== undefined && e.categoryId !== categoryId(c.category)) {
    out.push(`catégorie ${e.categoryId ?? 'null'}`);
  }
  if ((c.accountId ?? null) !== e.accountId) out.push(`compte ${e.accountId ?? 'null'}`);
  if (c.tags && JSON.stringify(c.tags) !== JSON.stringify(e.tags)) out.push('tags');
  return out;
}

describe('parseEntry : jeu de référence', () => {
  it('contient au moins 40 phrases', () => {
    expect(NL_CASES.length).toBeGreaterThanOrEqual(40);
  });

  it.each(REQUIRED_NL_CASES)('cas exigé : $text', (c) => {
    expect(mismatches(c)).toEqual([]);
  });

  it('réussit au moins 95 % des phrases', () => {
    const failed = NL_CASES.map((c) => ({ text: c.text, errors: mismatches(c) })).filter(
      (r) => r.errors.length > 0,
    );
    const rate = 1 - failed.length / NL_CASES.length;
    expect(rate, JSON.stringify(failed)).toBeGreaterThanOrEqual(0.95);
  });

  it('fonctionne aussi avec un modèle entraîné', () => {
    const model = trainCategorizer([
      { label: 'Café', amount: 2000, type: 'EXPENSE', categoryId: categoryId('Cafés') },
    ]);
    expect(mismatches(REQUIRED_NL_CASES[0] as NlCase, { ...ctx, model })).toEqual([]);
  });

  it.each(NL_FAILURES)('sans montant → erreur avec exemples : « %s »', (text) => {
    const r = parseEntry(text, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(/montant/);
      expect(r.examples.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('parseEntry : avertissements et cas limites', () => {
  it('signale un montant inhabituel et une date éloignée', () => {
    const r = parseEntry('voiture 25000 12/01', ctx);
    expect(r.ok && r.entry.warnings).toEqual([
      'Montant inhabituel : vérifiez-le.',
      'Date éloignée : vérifiez-la.',
    ]);
  });

  it('libellé par défaut quand il ne reste rien', () => {
    const r = parseEntry('50 dt hier', ctx);
    expect(r.ok && r.entry).toMatchObject({
      label: 'Dépense',
      categoryId: null,
      date: '2026-11-03',
    });
    const inc = parseEntry('+80', ctx);
    expect(inc.ok && inc.entry).toMatchObject({ label: 'Revenu', type: 'INCOME' });
  });

  it('compte sans compte du type demandé : null', () => {
    const r = parseEntry('taxi 7 en espèces', { ...ctx, accounts: [] });
    expect(r.ok && r.entry).toMatchObject({ accountId: null, label: 'Taxi' });
  });

  it('reconnaît un compte par son nom', () => {
    const r = parseEntry('loyer 750 biat', ctx);
    expect(r.ok && r.entry).toMatchObject({ accountId: 'acc_biat', label: 'Loyer' });
  });
});

describe('extractAmount', () => {
  it.each([
    ['3,500', 3500],
    ['3.5', 3500],
    ['2400', 2_400_000],
    ['500 millimes', 500],
    ['1 200', 1_200_000],
    ['1 200,5 dt', 1_200_500],
    ['12 dt', 12_000],
    ['45 dinars', 45_000],
    ['750 m', 750],
  ])('« %s » → %i', (text, expected) => {
    expect(extractAmount(text)?.amount).toBe(expected);
  });

  it('ignore les nombres collés aux lettres et les dates', () => {
    expect(extractAmount('9ahwa')).toBeNull();
    expect(extractAmount('le 15')).toBeNull();
    expect(extractAmount('le 1er')).toBeNull();
    expect(extractAmount('12/03')).toBeNull();
    expect(extractAmount('0')).toBeNull();
  });

  it('préfère le nombre avec unité, puis avec décimales, puis le plus grand', () => {
    expect(extractAmount('2 pizzas 30 dt et 3')?.amount).toBe(30_000);
    expect(extractAmount('pack 6 eau 4,800')?.amount).toBe(4800);
    expect(extractAmount('2 pizzas 30')?.amount).toBe(30_000);
  });

  it('renvoie la position dans le texte d’origine', () => {
    const m = extractAmount('Café 3,500 dt hier');
    expect(m).toEqual({ amount: 3500, start: 5, end: 13 });
  });
});

describe('extractDate', () => {
  const today = NL_TODAY; // mercredi
  it.each([
    ["aujourd'hui", today],
    ['hier', '2026-11-03'],
    ['avant-hier', '2026-11-02'],
    ['il y a 10 jours', '2026-10-25'],
    ['il y a deux semaines', '2026-10-21'],
    ['mercredi', '2026-10-28'],
    ['mardi dernier', '2026-11-03'],
    ['le 1er', '2026-11-01'],
    ['le 4', today],
    ['le 15', '2026-10-15'],
    ['12/03', '2026-03-12'],
    ['25/12', '2025-12-25'],
    ['12/03/2025', '2025-03-12'],
    ['01-02-26', '2026-02-01'],
    ['12.03.2026', '2026-03-12'],
    ['12 mars', '2026-03-12'],
    ['1er décembre', '2025-12-01'],
    ['3 févr. 2024', '2024-02-03'],
  ])('« %s » → %s', (text, expected) => {
    expect(extractDate(text, today)?.date).toBe(expected);
  });

  it('remonte au mois précédent qui contient le jour demandé', () => {
    expect(extractDate('le 31', '2026-03-15')?.date).toBe('2026-01-31');
  });

  it('ignore les dates invalides', () => {
    expect(extractDate('31/02', today)).toBeNull();
    expect(extractDate('rien', today)).toBeNull();
    expect(extractDate('le 45', today)).toBeNull();
  });

  it('donne la position de l’expression', () => {
    expect(extractDate('café hier', today)).toEqual({ date: '2026-11-03', start: 5, end: 9 });
  });
});

describe('foldKeepLength', () => {
  it('conserve la longueur', () => {
    const s = 'Été — «Ça» œuvre’s 😀';
    expect(foldKeepLength(s)).toHaveLength(s.length);
    expect(foldKeepLength('Pâtisserie')).toBe('patisserie');
  });
});
