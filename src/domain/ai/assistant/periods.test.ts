import { describe, expect, it } from 'vitest';
import { normalizeQuestion } from './normalize';
import { labelForRange, parsePeriod, parsePeriods, previousPeriod } from './periods';
import { extractQuestionAmount, matchCategory, matchGoal } from './entities';
import { detectIntent } from './intents';

const T = '2026-03-18'; // mercredi
const p = (q: string, today = T) => parsePeriod(normalizeQuestion(q), today);

describe('parsePeriod', () => {
  it.each([
    ['avant-hier', '2026-03-16', '2026-03-16', 'avant-hier'],
    ['cette semaine', '2026-03-16', '2026-03-22', 'cette semaine'],
    ['la semaine dernière', '2026-03-09', '2026-03-15', 'la semaine dernière'],
    ['le week-end dernier', '2026-03-14', '2026-03-15', 'le week-end dernier'],
    ['depuis le début du mois', '2026-03-01', '2026-03-18', 'depuis le début du mois'],
    ['le trimestre dernier', '2025-10-01', '2025-12-31', 'le trimestre dernier'],
    ['l’année dernière', '2025-01-01', '2025-12-31', "l'an dernier"],
    ['en 2024', '2024-01-01', '2024-12-31', 'en 2024'],
    ['depuis le début de l’année', '2026-01-01', '2026-03-18', "depuis le début de l'année"],
    ['sur 6 mois', '2025-09-19', '2026-03-18', 'les 6 derniers mois'],
    ['le dernier mois', '2026-03-01', '2026-03-31', 'ce mois-ci'],
    ['les trois derniers mois', '2025-12-19', '2026-03-18', 'les 3 derniers mois'],
    ['les 7 derniers jours', '2026-03-12', '2026-03-18', 'les 7 derniers jours'],
    ['depuis le 15 février', '2026-02-15', '2026-03-18', 'depuis le 15 février 2026'],
    ['depuis octobre', '2025-10-01', '2026-03-18', 'depuis octobre 2025'],
    ['depuis mars', '2026-03-01', '2026-03-18', 'depuis mars'],
    ['le 12 mars', '2026-03-12', '2026-03-12', 'le 12 mars 2026'],
    ['le 05/01', '2026-01-05', '2026-01-05', 'le 5 janvier 2026'],
    ['du 20 décembre au 5 janvier', '2025-12-20', '2026-01-05', 'du 20 décembre 2025 au 5 janvier 2026'],
    ['du 3 février au 10 mars', '2026-02-03', '2026-03-10', 'du 3 février au 10 mars 2026'],
    ['entre le 10 et le 3 mars', '2026-03-03', '2026-03-10', 'du 3 au 10 mars 2026'],
    ['du 01/02/2025 au 15/03/2025', '2025-02-01', '2025-03-15', 'du 1er février au 15 mars 2025'],
    ['en août', '2025-08-01', '2025-08-31', 'en août 2025'],
    ['rien de spécial', '2026-03-01', '2026-03-31', 'ce mois-ci'],
  ])('« %s »', (q, from, to, label) => {
    const r = p(q);
    expect([r.from, r.to, r.label]).toEqual([from, to, label]);
  });

  it('week-end vu depuis un samedi', () => {
    expect(p('ce week-end', '2026-03-21')).toMatchObject({ from: '2026-03-21', to: '2026-03-22' });
    expect(p('le week-end dernier', '2026-03-22')).toMatchObject({ from: '2026-03-14', to: '2026-03-15' });
  });

  it('rejette les valeurs invalides', () => {
    expect(p('le 31/13').unit).toBe('month');
    expect(p('depuis le 25 décembre 2030').label).not.toMatch(/depuis/);
    expect(p('depuis décembre 2030').label).toBe('en décembre 2030');
  });

  it('plusieurs périodes dans l’ordre du texte', () => {
    const list = parsePeriods(normalizeQuestion('en février par rapport à janvier'), T);
    expect(list.map((x) => x.label)).toEqual(['le mois dernier', 'en janvier 2026']);
  });
});

describe('labelForRange / previousPeriod', () => {
  it('libellés', () => {
    expect(labelForRange({ from: '2026-03-17', to: '2026-03-17' }, T)).toBe('hier');
    expect(labelForRange({ from: '2026-03-18', to: '2026-03-18' }, T)).toBe("aujourd'hui");
    expect(labelForRange({ from: '2025-07-01', to: '2025-09-30' }, T)).toBe('au 3e trimestre 2025');
    expect(labelForRange({ from: '2025-01-01', to: '2025-03-31' }, T)).toBe('au 1er trimestre 2025');
    expect(labelForRange({ from: '2024-01-01', to: '2024-12-31' }, T)).toBe('en 2024');
    expect(labelForRange({ from: '2026-01-01', to: '2026-12-31' }, T)).toBe('cette année');
    expect(labelForRange({ from: '2026-01-01', to: '2026-02-28' }, T)).toBe('du 1er janvier au 28 février 2026');
  });
  it('période précédente de même durée', () => {
    expect(previousPeriod({ from: '2026-01-01', to: '2026-03-31' }, T)).toMatchObject({
      from: '2025-10-01',
      to: '2025-12-31',
      label: 'le trimestre dernier',
    });
    expect(previousPeriod({ from: '2026-03-11', to: '2026-03-20' }, T)).toMatchObject({
      from: '2026-03-01',
      to: '2026-03-10',
    });
  });
});

describe('entités', () => {
  const cats = [
    { id: 'r', name: 'Restaurants', kind: 'EXPENSE' as const },
    { id: 'e', name: 'Éducation', kind: 'EXPENSE' as const },
    { id: 'c', name: 'Courses', kind: 'EXPENSE' as const },
    { id: 's', name: 'Salaire', kind: 'INCOME' as const },
  ];
  it('catégorie floue, synonymes, priorité et filtre de sens', () => {
    expect(matchCategory('combien en restaurnts', cats)?.category.id).toBe('r');
    expect(matchCategory('mes cours de langue', cats)?.category.id).toBe('e');
    expect(matchCategory('combien en salaire', cats, 'EXPENSE')).toBeNull();
    expect(matchCategory('combien en salaire', cats, 'INCOME')?.category.id).toBe('s');
    expect(matchCategory('quelle heure', cats)).toBeNull();
    expect(matchCategory('x', [], 'EXPENSE')).toBeNull();
  });
  it('objectif flou', () => {
    const goals = [
      { id: 'a', name: 'Voyage à Djerba' },
      { id: 'b', name: "Fonds d'urgence" },
    ];
    expect(matchGoal('mon objectif urgence', goals)?.goal.id).toBe('b');
    expect(matchGoal('objectif voyag', goals)?.goal.id).toBe('a');
    expect(matchGoal('mon objectif', goals)).toBeNull();
  });
  it('montants', () => {
    expect(extractQuestionAmount('un telephone a 900 dinars')).toBe(900_000);
    expect(extractQuestionAmount('un cafe a 3,500')).toBe(3_500);
    expect(extractQuestionAmount('500 millimes')).toBe(500);
    expect(extractQuestionAmount('1 200 dt')).toBe(1_200_000);
    expect(extractQuestionAmount('2k')).toBe(2_000_000);
    expect(extractQuestionAmount('dans 3 mois pour 450')).toBe(450_000);
    expect(extractQuestionAmount('9ahwa')).toBeNull();
    expect(extractQuestionAmount('rien')).toBeNull();
  });
  it('intention : seuil et classement', () => {
    expect(detectIntent('bonjour').intent).toBe('UNKNOWN');
    expect(detectIntent('le total').intent).toBe('UNKNOWN');
    expect(detectIntent('le total').ranking[0]?.intent).toBe('SPENDING_TOTAL');
    expect(detectIntent('courses', { hasCategory: true }).intent).toBe('UNKNOWN');
  });
});
