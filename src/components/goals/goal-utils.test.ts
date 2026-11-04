import { describe, expect, it } from 'vitest';
import type { GoalProgress } from '@/domain/types';
import {
  applyContribution,
  becameCompleted,
  contributionDelta,
  goalPercent,
  goalToInput,
  goalValueText,
  iconLabel,
  ringGeometry,
  sortGoalsByIds,
} from './goal-utils';

const DT = 1000;
const n = (s: string) => s.replace(/ /g, ' ');

function goal(extra: Partial<GoalProgress> = {}): GoalProgress {
  return {
    id: 'g1',
    name: 'Voyage à Djerba',
    targetAmount: 1500 * DT,
    savedAmount: 600 * DT,
    targetDate: '2027-04-01',
    icon: 'Plane',
    color: '#1F5FAD',
    sortOrder: 0,
    completedAt: null,
    ratio: 0.4,
    remaining: 900 * DT,
    monthlyNeeded: 180 * DT,
    monthsLeft: 5,
    status: 'ON_TRACK',
    ...extra,
  };
}

describe('progression', () => {
  it('pourcentage borné et texte accessible', () => {
    expect(goalPercent(goal())).toBe(40);
    expect(goalPercent(goal({ savedAmount: 2000 * DT }))).toBe(100);
    expect(goalPercent(goal({ targetAmount: 0 }))).toBe(0);
    expect(n(goalValueText(goal()))).toBe('600 DT sur 1 500 DT');
    expect(goalValueText(goal(), true)).toBe('40 % de la cible');
  });
  it("géométrie de l'anneau", () => {
    const { circumference, offset } = ringGeometry(0.25, 10);
    expect(circumference).toBeCloseTo(2 * Math.PI * 10);
    expect(offset).toBeCloseTo(circumference * 0.75);
    expect(ringGeometry(3, 10).offset).toBe(0);
  });
});

describe('versement optimiste', () => {
  it('met à jour épargné, reste et mensualité', () => {
    const g = applyContribution(goal(), 100 * DT);
    expect(g.savedAmount).toBe(700 * DT);
    expect(g.remaining).toBe(800 * DT);
    expect(g.monthlyNeeded).toBe(160 * DT);
    expect(g.status).toBe('ON_TRACK');
  });
  it("passe à « Atteint » et détecte l'atteinte", () => {
    const before = goal();
    const after = applyContribution(before, 900 * DT);
    expect(after.status).toBe('COMPLETED');
    expect(after.monthlyNeeded).toBeNull();
    expect(becameCompleted(before, after)).toBe(true);
    expect(becameCompleted(after, applyContribution(after, 10 * DT))).toBe(false);
  });
  it('un retrait sous la cible quitte « Atteint »', () => {
    const done = goal({ savedAmount: 1500 * DT, status: 'COMPLETED', targetDate: null });
    expect(applyContribution(done, -100 * DT).status).toBe('NO_DEADLINE');
    expect(applyContribution(done, -5000 * DT).savedAmount).toBe(0);
  });
});

describe('validation des versements', () => {
  it('signe le montant et refuse un retrait excessif', () => {
    expect(contributionDelta('deposit', 50 * DT, goal())).toEqual({ ok: true, delta: 50 * DT });
    expect(contributionDelta('withdraw', 50 * DT, goal())).toEqual({ ok: true, delta: -50 * DT });
    expect(contributionDelta('withdraw', 700 * DT, goal()).ok).toBe(false);
    expect(contributionDelta('withdraw', 1, goal({ savedAmount: 0 })).ok).toBe(false);
    expect(contributionDelta('deposit', 0, goal()).ok).toBe(false);
  });
});

describe('divers', () => {
  it('recrée un objectif supprimé avec ses valeurs', () => {
    expect(goalToInput(goal())).toEqual({
      name: 'Voyage à Djerba',
      targetAmount: 1500 * DT,
      savedAmount: 600 * DT,
      targetDate: '2027-04-01',
      icon: 'Plane',
      color: '#1F5FAD',
    });
  });
  it('réordonne et renumérote', () => {
    const list = [goal({ id: 'a' }), goal({ id: 'b' }), goal({ id: 'c' })];
    const sorted = sortGoalsByIds(list, ['b', 'c', 'a']);
    expect(sorted.map((g) => g.id)).toEqual(['b', 'c', 'a']);
    expect(sorted.map((g) => g.sortOrder)).toEqual([0, 1, 2]);
  });
  it('libellés d’icônes en français', () => {
    expect(iconLabel('PiggyBank')).toBe('Tirelire');
    expect(iconLabel('Inconnue')).toBe('Inconnue');
  });
});
